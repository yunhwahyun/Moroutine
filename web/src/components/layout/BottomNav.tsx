import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/',          label: '홈',    no: '01' },
  { to: '/wordbooks', label: '단어장', no: '02' },
  { to: '/schedules', label: '일정',  no: '03' },
  { to: '/settings',  label: '설정',  no: '04' },
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
                <img
                  src={isActive ? `/menu-${tab.no}-on.svg` : `/menu-${tab.no}.svg`}
                  alt={tab.label}
                  className="w-6 h-6"
                />
                <span className={`text-[10px] font-medium ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>
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
