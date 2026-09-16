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
  AutoplayStartPayload,
  AutoplayStepPayload,
  AutoplaySetRatePayload,
} from '@/types/bridge'

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (msg: string) => void }
    onBridgeMessage?: (msg: BridgeInbound) => void
  }
}

// 멀티 리스너 — 네이티브에서 window.onBridgeMessage 호출 시 전체 dispatch
const listeners = new Set<(msg: BridgeInbound) => void>()

// scheduleNotification()이 실제 네이티브 예약 완료(NOTIFICATION_RESULT로 native_id를 받는
// 시점)까지 기다릴 수 있게 하는 내부 큐 — refreshScheduleNotifications()가 "새 알림 예약 →
// native_id 저장"을 끝까지 기다리지 않고 반환하면, 그 직후(짧은 시간 안에) 같은 일정이 다시
// 수정돼 refreshScheduleNotifications()가 한 번 더 실행될 때 방금 예약한 알림의 native_id가
// 아직 DB에 없어서(비동기 왕복 중) cancelScheduleNotifications()가 그 네이티브 알람을 취소하지
// 못하고 넘어가는 문제가 있었다 — 취소되지 않은 옛 알람 + 새로 예약된 알람이 겹쳐 같은 일정
// 알림이 중복으로 울린다(실사용자 리포트, docs/DECISION_LOG.md 2026-09-16).
const pendingScheduleResults = new Map<string, (result: { nativeId: string | null }) => void>()

if (typeof window !== 'undefined') {
  window.onBridgeMessage = (msg: BridgeInbound) => {
    if (msg.type === 'NOTIFICATION_RESULT') {
      const resolve = pendingScheduleResults.get(msg.payload.id)
      if (resolve) {
        pendingScheduleResults.delete(msg.payload.id)
        resolve({ nativeId: msg.payload.success ? msg.payload.nativeId : null })
      }
    }
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
  // 네이티브가 실제로 예약을 마치고 native_id를 돌려줄 때까지(또는 8초 타임아웃까지) 기다린다 —
  // 위 pendingScheduleResults 설명 참고. 네이티브가 아니거나(웹 미리보기) 응답이 안 와도 항상
  // resolve하며 절대 reject하지 않는다(호출부가 매번 try/catch 없이 안전하게 await 가능).
  scheduleNotification(payload: ScheduleNotificationPayload): Promise<{ nativeId: string | null }> {
    send({ type: 'SCHEDULE_NOTIFICATION', payload })
    if (!isNative()) return Promise.resolve({ nativeId: null })
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        pendingScheduleResults.delete(payload.id)
        resolve({ nativeId: null })
      }, 8000)
      pendingScheduleResults.set(payload.id, (result) => {
        clearTimeout(timeoutId)
        resolve(result)
      })
    })
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
  startAutoplay(payload: AutoplayStartPayload) {
    send({ type: 'AUTOPLAY_START', payload })
  },
  pauseAutoplay() {
    send({ type: 'AUTOPLAY_PAUSE' })
  },
  resumeAutoplay() {
    send({ type: 'AUTOPLAY_RESUME' })
  },
  stepAutoplay(payload: AutoplayStepPayload) {
    send({ type: 'AUTOPLAY_STEP', payload })
  },
  setAutoplayRate(payload: AutoplaySetRatePayload) {
    send({ type: 'AUTOPLAY_SET_RATE', payload })
  },
  stopAutoplay() {
    send({ type: 'AUTOPLAY_STOP' })
  },
}

/** 리스너 등록, 반환값(cleanup)을 useEffect cleanup에 사용 */
export function registerBridgeListener(handler: (msg: BridgeInbound) => void): () => void {
  listeners.add(handler)
  return () => listeners.delete(handler)
}
