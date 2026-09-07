import { isNative, bridge } from '@/bridge'

// onEnd: 웹(브라우저)에서만 재생 완료 시점을 알려준다 — 네이티브는 자동재생 시퀀싱을 앱 쪽에서
// 전담하므로(stores/autoplayStore.ts 참고) 단건 speak()에 완료 콜백을 배선할 필요가 없다.
// 훅이 아니라 일반 함수로도 export한다 — autoplayStore.ts처럼 React 컴포넌트 밖(Zustand 스토어)에서도
// 그대로 재사용하기 위함(내부적으로 React 훅을 전혀 쓰지 않으므로 안전하다).
export function ttsSpeak(text: string, lang = 'en-US', onEnd?: () => void) {
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

export function ttsStop() {
  if (isNative()) bridge.stopSpeech()
  else if ('speechSynthesis' in window) speechSynthesis.cancel()
}

export function isTTSSupported() {
  return isNative() || 'speechSynthesis' in window
}

export function useTTS() {
  return { speak: ttsSpeak, stop: ttsStop, isSupported: isTTSSupported() }
}
