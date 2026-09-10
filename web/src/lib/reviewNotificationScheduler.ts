import { bridge, registerBridgeListener } from '@/bridge'
import type { DataRepository } from '@/repositories/types'
import type { UserSettings } from '@/types'

// docs/DECISION_LOG.md 2026-09-09 — "복습 알림" 설정(토글/시간)은 저장만 되고 실제로 알림을
// 예약하는 코드가 전혀 없었다(처음부터 미구현). 일정 알림과 달리 복습 대상은 매일 학습 여부에
// 따라 계속 바뀌므로(오늘 다 풀면 내일 알림이 필요 없어질 수도 있음) 캘린더 일정처럼 먼 미래까지
// 한꺼번에 예약해둘 수 없다 — 앱을 열 때마다/설정을 바꿀 때마다 "다음 1회분"만 다시 계산해서
// 예약한다(web/src/components/notifications/ReviewNotificationSync.tsx가 트리거를 담당).

const REVIEW_NOTIFICATION_ID = 'review-reminder'
const STORAGE_KEY = 'moroutine_review_notification_native_id'

function getStoredNativeId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function setStoredNativeId(id: string | null): void {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Guest 프라이빗 브라우징 등으로 localStorage를 못 쓰는 경우 — 다음 refresh 때 다시 시도되므로 무시
  }
}

// isNative() 조건 없이 항상 등록한다 — 자동재생 스토어 등에서 조건부 등록 때문에 네이티브
// 이벤트를 영구히 못 받던 버그가 있었다(docs/DECISION_LOG.md 2026-09-07).
registerBridgeListener((msg) => {
  if (msg.type === 'NOTIFICATION_RESULT' && msg.payload.id === REVIEW_NOTIFICATION_ID && msg.payload.success) {
    setStoredNativeId(msg.payload.nativeId)
  }
})

// reviewNotificationTime(HH:mm) 기준 다음 알림 시각 — 오늘 그 시각이 이미 지났으면 내일로.
function nextReminderDate(time: string): Date {
  const [h, m] = time.split(':').map(Number)
  const now = new Date()
  const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0)
  if (candidate <= now) candidate.setDate(candidate.getDate() + 1)
  return candidate
}

// 스케줄에 묶이지 않는 복습 알림 하나를 명시적으로 취소한다(예: Guest 로컬 데이터 전체 삭제).
export function cancelReviewNotification(): void {
  const existingNativeId = getStoredNativeId()
  if (!existingNativeId) return
  bridge.cancelNotification({ id: existingNativeId })
  setStoredNativeId(null)
}

export async function refreshReviewNotification(
  repository: DataRepository,
  settings: Pick<UserSettings, 'reviewNotification' | 'reviewNotificationTime'>,
): Promise<void> {
  const existingNativeId = getStoredNativeId()
  if (existingNativeId) {
    bridge.cancelNotification({ id: existingNativeId })
    setStoredNativeId(null)
  }

  if (!settings.reviewNotification) return

  const fireAt = nextReminderDate(settings.reviewNotificationTime)
  // 복습 주기(review_step/next_review_at) 계산 결과 그 시각까지 복습할 단어가 하나도 없으면
  // 알림 자체를 예약하지 않는다 — 매일 무조건 울리는 게 아니라 실제로 복습할 게 있을 때만 온다.
  const dueItems = await repository.getReviewQueue(fireAt.toISOString())
  if (dueItems.length === 0) return

  bridge.scheduleNotification({
    id: REVIEW_NOTIFICATION_ID,
    title: '복습할 시간이에요',
    body: `복습할 단어가 ${dueItems.length}개 있어요`,
    fireAt: fireAt.toISOString(),
  })
}
