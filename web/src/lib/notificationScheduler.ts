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

  // alarm_mode='daily_time'은 alarm_minutes와 무관하게(보통 null) 항상 알림을 잡아야 한다 —
  // alarm_minutes만으로 판정하면 daily_time 일정이 전부 "알림 없음"으로 취급돼 걸러지는 버그가 있었다.
  if (schedule.alarm_mode === 'offset' && schedule.alarm_minutes === null) return

  const now = new Date()
  // expandScheduleOccurrences는 rangeStart를 "일(day)" 단위로 비교한다(반복 일정의 각 occurrence가
  // 자정 기준 Date라서). now를 그대로 넘기면 오늘 자정보다 항상 뒤라서 "오늘" occurrence 자체가
  // 통째로 걸러져(현재 시각 이후에 시작하는 일정이라도) 알림이 하나도 안 잡히는 버그가 있었다 —
  // 자정으로 내림한 값을 넘기고, 실제로 이미 지난 시각인지는 아래 fireAt > now에서 별도로 거른다.
  const rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const rangeEnd = new Date(rangeStart)
  rangeEnd.setDate(rangeEnd.getDate() + 30)

  const occurrences = expandScheduleOccurrences(schedule, rangeStart, rangeEnd)

  // 여러 날짜에 걸친 일정(2026-09-15 다중일자 표시 개선 이후)은 겹치는 날짜마다 occurrence가
  // 하나씩 생기는데, 전부 같은 회차의 실제 starts_at을 공유한다 — 그대로 순회하면 알림이
  // 회차당 여러 번(겹치는 날짜 수만큼) 중복 예약된다. occurrence_date(회차의 진짜 식별자)
  // 기준으로 중복 제거한 뒤 알림을 계산한다(사용자 리포트로 발견, docs/DECISION_LOG.md 2026-09-16).
  const seenOccurrenceDates = new Set<string>()
  const uniqueOccurrences = occurrences.filter((occ) => {
    if (seenOccurrenceDates.has(occ.occurrence_date)) return false
    seenOccurrenceDates.add(occ.occurrence_date)
    return true
  })

  // daily_time은 종일/시간 지정 일정 모두 starts_at과 무관하게 설정 페이지의 복습 알림 시간에
  // 울린다(2026-09-16, docs/DECISION_LOG.md) — occurrence마다 매번 조회할 필요 없이 한 번만 가져온다.
  const dailyTime =
    schedule.alarm_mode === 'daily_time' ? (await repository.getSettings()).reviewNotificationTime : null

  const inputs = uniqueOccurrences.reduce<{ scheduleId: string; fireAt: string }[]>((acc, occ) => {
    const fireAt =
      dailyTime !== null
        ? new Date(`${occ.occurrence_date}T${dailyTime}:00`)
        : new Date(new Date(occ.starts_at).getTime() - schedule.alarm_minutes! * 60000)
    if (fireAt > now) {
      acc.push({ scheduleId: schedule.id, fireAt: fireAt.toISOString() })
    }
    return acc
  }, [])

  if (inputs.length === 0) return

  const created = await repository.createNotifications(inputs)

  const body =
    dailyTime !== null
      ? '오늘 일정이 있습니다'
      : schedule.alarm_minutes === 0
        ? '일정이 시작됩니다'
        : `${schedule.alarm_minutes}분 후 일정이 시작됩니다`

  // native_id를 돌려받을 때까지 기다린 뒤 저장한다 — 여기서 그냥 fire-and-forget하면 이 함수가
  // 반환된 직후 같은 일정이 다시 수정돼 refreshScheduleNotifications()가 한 번 더 실행될 때
  // cancelScheduleNotifications()가 방금 예약한 알림의 native_id를 아직 못 찾아 그 네이티브
  // 알람을 취소하지 못하는 문제가 있었다 — 옛 알람이 안 지워진 채 새 알람과 겹쳐 같은 일정
  // 알림이 중복으로 울린다(실사용자 리포트, docs/DECISION_LOG.md 2026-09-16).
  await Promise.all(
    created.map(async (n) => {
      const { nativeId } = await bridge.scheduleNotification({
        id: n.id, title: schedule.title, body, fireAt: n.fire_at,
      })
      if (nativeId) {
        await repository.updateNotificationNativeId(n.id, nativeId).catch((err) => {
          console.error('[schedule notification native_id update error]', err)
        })
      }
    }),
  )
}

// alarm_mode='daily_time'인 일정은 설정 페이지의 복습 알림 시간(reviewNotificationTime)을
// 그대로 쓴다 — refreshScheduleNotifications()는 일정 생성/수정 시점에만 호출되므로, 이미
// 등록된 일정이 있는 상태에서 설정 페이지의 알림 시간만 바꾸면 반영되지 않는 문제가 있었다
// (사용자 리포트, docs/DECISION_LOG.md 2026-09-16). ScheduleDailyTimeSync.tsx가 설정 변경
// 시마다 이 함수를 호출해 daily_time 일정 전체를 새 시각으로 다시 예약한다.
export async function refreshDailyTimeScheduleNotifications(repository: DataRepository): Promise<void> {
  const schedules = await repository.getSchedules()
  for (const schedule of schedules) {
    if (schedule.alarm_mode !== 'daily_time') continue
    await refreshScheduleNotifications(repository, schedule)
  }
}
