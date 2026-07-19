import { Link, Outlet, useLocation } from 'react-router-dom'

const TABS = [
  { to: '/admin', label: '홈' },
  { to: '/admin/wordbooks', label: '공용 단어장' },
  { to: '/admin/masters', label: 'Master 관리' },
  { to: '/admin/audit-log', label: '감사 로그' },
]

// docs/ADMIN_DESIGN.md §2 — 일반 사용자 라우트(AppLayout, 하단 탭)와 완전히 분리된 관리자 전용 레이아웃.
export default function AdminLayout() {
  const location = useLocation()

  return (
    <div className="min-h-dvh bg-gray-50">
      <div
        className="bg-white border-b border-gray-100 px-6 flex items-center justify-between"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <nav className="flex gap-1 py-3">
          {TABS.map((tab) => {
            const isActive =
              tab.to === '/admin' ? location.pathname === '/admin' : location.pathname.startsWith(tab.to)
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                  isActive ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>
        <Link to="/" className="text-xs text-gray-400">
          앱으로 돌아가기
        </Link>
      </div>
      <Outlet />
    </div>
  )
}
