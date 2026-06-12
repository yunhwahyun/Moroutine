import { NavLink } from 'react-router-dom'

const tabs = [
  {
    to: '/',
    label: '홈',
    icon: (active: boolean) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path
          d="M3 12L12 3L21 12V21H15V15H9V21H3V12Z"
          stroke={active ? '#2563EB' : '#9CA3AF'}
          strokeWidth="2"
          strokeLinejoin="round"
          fill={active ? '#EFF6FF' : 'none'}
        />
      </svg>
    ),
  },
  {
    to: '/wordbooks',
    label: '단어장',
    icon: (active: boolean) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect
          x="3"
          y="3"
          width="18"
          height="18"
          rx="2"
          stroke={active ? '#2563EB' : '#9CA3AF'}
          strokeWidth="2"
          fill={active ? '#EFF6FF' : 'none'}
        />
        <path
          d="M7 8H17M7 12H17M7 16H13"
          stroke={active ? '#2563EB' : '#9CA3AF'}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    to: '/schedules',
    label: '일정',
    icon: (active: boolean) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect
          x="3"
          y="4"
          width="18"
          height="18"
          rx="2"
          stroke={active ? '#2563EB' : '#9CA3AF'}
          strokeWidth="2"
          fill={active ? '#EFF6FF' : 'none'}
        />
        <path
          d="M16 2V6M8 2V6M3 10H21"
          stroke={active ? '#2563EB' : '#9CA3AF'}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: '설정',
    icon: (active: boolean) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 00-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 00-2.282.819l-.922 1.597a1.875 1.875 0 00.432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 000 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 00-.432 2.385l.922 1.597a1.875 1.875 0 002.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 002.28-.819l.923-1.597a1.875 1.875 0 00-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 000-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 00-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 00-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 00-1.85-1.567h-1.843zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z"
          fill={active ? '#2563EB' : '#9CA3AF'}
        />
      </svg>
    ),
  },
]

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 safe-area-inset-bottom">
      <div className="flex">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className="flex-1 flex flex-col items-center gap-0.5 py-2"
          >
            {({ isActive }) => (
              <>
                {tab.icon(isActive)}
                <span
                  className={`text-[10px] font-medium ${isActive ? 'text-blue-600' : 'text-gray-400'}`}
                >
                  {tab.label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
