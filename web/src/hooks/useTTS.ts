import { isNative, bridge } from '@/bridge'

export function useTTS() {
  const speak = (text: string, lang = 'en-US') => {
    if (isNative()) {
      bridge.speak({ text, lang })
    } else {
      if (!('speechSynthesis' in window)) return
      speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = lang
      speechSynthesis.speak(utterance)
    }
  }

  const stop = () => {
    if (isNative()) bridge.stopSpeech()
    else if ('speechSynthesis' in window) speechSynthesis.cancel()
  }

  const isSupported = isNative() || 'speechSynthesis' in window

  return { speak, stop, isSupported }
}
