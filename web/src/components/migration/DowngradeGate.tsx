import { usePermissions } from '@/hooks/usePermissions'
import { useAuthStore } from '@/stores/authStore'
import { useSubscriptionDowngrade } from '@/hooks/useSubscriptionDowngrade'
import { isSignupPending } from '@/lib/signupFlow'
import DowngradeModal from './DowngradeModal'

// docs/SUBSCRIPTION_DESIGN.md §6, docs/UI_FLOW.md "만료/Master 해제/미결제 가입 → Guest 전환 안내" —
// get_service_tier()가 'guest'를 반환하는데 세션은 아직 인증 상태인 경우(구독 만료/해지,
// Master 해제, 또는 결제 이력 없이 가입만 한 경우 모두 포함 — migration 15 주석의
// downgrade_pending 전이 상태)를 감지해 닫을 수 없는 안내 모달을 띄운다.
// App.tsx의 AuthProvider 안에서 GuestMigrationGate와 나란히 한 번만 마운트한다.
// 회원가입 직후(SignupPricingGate가 /pricing으로 먼저 보내는 구간)에는 이 모달을 띄우지 않는다 —
// isSignupPending()이 true인 동안은 SignupPricingGate가 전담하고, PricingPage의
// "무료로 계속 사용하기"를 선택하거나 결제가 완료돼야 이 게이트가 다시 개입한다.
export default function DowngradeGate() {
  const { permissions } = usePermissions()
  const { user } = useAuthStore()
  const { progress, start } = useSubscriptionDowngrade()

  const shouldDowngrade =
    !!user && !!permissions && permissions.serviceTier === 'guest' && permissions.isAuthenticated && !isSignupPending()

  if (!shouldDowngrade) return null

  const handleStart = () => {
    if (user) start(user.id).catch((err) => console.error('[subscription downgrade]', err))
  }

  return <DowngradeModal progress={progress} onStart={handleStart} onRetry={handleStart} />
}
