import type {
  BridgeOutbound,
  BridgeInbound,
  ScheduleNotificationPayload,
  CancelNotificationPayload,
  RequestPermissionPayload,
  SpeakTextPayload,
  StartSTTPayload,
  SetUserIdPayload,
  PurchaseRequestPayload,
} from '@/types/bridge'

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (msg: string) => void }
    onBridgeMessage?: (msg: BridgeInbound) => void
  }
}

// 멀티 리스너 — 네이티브에서 window.onBridgeMessage 호출 시 전체 dispatch
const listeners = new Set<(msg: BridgeInbound) => void>()

if (typeof window !== 'undefined') {
  window.onBridgeMessage = (msg: BridgeInbound) => {
    listeners.forEach((fn) => fn(msg))
  }
}

export const isNative = () =>
  typeof window !== 'undefined' && !!window.ReactNativeWebView

function send(msg: BridgeOutbound) {
  if (!isNative()) return
  window.ReactNativeWebView!.postMessage(JSON.stringify(msg))
}

export const bridge = {
  scheduleNotification(payload: ScheduleNotificationPayload) {
    send({ type: 'SCHEDULE_NOTIFICATION', payload })
  },
  cancelNotification(payload: CancelNotificationPayload) {
    send({ type: 'CANCEL_NOTIFICATION', payload })
  },
  requestPermission(payload: RequestPermissionPayload) {
    send({ type: 'REQUEST_PERMISSION', payload })
  },
  speak(payload: SpeakTextPayload) {
    send({ type: 'SPEAK_TEXT', payload })
  },
  stopSpeech() {
    send({ type: 'STOP_SPEECH' })
  },
  startSTT(payload: StartSTTPayload) {
    send({ type: 'START_STT', payload })
  },
  stopSTT() {
    send({ type: 'STOP_STT' })
  },
  getAppVersion() {
    send({ type: 'GET_APP_VERSION' })
  },
  ready() {
    send({ type: 'WEB_READY' })
  },
  setUserId(payload: SetUserIdPayload) {
    send({ type: 'SET_USER_ID', payload })
  },
  requestPurchase(payload: PurchaseRequestPayload) {
    send({ type: 'PURCHASE_REQUEST', payload })
  },
  restorePurchases() {
    send({ type: 'RESTORE_PURCHASES' })
  },
}

/** 리스너 등록, 반환값(cleanup)을 useEffect cleanup에 사용 */
export function registerBridgeListener(handler: (msg: BridgeInbound) => void): () => void {
  listeners.add(handler)
  return () => listeners.delete(handler)
}
