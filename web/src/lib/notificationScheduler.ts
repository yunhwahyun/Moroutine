import { bridge } from '@/bridge'
import { expandScheduleOccurrences } from '@/lib/scheduleRepeat'
import type { DataRepository } from '@/repositories/types'
import type { Schedule } from '@/types'

// docs/DATA_STORAGE_DESIGN.md §6 — Guest는 LocalDataRepository(IndexedDB), 그 외는 RemoteDataRepository로
// 알림 예약 상태(native_id/취소 여부)를 추적한다. 네이티브 알림 자체는 Bridge를 통해 기기에서 예약되며
// 저장소와 무관하다(docs/DESIGN.md §5).

export async function cancelScheduleNotifications(
  repository: DataRepository,
  scheduleId: string,
): Promise<void> {
  const cancelled = await repository.cancelNotifications(scheduleId)
  for (const n of cancelled) {
    if (n.native_id) bridge.cancelNotification({ id: n.native_id })
  }
}

// 기존 알림 취소 후 앞으로 30일치 알림 재등록
// Note: schedule_exceptions는 반영되지 않음 (MVP 제한)
export async function refreshScheduleNotifications(
  repository: DataRepository,
  schedule: Schedule,
): Promise<void> {
  await cancelScheduleNotifications(repository, schedule.id)

  if (schedule.alarm_minutes === null) return

  const now = new Date()
  const rangeEnd = new Date(now)
  rangeEnd.setDate(rangeEnd.getDate() + 30)

  const occurrences = expandScheduleOccurrences(schedule, now, rangeEnd)

  const inputs = occurrences.reduce<{ scheduleId: string; fireAt: string }[]>((acc, occ) => {
    const fireAt = new Date(new Date(occ.starts_at).getTime() - schedule.alarm_minutes! * 60000)
    if (fireAt > now) {
      acc.push({ scheduleId: schedule.id, fireAt: fireAt.toISOString() })
    }
    return acc
  }, [])

  if (inputs.length === 0) return

  const created = await repository.createNotifications(inputs)

  const body =
    schedule.alarm_minutes === 0
      ? '일정이 시작됩니다'
      : `${schedule.alarm_minutes}분 후 일정이 시작됩니다`

  for (const n of created) {
    bridge.scheduleNotification({ id: n.id, title: schedule.title, body, fireAt: n.fire_at })
  }
}
