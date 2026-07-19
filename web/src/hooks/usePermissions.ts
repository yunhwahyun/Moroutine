import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { buildPermissions, GUEST_PERMISSIONS } from '@/lib/permissions'
import type {
  AccountRole,
  PlanCode,
  Permissions,
  SpecialAccess,
  Subscription,
  SubscriptionPlan,
} from '@/types'

// 서버에서 검증된 값을 신뢰하지 않는 fallback — 조회 실패/누락 시 무제한을 허용하지 않는다.
const FAIL_SAFE_PLAN_LIMITS: Pick<
  SubscriptionPlan,
  'personal_word_limit' | 'sync_enabled' | 'bulk_import_enabled' | 'public_wordbook_enabled'
> = {
  personal_word_limit: 0,
  sync_enabled: false,
  bulk_import_enabled: false,
  public_wordbook_enabled: false,
}

type PermissionsQueryData = {
  role: AccountRole
  specialAccess: SpecialAccess
  subscription: Pick<Subscription, 'plan_code' | 'status'> | null
  plans: Partial<Record<PlanCode, SubscriptionPlan>>
}

async function fetchPermissionsData(userId: string): Promise<PermissionsQueryData> {
  const [profileResult, subscriptionResult, plansResult] = await Promise.all([
    supabase.from('profiles').select('role, special_access').eq('id', userId).single(),
    supabase
      .from('subscriptions')
      .select('plan_code, status')
      .eq('user_id', userId)
      .in('status', ['active', 'grace_period', 'billing_retry'])
      .limit(1)
      .maybeSingle(),
    supabase.from('subscription_plans').select('*'),
  ])

  if (profileResult.error) throw profileResult.error
  if (subscriptionResult.error) throw subscriptionResult.error
  if (plansResult.error) throw plansResult.error

  const plans: Partial<Record<PlanCode, SubscriptionPlan>> = {}
  for (const plan of plansResult.data ?? []) {
    plans[plan.code as PlanCode] = plan as SubscriptionPlan
  }

  return {
    role: (profileResult.data?.role as AccountRole | undefined) ?? 'user',
    specialAccess: (profileResult.data?.special_access as SpecialAccess | undefined) ?? 'none',
    subscription: subscriptionResult.data,
    plans,
  }
}

// docs/PERMISSION_DESIGN.md §9 — 로그인 시 role/special_access/구독/요금제를 조회해
// buildPermissions()로 변환한다. Guest(비로그인)는 서버 조회 없이 고정된 Guest 권한을 반환한다.
export function usePermissions(): { permissions: Permissions | null; isLoading: boolean } {
  const { user, isLoading: isAuthLoading } = useAuthStore()

  const query = useQuery({
    queryKey: ['permissions', user?.id],
    queryFn: () => fetchPermissionsData(user!.id),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  })

  if (isAuthLoading) {
    return { permissions: null, isLoading: true }
  }

  if (!user) {
    return { permissions: GUEST_PERMISSIONS, isLoading: false }
  }

  if (!query.data) {
    return { permissions: null, isLoading: query.isLoading }
  }

  const permissions = buildPermissions({
    role: query.data.role,
    specialAccess: query.data.specialAccess,
    subscription: query.data.subscription,
    plans: {
      pro: query.data.plans.pro ?? FAIL_SAFE_PLAN_LIMITS,
      premium: query.data.plans.premium ?? FAIL_SAFE_PLAN_LIMITS,
    },
    isAuthenticated: true,
  })

  return { permissions, isLoading: false }
}
