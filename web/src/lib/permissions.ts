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
  // docs/SUBSCRIPTION_DESIGN.md §11 — 앱 전체 결제 스위치(app_config.payments_enabled). false인 동안은
  // 로그인한 사용자 전원을 Pro로 취급한다(사업자 등록 전 무료 출시 기간, 2026-09-02).
  paymentsEnabled: boolean
}

// docs/PERMISSION_DESIGN.md §3 — role=admin > special_access=master > 활성 Pro > (결제 미활성 시
// 로그인 사용자는 Pro) > Guest (2026-09-02: Premium 티어 폐지, Pro만 유지 — docs/DECISION_LOG.md 2026-09-02)
function resolveServiceTier(input: BuildPermissionsInput): ServiceTier {
  if (input.role === 'admin') return 'admin'
  if (input.specialAccess === 'master') return 'master'

  const hasActiveSub = (code: PlanCode) =>
    input.subscription?.plan_code === code &&
    ACTIVE_SUBSCRIPTION_STATUSES.includes(input.subscription.status)

  if (hasActiveSub('pro')) return 'pro'
  // 결제가 아직 없는 무료 출시 기간 — 반드시 isAuthenticated를 함께 봐야 한다(비로그인 Guest까지
  // Pro로 승격되면 안 됨).
  if (input.isAuthenticated && !input.paymentsEnabled) return 'pro'
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

  // pro
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
  paymentsEnabled: true, // isAuthenticated=false라 무료 출시 기간 여부와 무관하게 항상 guest로 귀결됨
  plans: {
    pro: { personal_word_limit: null, sync_enabled: false, bulk_import_enabled: false, public_wordbook_enabled: false },
  },
})
