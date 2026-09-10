import { useLocation } from 'react-router-dom'
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
//
// docs/launch/PHASE1_POLICY.md §3.2(2026-09-10 QA 발견): Master 초대 링크를 클릭하면 세션은 즉시
// 생기지만 special_access='master'는 MasterAcceptPage의 동의 폼을 제출해야 부여된다 — 그 사이엔
// authenticated+guest 상태가 (사용자가 체크박스를 누르는 동안) 꽤 길게 지속된다. 라우트 구분 없이
// 전역으로 뜨는 이 모달이 그 틈에 끼어들어 MasterAcceptPage 위를 덮어버리는 버그가 있었다.
// /terms, /privacy도 동일 — 동의 폼에서 약관/방침 링크를 새 탭으로 열면 같은 세션 상태(인증+guest)로
// 그 페이지에 도달하므로 여기서도 떠서는 안 된다(2026-09-10 QA에서 추가 발견).
const EXEMPT_PATHS = ['/master/accept', '/terms', '/privacy']

export default function DowngradeGate() {
  const { permissions } = usePermissions()
  const { user } = useAuthStore()
  const { progress, start } = useSubscriptionDowngrade()
  const { pathname } = useLocation()

  const shouldDowngrade =
    !!user &&
    !!permissions &&
    permissions.serviceTier === 'guest' &&
    permissions.isAuthenticated &&
    !isSignupPending() &&
    !EXEMPT_PATHS.includes(pathname)

  if (!shouldDowngrade) return null

  const handleStart = () => {
    if (user) start(user.id).catch((err) => console.error('[subscription downgrade]', err))
  }

  return <DowngradeModal progress={progress} onStart={handleStart} onRetry={handleStart} />
}
