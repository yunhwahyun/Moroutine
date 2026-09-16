import { useEffect } from 'react'
import { usePermissions } from '@/hooks/usePermissions'
import { useSettingsStore } from '@/stores/settingsStore'
import { getRepository } from '@/repositories/factory'
import { refreshDailyTimeScheduleNotifications } from '@/lib/notificationScheduler'

// alarm_mode='daily_time'으로 등록된 일정은 설정 페이지 "복습 알림"의 알림 시간을 그대로
// 쓴다(2026-09-16) — 그 시간이 바뀌면 이미 등록된 일정의 알림도 새 시각으로 다시 잡아야
// 한다. useSettingsStore는 설정 화면에서 낙관적으로 즉시 갱신되므로(useUserSettings.ts의
// patchSettings) 이 useEffect의 의존성이 바로 반응한다. ReviewNotificationSync.tsx와 같은
// 패턴으로 App.tsx에 나란히 한 번만 마운트한다.
export default function ScheduleDailyTimeSync() {
  const { permissions } = usePermissions()
  const tier = permissions?.serviceTier ?? null
  const { settings } = useSettingsStore()

  useEffect(() => {
    if (!tier || tier === 'admin') return
    const repository = getRepository(tier)
    refreshDailyTimeScheduleNotifications(repository).catch((err) => {
      console.error('[schedule daily_time notification sync]', err)
    })
  }, [tier, settings.reviewNotificationTime])

  return null
}
