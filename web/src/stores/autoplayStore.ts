import { create } from 'zustand'
import { isNative, bridge, registerBridgeListener } from '@/bridge'
import { ttsSpeak, ttsStop, isTTSSupported } from '@/hooks/useTTS'

export interface AutoPlayItem {
  term: string
  caption: string
}

interface AutoPlayStartOptions {
  lang?: string
  gapMs?: number
  startIndex?: number
}

interface AutoplayState {
  items: AutoPlayItem[]
  active: boolean
  playing: boolean
  index: number
  lang: string
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

function clearGapTimer() {
  if (gapTimer) {
    clearTimeout(gapTimer)
    gapTimer = undefined
  }
}

// 웹(브라우저) 전용 순차 재생 스케줄러 — 네이티브는 브리지로 시퀀싱을 위임한다(아래 start/toggle/
// next/previous의 isNative() 분기 참고).
function scheduleWebSpeak() {
  const { active, playing, items, index, lang, gapMs } = useAutoplayStore.getState()
  if (isNative() || !active || !playing) return
  if (index >= items.length) {
    useAutoplayStore.setState({ active: false, playing: false, index: 0 })
    return
  }
  const myGen = ++gen
  ttsSpeak(items[index].term, lang, () => {
    if (gen !== myGen) return
    gapTimer = setTimeout(() => {
      if (gen !== myGen) return
      useAutoplayStore.setState((s) => ({ index: s.index + 1 }))
      scheduleWebSpeak()
    }, gapMs)
  })
}

// 이 스토어는 특정 페이지에 묶이지 않는 전역 상태다 — 페이지를 이동해도(React Router 클라이언트
// 라우팅으로 컴포넌트가 언마운트돼도) 자동재생이 끊기지 않게 하기 위함이다(docs/DECISION_LOG.md
// 참고). 그래서 네이티브 이벤트 리스너도 컴포넌트 마운트가 아니라 모듈 로드 시 한 번만 등록한다.
export const useAutoplayStore = create<AutoplayState>((set, get) => ({
  items: [],
  active: false,
  playing: false,
  index: 0,
  lang: 'en-US',
  gapMs: 1000,
  isSupported: isTTSSupported(),

  start: (items, opts = {}) => {
    if (items.length === 0) return
    const lang = opts.lang ?? 'en-US'
    const gapMs = opts.gapMs ?? 1000
    const startIndex = Math.max(0, Math.min(items.length - 1, opts.startIndex ?? 0))
    gen++
    clearGapTimer()
    ttsStop()
    set({ items, active: true, playing: true, index: startIndex, lang, gapMs })
    if (isNative()) {
      bridge.startAutoplay({ words: items.map((it) => it.term), lang, gapMs, startIndex })
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
    if (!active || index <= 0) return
    if (isNative()) {
      set({ playing: true })
      bridge.stepAutoplay({ direction: -1 })
      return
    }
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

if (isNative()) {
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
}
