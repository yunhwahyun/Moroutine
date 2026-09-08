export type ScheduleNotificationPayload = {
  id: string
  title: string
  body: string
  fireAt: string
}

export type CancelNotificationPayload = {
  id: string
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
  userId: string | null
}

export type PurchaseRequestPayload = {
  planCode: 'pro'
}

export type AutoplaySpeechSegment = {
  text: string
  lang: string
}

// 자동재생(단어 순차 읽기) — 화면 잠금/백그라운드에서도 이어지도록 네이티브가 시퀀싱을 전담한다.
// docs/DECISION_LOG.md 참고: 웹뷰의 JS 타이머는 백그라운드에서 스로틀링될 수 있어 RN 쪽에서 돈다.
// words[i]는 i번째 단어에서 순서대로 읽을 내용(단어→뜻→설명→예문)이며, 세그먼트마다 언어가 다를
// 수 있다(단어/예문은 원어, 뜻/설명은 한국어).
export type AutoplayStartPayload = {
  words: AutoplaySpeechSegment[][]
  gapMs: number
  startIndex: number
  rate: number
}

// 절대 인덱스 대신 상대 이동(+1/-1)만 보낸다 — 현재 인덱스는 네이티브(App.tsx)가 유일하게 들고
// 있는 진실이며, 웹의 index 상태는 이벤트로 뒤늦게 반영되는 값이라 웹이 계산한 절대 인덱스로 seek을
// 시키면 경합 시 어긋날 수 있다(docs/DECISION_LOG.md 참고).
export type AutoplayStepPayload = {
  direction: 1 | -1
}

export type AutoplaySetRatePayload = {
  rate: number
}

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
  | { type: 'AUTOPLAY_STEP'; payload: AutoplayStepPayload }
  | { type: 'AUTOPLAY_SET_RATE'; payload: AutoplaySetRatePayload }
  | { type: 'AUTOPLAY_STOP' }

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
