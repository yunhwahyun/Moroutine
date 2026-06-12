import { supabase } from '@/lib/supabase'
import { bridge } from '@/bridge'
import { useAuthStore } from '@/stores/authStore'
import { expandScheduleOccurrences } from '@/lib/scheduleRepeat'
import type { Schedule } from '@/types'

export async function cancelScheduleNotifications(scheduleId: string): Promise<void> {
  const { data: notifs, error } = await supabase
    .from('notifications')
    .select('id, native_id')
    .eq('schedule_id', scheduleId)
    .eq('is_cancelled', false)

  if (error) { console.error('[notifications fetch error]', error); return }
  if (!notifs || notifs.length === 0) return

  for (const n of notifs) {
    if (n.native_id) bridge.cancelNotification({ id: n.native_id })
  }

  await supabase
    .from('notifications')
    .update({ is_cancelled: true })
    .eq('schedule_id', scheduleId)
    .eq('is_cancelled', false)
}

// 기존 알림 취소 후 앞으로 30일치 알림 재등록
// Note: schedule_exceptions는 반영되지 않음 (MVP 제한)
export async function refreshScheduleNotifications(schedule: Schedule): Promise<void> {
  await cancelScheduleNotifications(schedule.id)

  if (schedule.alarm_minutes === null) return

  const userId = useAuthStore.getState().user?.id
  if (!userId) return

  const now = new Date()
  const rangeEnd = new Date(now)
  rangeEnd.setDate(rangeEnd.getDate() + 30)

  const occurrences = expandScheduleOccurrences(schedule, now, rangeEnd)

  const rows = occurrences.reduce<{ schedule_id: string; user_id: string; fire_at: string }[]>(
    (acc, occ) => {
      const fireAt = new Date(
        new Date(occ.starts_at).getTime() - schedule.alarm_minutes! * 60000,
      )
      if (fireAt > now) {
        acc.push({ schedule_id: schedule.id, user_id: userId, fire_at: fireAt.toISOString() })
      }
      return acc
    },
    [],
  )

  if (rows.length === 0) return

  const { data: inserted, error } = await supabase
    .from('notifications')
    .insert(rows)
    .select('id, fire_at')

  if (error) { console.error('[notifications insert error]', error); return }
  if (!inserted) return

  const body =
    schedule.alarm_minutes === 0
      ? '일정이 시작됩니다'
      : `${schedule.alarm_minutes}분 후 일정이 시작됩니다`

  for (const n of inserted) {
    bridge.scheduleNotification({ id: n.id, title: schedule.title, body, fireAt: n.fire_at })
  }
}
