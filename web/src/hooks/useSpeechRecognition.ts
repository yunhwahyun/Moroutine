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

  // 네이티브: STT_RESULT 수신
  useEffect(() => {
    if (!isNative()) return
    return registerBridgeListener((msg) => {
      if (msg.type === 'STT_RESULT') {
        if (msg.payload.transcript) setTranscript(msg.payload.transcript)
        if (msg.payload.final) setListening(false)
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
    recognition.continuous = false
    recognition.interimResults = false

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results[0][0].transcript
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
