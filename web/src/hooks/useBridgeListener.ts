import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { registerBridgeListener } from '@/bridge'
import { usePermissions } from '@/hooks/usePermissions'
import { useAuthStore } from '@/stores/authStore'
import { getRepository } from '@/repositories/factory'

export function useBridgeListener() {
  const { permissions } = usePermissions()
  const tier = permissions?.serviceTier ?? null
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!tier || tier === 'admin') return
    const repository = getRepository(tier)
    return registerBridgeListener(async (msg) => {
      if (msg.type === 'NOTIFICATION_RESULT') {
        const { id, nativeId, success } = msg.payload
        if (success && nativeId) {
          await repository.updateNotificationNativeId(id, nativeId).catch((err) => {
            console.error('[native_id update error]', err)
          })
        }
      }

      // 네이티브 결제/복원 결과 자체를 권한으로 신뢰하지 않는다(docs/SUBSCRIPTION_DESIGN.md §3) —
      // webhook이 실제로 subscriptions를 갱신했는지 재조회를 트리거하는 용도로만 사용한다.
      if ((msg.type === 'PURCHASE_RESULT' || msg.type === 'RESTORE_RESULT') && msg.payload.success && user) {
        await queryClient.invalidateQueries({ queryKey: ['permissions', user.id] })
      }
    })
  }, [tier, user, queryClient])
}
