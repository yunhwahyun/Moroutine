import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { usePermissions } from '@/hooks/usePermissions'

// docs/ADMIN_DESIGN.md §2 — 관리자는 사용자용 URL에 접근할 수 없다(주소창 직접 입력 포함).
// ProtectedRoute.tsx와 동일한 로딩 처리 패턴 — 로그인/권한 조회가 끝나기 전에는 리다이렉트하지 않는다.
export default function UserRouteGuard() {
  const { user, isLoading: isAuthLoading } = useAuthStore()
  const { permissions, isLoading: isPermissionsLoading } = usePermissions()

  if (isAuthLoading || (!!user && isPermissionsLoading)) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
      </div>
    )
  }

  if (permissions?.serviceTier === 'admin') {
    return <Navigate to="/admin/wordbooks" replace />
  }

  return <Outlet />
}
