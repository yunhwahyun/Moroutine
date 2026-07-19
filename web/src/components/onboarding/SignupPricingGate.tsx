import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { usePermissions } from '@/hooks/usePermissions'
import { useAuthStore } from '@/stores/authStore'
import { isSignupPending } from '@/lib/signupFlow'

// docs/TODO.md Phase 16 후속 — 회원가입 완료 직후에는 DowngradeGate의 "유효한 구독이 없습니다"
// 강제 전환 모달보다 먼저 상품 선택 화면(/pricing)으로 보낸다. LoginPage에서 signUp() 성공 시
// 남긴 플래그(localStorage, 이메일 인증 링크가 새 탭에서 열려도 유지)가 있는 authenticated+guest
// 사용자를 /pricing으로 강제 리다이렉트한다. 결제하거나 PricingPage에서 "무료로 계속 사용하기"를
// 명시적으로 선택하기 전까지는 다른 화면으로 이동해도 계속 /pricing으로 되돌린다(강제 라우팅).
// 플래그가 없는 경우(기존 구독 만료/Master 해제 등)는 기존과 동일하게 DowngradeGate가 전담한다.
export default function SignupPricingGate() {
  const { user } = useAuthStore()
  const { permissions } = usePermissions()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (!user || !permissions) return
    if (!permissions.isAuthenticated || permissions.serviceTier !== 'guest') return
    if (!isSignupPending()) return
    if (location.pathname === '/pricing') return
    navigate('/pricing', { replace: true })
  }, [user, permissions, location.pathname, navigate])

  return null
}
