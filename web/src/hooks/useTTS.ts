import { isNative, bridge } from '@/bridge'

export function useTTS() {
  // onEnd: 웹(브라우저)에서만 재생 완료 시점을 알려준다 — 네이티브는 자동재생 시퀀싱을 앱 쪽에서
  // 전담하므로(useAutoPlay 참고) 단건 speak()에 완료 콜백을 배선할 필요가 없다.
  const speak = (text: string, lang = 'en-US', onEnd?: () => void) => {
    if (isNative()) {
      bridge.speak({ text, lang })
    } else {
      if (!('speechSynthesis' in window)) { onEnd?.(); return }
      speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = lang
      if (onEnd) {
        utterance.onend = onEnd
        utterance.onerror = onEnd
      }
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
