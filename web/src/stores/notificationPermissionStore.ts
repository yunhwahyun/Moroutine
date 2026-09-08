import { create } from 'zustand'
import { registerBridgeListener } from '@/bridge'

interface NotificationPermissionState {
  // null = 아직 응답을 못 받음(웹 브라우저이거나, 앱이 방금 켜져 네이티브 결과가 아직 안 왔을 때)
  granted: boolean | null
}

export const useNotificationPermissionStore = create<NotificationPermissionState>(() => ({
  granted: null,
}))

// isNative() 조건 없이 항상 등록한다 — 다른 곳(자동재생 스토어)에서 조건부 등록 때문에 네이티브
// 이벤트를 영구히 못 받던 버그가 있었다(docs/DECISION_LOG.md 2026-09-07).
registerBridgeListener((msg) => {
  if (msg.type === 'PERMISSION_RESULT' && msg.payload.permission === 'notifications') {
    useNotificationPermissionStore.setState({ granted: msg.payload.granted })
  }
})
