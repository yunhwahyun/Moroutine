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

// 웹 → 네이티브 메시지 (BridgeOutbound = 웹 기준 outbound)
export type BridgeOutbound =
  | { type: 'SCHEDULE_NOTIFICATION'; payload: ScheduleNotificationPayload }
  | { type: 'CANCEL_NOTIFICATION'; payload: CancelNotificationPayload }
  | { type: 'REQUEST_PERMISSION'; payload: RequestPermissionPayload }
  | { type: 'SPEAK_TEXT'; payload: SpeakTextPayload }
  | { type: 'STOP_SPEECH' }
  | { type: 'GET_APP_VERSION' }
  | { type: 'WEB_READY' }

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

// 네이티브 → 웹 메시지 (BridgeInbound = 웹 기준 inbound)
export type BridgeInbound =
  | { type: 'NOTIFICATION_RESULT'; payload: NotificationResultPayload }
  | { type: 'PERMISSION_RESULT'; payload: PermissionResultPayload }
  | { type: 'APP_VERSION'; payload: AppVersionPayload }
