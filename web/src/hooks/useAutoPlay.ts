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
//   계속 실행되는 RN 쪽 JS가 대신 맡는다(docs/DECISION_LOG.md 참고).
export function useAutoPlay(items: AutoPlayItem[], opts: AutoPlayOptions = {}) {
  const { lang = 'en-US', gapMs = 1000 } = opts
  const { speak, stop: stopTTS, isSupported } = useTTS()

  const [active, setActive] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [index, setIndex] = useState(0)

  const itemsRef = useRef(items)
  itemsRef.current = items
  const timerRef = useRef<number>()

  // 네이티브: 진행 상황 이벤트 수신
  useEffect(() => {
    if (!isNative()) return
    return registerBridgeListener((msg) => {
      if (msg.type === 'AUTOPLAY_WORD_CHANGED') {
        setIndex(msg.payload.index)
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
    speak(list[index].term, lang, () => {
      timerRef.current = window.setTimeout(() => setIndex((i) => i + 1), gapMs)
    })
    return () => window.clearTimeout(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, playing, index, lang, gapMs])

  const toggle = useCallback(() => {
    if (!active) {
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
        stopTTS()
        window.clearTimeout(timerRef.current)
        setIndex(clamped)
      }
    },
    [active, stopTTS],
  )

  const next = useCallback(() => {
    if (index >= itemsRef.current.length - 1) {
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

  // 언마운트(페이지 이탈) 시 정리
  useEffect(() => {
    return () => {
      if (isNative()) bridge.stopAutoplay()
      else stopTTS()
      window.clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { active, playing, index, toggle, next, previous, isSupported }
}
