import { useState, useEffect, useRef, useCallback } from 'react'
import { isNative, bridge, registerBridgeListener } from '@/bridge'

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance
type SpeechRecognitionInstance = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}
type SpeechRecognitionEvent = {
  results: { 0: { transcript: string } }[]
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
}

export function useSpeechRecognition(lang = 'en-US') {
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  const supported = isNative()
    ? true
    : typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  // 네이티브: STT_RESULT 수신 — continuous 모드에서는 말하다 멈출 때마다 final이 여러 번 올 수
  // 있어(아직 손을 떼기 전인데도), final 여부로 listening을 끄지 않는다. listening은 오직 우리가
  // 직접 호출한 start()/stop()으로만 관리한다(눌러서 녹음 UI와 정확히 일치시키기 위함).
  useEffect(() => {
    if (!isNative()) return
    return registerBridgeListener((msg) => {
      if (msg.type === 'STT_RESULT' && msg.payload.transcript) {
        setTranscript(msg.payload.transcript)
      }
    })
  }, [])

  const start = useCallback(() => {
    setTranscript('')

    if (isNative()) {
      bridge.startSTT({ lang })
      setListening(true)
      return
    }

    const API = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!API) return

    const recognition = new API()
    recognition.lang = lang
    // 눌러서 녹음, 손을 떼면 종료하는 방식이라 무음 감지로 중간에 자동 종료되면 안 된다 —
    // 사용자가 명시적으로 stop()을 호출할 때까지 계속 듣는다.
    recognition.continuous = true
    recognition.interimResults = false

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // continuous 모드에서는 말하다 멈출 때마다 결과가 누적되므로 항상 가장 최근 결과를 쓴다
      // (index 0 고정이면 첫 구간만 계속 보여주는 버그가 됨).
      const result = event.results[event.results.length - 1][0].transcript
      setTranscript(result)
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }, [lang])

  const stop = useCallback(() => {
    if (isNative()) {
      bridge.stopSTT()
    } else {
      recognitionRef.current?.stop()
    }
    setListening(false)
  }, [])

  return { supported, listening, transcript, start, stop }
}
