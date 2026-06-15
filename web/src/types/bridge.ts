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

export type BridgeInbound =
  | { type: 'NOTIFICATION_RESULT'; payload: NotificationResultPayload }
  | { type: 'PERMISSION_RESULT'; payload: PermissionResultPayload }
  | { type: 'APP_VERSION'; payload: AppVersionPayload }
  | { type: 'STT_RESULT'; payload: STTResultPayload }
