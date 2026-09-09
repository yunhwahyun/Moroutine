import { useEffect } from 'react'
import { usePermissions } from '@/hooks/usePermissions'
import { useSettingsStore } from '@/stores/settingsStore'
import { getRepository } from '@/repositories/factory'
import { refreshReviewNotification } from '@/lib/reviewNotificationScheduler'

// 앱 진입 시 + 복습 알림 설정(토글/시간)이 바뀔 때마다 다음 복습 알림 1회분을 다시 계산해
// 예약한다. useSettingsStore는 설정 화면에서 낙관적으로 즉시 갱신되므로(useUserSettings.ts의
// patchSettings) 이 useEffect의 의존성이 바로 반응해 별도 배선 없이 "설정 변경 시 즉시 적용"이
// 충족된다. App.tsx의 AuthProvider 안에서 다른 Gate들과 나란히 한 번만 마운트한다.
export default function ReviewNotificationSync() {
  const { permissions } = usePermissions()
  const tier = permissions?.serviceTier ?? null
  const { settings } = useSettingsStore()

  useEffect(() => {
    if (!tier || tier === 'admin') return
    const repository = getRepository(tier)
    refreshReviewNotification(repository, settings).catch((err) => {
      console.error('[review notification sync]', err)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, settings.reviewNotification, settings.reviewNotificationTime])

  return null
}
