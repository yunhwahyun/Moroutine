import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { usePermissions } from '@/hooks/usePermissions'

type ProtectedRouteProps = {
  // docs/PERMISSION_DESIGN.md — role은 서버 조회 값(permissions.canAccessAdmin)으로만 판정한다.
  requireRole?: 'admin'
}

export default function ProtectedRoute({ requireRole }: ProtectedRouteProps) {
  const { user, isLoading: isAuthLoading } = useAuthStore()
  const { permissions, isLoading: isPermissionsLoading } = usePermissions()

  if (isAuthLoading || (!!requireRole && isPermissionsLoading)) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (requireRole === 'admin' && !permissions?.canAccessAdmin) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
