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
  // expandScheduleOccurrences는 rangeStart를 "일(day)" 단위로 비교한다(반복 일정의 각 occurrence가
  // 자정 기준 Date라서). now를 그대로 넘기면 오늘 자정보다 항상 뒤라서 "오늘" occurrence 자체가
  // 통째로 걸러져(현재 시각 이후에 시작하는 일정이라도) 알림이 하나도 안 잡히는 버그가 있었다 —
  // 자정으로 내림한 값을 넘기고, 실제로 이미 지난 시각인지는 아래 fireAt > now에서 별도로 거른다.
  const rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const rangeEnd = new Date(rangeStart)
  rangeEnd.setDate(rangeEnd.getDate() + 30)

  const occurrences = expandScheduleOccurrences(schedule, rangeStart, rangeEnd)

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
