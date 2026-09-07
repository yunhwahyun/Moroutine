import { useState, useRef, useEffect, useCallback } from 'react'
import { useTTS } from './useTTS'
import { isNative, bridge, registerBridgeListener } from '@/bridge'

export interface AutoPlayItem {
  term: string
  caption: string
}

interface AutoPlayOptions {
  lang?: string
  gapMs?: number
}

// 단어 목록을 순서대로 읽어주는 자동재생 상태 머신.
// - 웹(브라우저): speechSynthesis 완료 콜백을 받아 이 훅이 직접 순차 스케줄링한다(백그라운드 보장 없음).
// - 앱(RN 래퍼): 전체 목록을 네이티브로 한 번에 넘기고, 이후 시퀀싱/타이머는 네이티브(App.tsx)가
//   전담한다 — 화면 잠금 시 WebView의 JS 타이머가 스로틀링될 수 있어, 백그라운드 오디오 세션으로
//   계속 실행되는 RN 쪽 JS가 대신 맡는다(docs/DECISION_LOG.md 참고). 잠금화면 미디어 컨트롤로 재생/
//   일시정지가 바뀌면 네이티브가 AUTOPLAY_PLAYING_CHANGED로 알려주고, 이 훅은 그걸 그대로 반영한다.
export function useAutoPlay(items: AutoPlayItem[], opts: AutoPlayOptions = {}) {
  const { lang = 'en-US', gapMs = 1000 } = opts
  const { speak, stop: stopTTS, isSupported } = useTTS()

  const [active, setActive] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [index, setIndex] = useState(0)

  const itemsRef = useRef(items)
  itemsRef.current = items
  const timerRef = useRef<number>()
  // 재생 도중 seek/pause/stop이 끼어들면 그 이전에 예약된 onEnd/setTimeout 콜백이 뒤늦게 실행되며
  // 인덱스를 또 진행시키는 경합이 생길 수 있다(연타 시 "말이 빨라지는" 버그의 원인) — 매 조작마다
  // 세대 값을 올리고, 지연 콜백은 자기 세대가 최신일 때만 동작하게 해서 막는다.
  const genRef = useRef(0)

  // 네이티브: 진행 상황 이벤트 수신
  useEffect(() => {
    if (!isNative()) return
    return registerBridgeListener((msg) => {
      if (msg.type === 'AUTOPLAY_WORD_CHANGED') {
        setIndex(msg.payload.index)
      }
      if (msg.type === 'AUTOPLAY_PLAYING_CHANGED') {
        setPlaying(msg.payload.playing)
      }
      if (msg.type === 'AUTOPLAY_FINISHED') {
        setActive(false)
        setPlaying(false)
        setIndex(0)
      }
    })
  }, [])

  // 웹(브라우저): 직접 순차 재생 스케줄링
  useEffect(() => {
    if (isNative() || !active || !playing) return
    const list = itemsRef.current
    if (index >= list.length) {
      setActive(false)
      setPlaying(false)
      setIndex(0)
      return
    }
    const gen = ++genRef.current
    speak(list[index].term, lang, () => {
      if (genRef.current !== gen) return
      timerRef.current = window.setTimeout(() => {
        if (genRef.current !== gen) return
        setIndex((i) => i + 1)
      }, gapMs)
    })
    return () => window.clearTimeout(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, playing, index, lang, gapMs])

  const toggle = useCallback(() => {
    if (!active) {
      genRef.current++
      setIndex(0)
      setActive(true)
      setPlaying(true)
      if (isNative()) {
        bridge.startAutoplay({ words: itemsRef.current.map((it) => it.term), lang, gapMs })
      }
      return
    }
    const nextPlaying = !playing
    setPlaying(nextPlaying)
    if (isNative()) {
      if (nextPlaying) bridge.resumeAutoplay()
      else bridge.pauseAutoplay()
    } else if (!nextPlaying) {
      genRef.current++
      stopTTS()
      window.clearTimeout(timerRef.current)
    }
  }, [active, playing, lang, gapMs, stopTTS])

  const seek = useCallback(
    (newIndex: number) => {
      if (!active) return
      const clamped = Math.max(0, Math.min(itemsRef.current.length - 1, newIndex))
      setPlaying(true)
      if (isNative()) {
        bridge.seekAutoplay({ index: clamped })
      } else {
        genRef.current++
        stopTTS()
        window.clearTimeout(timerRef.current)
        setIndex(clamped)
      }
    },
    [active, stopTTS],
  )

  const next = useCallback(() => {
    if (index >= itemsRef.current.length - 1) {
      genRef.current++
      setActive(false)
      setPlaying(false)
      setIndex(0)
      if (isNative()) bridge.stopAutoplay()
      else stopTTS()
      return
    }
    seek(index + 1)
  }, [index, seek, stopTTS])

  const previous = useCallback(() => {
    if (index <= 0) return
    seek(index - 1)
  }, [index, seek])

  // 미니 플레이어를 완전히 닫기(세션 종료) — 자동재생 종료와 동일하게 처리
  const close = useCallback(() => {
    genRef.current++
    setActive(false)
    setPlaying(false)
    setIndex(0)
    if (isNative()) bridge.stopAutoplay()
    else stopTTS()
    window.clearTimeout(timerRef.current)
  }, [stopTTS])

  // 언마운트(페이지 이탈) 시 정리
  useEffect(() => {
    return () => {
      genRef.current++ // eslint-disable-line react-hooks/exhaustive-deps -- 낡은 콜백 무효화 목적의 의도적 증가
      if (isNative()) bridge.stopAutoplay()
      else stopTTS()
      window.clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { active, playing, index, toggle, next, previous, close, isSupported }
}
