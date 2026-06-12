import type {
  BridgeOutbound,
  BridgeInbound,
  ScheduleNotificationPayload,
  CancelNotificationPayload,
  RequestPermissionPayload,
  SpeakTextPayload,
} from '@/types/bridge'

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (msg: string) => void }
    onBridgeMessage?: (msg: BridgeInbound) => void
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
  getAppVersion() {
    send({ type: 'GET_APP_VERSION' })
  },
  ready() {
    send({ type: 'WEB_READY' })
  },
}

export function registerBridgeListener(handler: (msg: BridgeInbound) => void) {
  window.onBridgeMessage = handler
}
