import { create } from 'zustand'
import { isNative, bridge, registerBridgeListener } from '@/bridge'
import { ttsSpeak, ttsStop, isTTSSupported } from '@/hooks/useTTS'

export interface AutoPlaySegment {
  text: string
  lang: string
}

export interface AutoPlayItem {
  term: string
  caption: string
  // 이 항목을 재생할 때 실제로 읽는 내용(순서대로) — 보통 단어→뜻→설명→예문
  // (web/src/lib/autoplaySegments.ts의 buildAutoPlaySegments 참고). 세그먼트마다 언어가 다를 수
  // 있다(단어/예문은 원어, 뜻/설명은 한국어).
  segments: AutoPlaySegment[]
}

interface AutoPlayStartOptions {
  gapMs?: number
  startIndex?: number
}

interface AutoplayState {
  items: AutoPlayItem[]
  active: boolean
  playing: boolean
  index: number
  gapMs: number
  isSupported: boolean
  start: (items: AutoPlayItem[], opts?: AutoPlayStartOptions) => void
  toggle: () => void
  next: () => void
  previous: () => void
  close: () => void
}

// 재생 도중 seek/pause/toggle이 끼어들면 그 이전에 예약된 onEnd/setTimeout 콜백이 뒤늦게 실행되며
// 인덱스를 또 진행시키는 경합이 생길 수 있다(연타 시 "말이 빨라지는" 버그의 원인) — 매 조작마다
// 세대 값을 올리고, 지연 콜백은 자기 세대가 최신일 때만 동작하게 해서 막는다.
let gen = 0
let gapTimer: ReturnType<typeof setTimeout> | undefined

// 한 단어 안에서 세그먼트(단어→뜻→설명→예문) 사이의 짧은 틈. 단어와 단어 사이의 gapMs보다 짧다.
const SEGMENT_GAP_MS = 350

function clearGapTimer() {
  if (gapTimer) {
    clearTimeout(gapTimer)
    gapTimer = undefined
  }
}

// 웹(브라우저) 전용 순차 재생 스케줄러 — 네이티브는 브리지로 시퀀싱을 위임한다(아래 start/toggle/
// next/previous의 isNative() 분기 참고). 한 항목의 세그먼트를 전부 읽은 뒤에야 다음 항목으로 넘어간다.
function scheduleWebSpeak() {
  const { active, playing, items, index, gapMs } = useAutoplayStore.getState()
  if (isNative() || !active || !playing) return
  if (index >= items.length) {
    useAutoplayStore.setState({ active: false, playing: false, index: 0 })
    return
  }
  const myGen = ++gen
  const segments = items[index].segments

  const speakSegment = (segIndex: number) => {
    if (gen !== myGen) return
    if (segIndex >= segments.length) {
      gapTimer = setTimeout(() => {
        if (gen !== myGen) return
        useAutoplayStore.setState((s) => ({ index: s.index + 1 }))
        scheduleWebSpeak()
      }, gapMs)
      return
    }
    ttsSpeak(segments[segIndex].text, segments[segIndex].lang, () => {
      if (gen !== myGen) return
      gapTimer = setTimeout(() => {
        if (gen !== myGen) return
        speakSegment(segIndex + 1)
      }, SEGMENT_GAP_MS)
    })
  }
  speakSegment(0)
}

// 이 스토어는 특정 페이지에 묶이지 않는 전역 상태다 — 페이지를 이동해도(React Router 클라이언트
// 라우팅으로 컴포넌트가 언마운트돼도) 자동재생이 끊기지 않게 하기 위함이다(docs/DECISION_LOG.md
// 참고). 그래서 네이티브 이벤트 리스너도 컴포넌트 마운트가 아니라 모듈 로드 시 한 번만 등록한다.
export const useAutoplayStore = create<AutoplayState>((set, get) => ({
  items: [],
  active: false,
  playing: false,
  index: 0,
  gapMs: 1000,
  isSupported: isTTSSupported(),

  start: (items, opts = {}) => {
    if (items.length === 0) return
    const gapMs = opts.gapMs ?? 1000
    const startIndex = Math.max(0, Math.min(items.length - 1, opts.startIndex ?? 0))
    gen++
    clearGapTimer()
    ttsStop()
    set({ items, active: true, playing: true, index: startIndex, gapMs })
    if (isNative()) {
      bridge.startAutoplay({ words: items.map((it) => it.segments), gapMs, startIndex })
    } else {
      scheduleWebSpeak()
    }
  },

  toggle: () => {
    const { active, playing } = get()
    if (!active) return
    const nextPlaying = !playing
    set({ playing: nextPlaying })
    if (isNative()) {
      if (nextPlaying) bridge.resumeAutoplay()
      else bridge.pauseAutoplay()
      return
    }
    if (nextPlaying) {
      scheduleWebSpeak()
    } else {
      gen++
      ttsStop()
      clearGapTimer()
    }
  },

  next: () => {
    const { active, index, items } = get()
    if (!active) return
    if (isNative()) {
      set({ playing: true })
      bridge.stepAutoplay({ direction: 1 })
      return
    }
    gen++
    ttsStop()
    clearGapTimer()
    if (index >= items.length - 1) {
      set({ active: false, playing: false, index: 0 })
      return
    }
    set({ playing: true, index: index + 1 })
    scheduleWebSpeak()
  },

  previous: () => {
    const { active, index } = get()
    if (!active) return
    if (isNative()) {
      // 현재 인덱스는 네이티브만 갖는 유일한 진실이다 — 웹의 index는 이벤트로 뒤늦게 반영되는
      // 값이라 여기서 미리 경계 체크를 하면(특히 아직 갱신 전이면) 정상적인 이전 이동까지 막을 수
      // 있다. 경계 판단은 네이티브의 AUTOPLAY_STEP 처리에 전부 맡긴다.
      set({ playing: true })
      bridge.stepAutoplay({ direction: -1 })
      return
    }
    if (index <= 0) return
    gen++
    ttsStop()
    clearGapTimer()
    set({ playing: true, index: index - 1 })
    scheduleWebSpeak()
  },

  close: () => {
    gen++
    clearGapTimer()
    if (isNative()) bridge.stopAutoplay()
    else ttsStop()
    set({ active: false, playing: false, index: 0, items: [] })
  },
}))

// isNative()로 감싸 조건부 등록하면 안 된다 — 이 모듈은 최초 import 시 딱 한 번 평가되는데, 그
// 시점에 react-native-webview가 window.ReactNativeWebView를 아직 주입하기 전이면(다른 곳의
// isNative() 호출은 전부 컴포넌트 마운트/이벤트 핸들러 안이라 이 경합이 없었다) isNative()가
// false로 굳어버려 네이티브의 자동재생 진행 이벤트를 영구히 못 받는 버그가 있었다(실기기 확인 —
// 웹은 정상, 앱만 미니 플레이어가 멈춰 있던 원인). registerBridgeListener 자체는 네이티브가 아니면
// 그냥 아무 메시지도 안 오니 무해하므로, 조건 없이 항상 등록한다.
registerBridgeListener((msg) => {
  if (msg.type === 'AUTOPLAY_WORD_CHANGED') {
    useAutoplayStore.setState({ index: msg.payload.index })
  }
  if (msg.type === 'AUTOPLAY_PLAYING_CHANGED') {
    useAutoplayStore.setState({ playing: msg.payload.playing })
  }
  if (msg.type === 'AUTOPLAY_FINISHED') {
    useAutoplayStore.setState({ active: false, playing: false, index: 0 })
  }
})
