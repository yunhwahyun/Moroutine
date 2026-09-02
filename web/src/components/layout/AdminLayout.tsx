import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'

// docs/ADMIN_DESIGN.md §2 — 사용자용 AppLayout과 동일한 구조(main+BottomNav)를 쓰되,
// BottomNav 자신이 tier에 따라 관리자용 탭(단어장/Master/LOG/설정)으로 분기한다.
// 상단 pill 탭과 "앱으로 돌아가기" 링크는 제거됐다 — 관리자는 UserRouteGuard로 사용자 URL 접근이
// 막혀 있으므로 그쪽으로 "돌아갈" 출구를 굳이 둘 필요가 없다.
export default function AdminLayout() {
  return (
    <div className="flex flex-col min-h-dvh bg-gray-50" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <main className="flex-1 pb-24">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
