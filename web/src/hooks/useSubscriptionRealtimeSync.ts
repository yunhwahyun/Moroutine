import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

// usePermissions()는 TanStack Query staleTime 5분이라, RevenueCat webhook이 subscriptions를 갱신하거나
// Admin이 profiles.special_access(Master 부여/해제)를 바꿔도 앱이 열려 있는 동안 최대 5분
// (+refetch 트리거 전까지) 반영되지 않는다. 마이그레이션 27/28에서 두 테이블을 supabase_realtime
// publication에 추가했으므로, 여기서 postgres_changes를 구독해 변경 즉시 permissions 쿼리를 무효화한다.
export function useSubscriptionRealtimeSync() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!user) return

    const invalidatePermissions = () => {
      queryClient.invalidateQueries({ queryKey: ['permissions', user.id] })
    }

    const channel = supabase
      .channel(`permissions-changes-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${user.id}` },
        invalidatePermissions,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        invalidatePermissions,
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, queryClient])
}
