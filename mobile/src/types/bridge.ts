// 웹 → 네이티브 payload
export type ScheduleNotificationPayload = {
  id: string
  title: string
  body: string
  fireAt: string
}

export type CancelNotificationPayload = {
  id: string  // native_id
}

export type RequestPermissionPayload = {
  permission: 'notifications'
}

export type SpeakTextPayload = {
  text: string
  lang: string
}

export type StartSTTPayload = {
  lang: string
}

export type SetUserIdPayload = {
  userId: string | null // 로그인 시 Supabase user_id, 로그아웃 시 null — RevenueCat app_user_id와 동기화
}

export type PurchaseRequestPayload = {
  planCode: 'pro'
}

// 자동재생(단어 순차 읽기) — 화면 잠금/백그라운드에서도 이어지도록 네이티브가 시퀀싱을 전담한다.
// docs/DECISION_LOG.md 참고: 웹뷰의 JS 타이머는 백그라운드에서 스로틀링될 수 있어 RN 쪽에서 돈다.
export type AutoplayStartPayload = {
  words: string[]
  lang: string
  gapMs: number
}

export type AutoplaySeekPayload = {
  index: number
}

// 웹 → 네이티브 메시지 (BridgeOutbound = 웹 기준 outbound)
export type BridgeOutbound =
  | { type: 'SCHEDULE_NOTIFICATION'; payload: ScheduleNotificationPayload }
  | { type: 'CANCEL_NOTIFICATION'; payload: CancelNotificationPayload }
  | { type: 'REQUEST_PERMISSION'; payload: RequestPermissionPayload }
  | { type: 'SPEAK_TEXT'; payload: SpeakTextPayload }
  | { type: 'STOP_SPEECH' }
  | { type: 'START_STT'; payload: StartSTTPayload }
  | { type: 'STOP_STT' }
  | { type: 'GET_APP_VERSION' }
  | { type: 'WEB_READY' }
  | { type: 'SET_USER_ID'; payload: SetUserIdPayload }
  | { type: 'PURCHASE_REQUEST'; payload: PurchaseRequestPayload }
  | { type: 'RESTORE_PURCHASES' }
  | { type: 'AUTOPLAY_START'; payload: AutoplayStartPayload }
  | { type: 'AUTOPLAY_PAUSE' }
  | { type: 'AUTOPLAY_RESUME' }
  | { type: 'AUTOPLAY_SEEK'; payload: AutoplaySeekPayload }
  | { type: 'AUTOPLAY_STOP' }

// 네이티브 → 웹 payload
export type NotificationResultPayload = {
  id: string
  nativeId: string
  success: boolean
  error?: string
}

export type PermissionResultPayload = {
  permission: 'notifications'
  granted: boolean
}

export type AppVersionPayload = {
  version: string
}

export type STTResultPayload = {
  transcript: string
  final: boolean
}

export type PurchaseResultPayload = {
  success: boolean
  error?: string
}

export type RestoreResultPayload = {
  success: boolean
  error?: string
}

export type AutoplayWordChangedPayload = {
  index: number
}

export type AutoplayPlayingChangedPayload = {
  playing: boolean
}

// 네이티브 → 웹 메시지 (BridgeInbound = 웹 기준 inbound)
export type BridgeInbound =
  | { type: 'NOTIFICATION_RESULT'; payload: NotificationResultPayload }
  | { type: 'PERMISSION_RESULT'; payload: PermissionResultPayload }
  | { type: 'APP_VERSION'; payload: AppVersionPayload }
  | { type: 'STT_RESULT'; payload: STTResultPayload }
  | { type: 'PURCHASE_RESULT'; payload: PurchaseResultPayload }
  | { type: 'RESTORE_RESULT'; payload: RestoreResultPayload }
  | { type: 'AUTOPLAY_WORD_CHANGED'; payload: AutoplayWordChangedPayload }
  | { type: 'AUTOPLAY_PLAYING_CHANGED'; payload: AutoplayPlayingChangedPayload }
  | { type: 'AUTOPLAY_FINISHED' }
