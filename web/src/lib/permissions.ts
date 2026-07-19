import type {
  AccountRole,
  PlanCode,
  Permissions,
  ServiceTier,
  SpecialAccess,
  Subscription,
  SubscriptionPlan,
} from '@/types'

const ACTIVE_SUBSCRIPTION_STATUSES: Subscription['status'][] = [
  'active',
  'grace_period',
  'billing_retry',
]

type PlanLimits = Pick<
  SubscriptionPlan,
  'personal_word_limit' | 'sync_enabled' | 'bulk_import_enabled' | 'public_wordbook_enabled'
>

export type BuildPermissionsInput = {
  role: AccountRole
  specialAccess: SpecialAccess
  subscription: Pick<Subscription, 'plan_code' | 'status'> | null
  plans: Record<PlanCode, PlanLimits>
  isAuthenticated: boolean
}

// docs/PERMISSION_DESIGN.md §3 — role=admin > special_access=master > 활성 Premium > 활성 Pro > Guest
function resolveServiceTier(input: BuildPermissionsInput): ServiceTier {
  if (input.role === 'admin') return 'admin'
  if (input.specialAccess === 'master') return 'master'

  const hasActiveSub = (code: PlanCode) =>
    input.subscription?.plan_code === code &&
    ACTIVE_SUBSCRIPTION_STATUSES.includes(input.subscription.status)

  if (hasActiveSub('premium')) return 'premium'
  if (hasActiveSub('pro')) return 'pro'
  return 'guest'
}

// docs/PERMISSION_DESIGN.md §6 — 반드시 서버에서 조회한 값으로만 호출한다.
// 클라이언트가 임의로 serviceTier를 지정해 이 함수를 우회하지 않도록 순수 함수로 유지한다.
export function buildPermissions(input: BuildPermissionsInput): Permissions {
  const serviceTier = resolveServiceTier(input)

  if (serviceTier === 'guest') {
    return {
      serviceTier,
      isAuthenticated: input.isAuthenticated,
      usesRemoteStorage: false,
      canSync: false,
      canBulkImport: false,
      canUsePublicWordbooks: false,
      personalWordLimit: null,
      canAccessAdmin: false,
    }
  }

  if (serviceTier === 'admin') {
    return {
      serviceTier,
      isAuthenticated: true,
      // docs/PERMISSION_DESIGN.md §8 결정 필요: Admin 개인 학습 기능 사용 여부. 잠정 false.
      usesRemoteStorage: false,
      canSync: false,
      canBulkImport: false,
      canUsePublicWordbooks: false,
      personalWordLimit: null,
      canAccessAdmin: true,
    }
  }

  if (serviceTier === 'master') {
    return {
      serviceTier,
      isAuthenticated: true,
      usesRemoteStorage: true,
      canSync: true,
      canBulkImport: true,
      canUsePublicWordbooks: true,
      personalWordLimit: null,
      canAccessAdmin: false,
    }
  }

  // pro | premium
  const plan = input.plans[serviceTier]
  return {
    serviceTier,
    isAuthenticated: true,
    usesRemoteStorage: true,
    canSync: plan.sync_enabled,
    canBulkImport: plan.bulk_import_enabled,
    canUsePublicWordbooks: plan.public_wordbook_enabled,
    personalWordLimit: plan.personal_word_limit,
    canAccessAdmin: false,
  }
}

export const GUEST_PERMISSIONS: Permissions = buildPermissions({
  role: 'user',
  specialAccess: 'none',
  subscription: null,
  isAuthenticated: false,
  plans: {
    pro: { personal_word_limit: null, sync_enabled: false, bulk_import_enabled: false, public_wordbook_enabled: false },
    premium: { personal_word_limit: null, sync_enabled: false, bulk_import_enabled: false, public_wordbook_enabled: false },
  },
})
