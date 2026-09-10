import { Navigate, Outlet } from 'react-router-dom'
import { usePermissions } from '@/hooks/usePermissions'

// docs/launch/PHASE1_POLICY.md §8(B안 확정) — 공용 단어장/책장은 Guest에게 메뉴 자체를 숨기는 것만으로
// 끝내지 않고, URL 직접 입력으로도 접근할 수 없도록 라우트 레벨에서 막는다. Master는 신청/구매로
// 얻는 등급이 아니므로 "로그인하면 이용 가능"류의 CTA는 도달할 방법이 없어 논리적으로 성립하지
// 않는다 — 그래서 안내 문구 없이 조용히 홈으로 되돌려보낸다.
export default function PublicContentGuestGuard() {
  const { permissions, isLoading } = usePermissions()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
      </div>
    )
  }

  if (permissions?.serviceTier === 'guest') {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
