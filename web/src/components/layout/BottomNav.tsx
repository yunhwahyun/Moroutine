import { useRef, useLayoutEffect, useEffect, useState, useCallback } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

const tabs = [
  { to: '/',          label: '홈',    no: '01' },
  { to: '/wordbooks', label: '단어장', no: '02' },
  { to: '/schedules', label: '일정',  no: '03' },
  { to: '/settings',  label: '설정',  no: '04' },
]

function getActiveIndex(pathname: string) {
  if (pathname === '/') return 0
  const idx = tabs.findIndex((tab, i) =>
    i > 0 && (pathname === tab.to || pathname.startsWith(tab.to + '/'))
  )
  return idx === -1 ? 0 : idx
}

export default function BottomNav() {
  const { pathname } = useLocation()
  const activeIndex = getActiveIndex(pathname)

  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const [indicatorPos, setIndicatorPos] = useState({ left: 0, width: 54 })
  const [animated, setAnimated] = useState(false)

  const updateIndicator = useCallback((animate: boolean) => {
    const el = itemRefs.current[activeIndex]
    const container = containerRef.current
    if (!el || !container) return
    const cr = container.getBoundingClientRect()
    const ir = el.getBoundingClientRect()
    setIndicatorPos({ left: ir.left - cr.left, width: ir.width })
    if (animate) setAnimated(true)
  }, [activeIndex])

  useLayoutEffect(() => {
    updateIndicator(true)
  }, [updateIndicator])

  useEffect(() => {
    const onResize = () => updateIndicator(false)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [updateIndicator])

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 pt-4 px-4"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1rem)' }}
    >
      <nav className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.10)] py-[6px] px-[6px]">
        <div ref={containerRef} className="relative flex justify-between items-center">

          {/* 슬라이딩 indicator */}
          <div
            className="absolute top-0 h-[46px] rounded-xl bg-gray-100 shadow-sm pointer-events-none"
            style={{
              left: indicatorPos.left,
              width: indicatorPos.width,
              transition: animated ? 'left 180ms cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
            }}
          />

          {tabs.map((tab, i) => (
            <NavLink key={tab.to} to={tab.to} end={tab.to === '/'}>
              {({ isActive }) => (
                <div
                  ref={(el) => { itemRefs.current[i] = el }}
                  className="relative z-10 flex items-center justify-center h-[46px] w-[54px]"
                >
                  <img
                    src={isActive ? `/menu-${tab.no}-on.svg` : `/menu-${tab.no}.svg`}
                    alt={tab.label}
                    className="w-5 h-5"
                    style={{
                      transform: isActive ? 'translateY(-7px)' : 'translateY(0)',
                      transition: isActive
                        ? 'transform 200ms ease-out 180ms'
                        : 'transform 200ms ease-out',
                    }}
                  />
                  <span
                    className="absolute inset-x-0 bottom-[8px] flex justify-center text-[10px] font-medium leading-none text-gray-800"
                    style={{
                      opacity: isActive ? 1 : 0,
                      transform: isActive ? 'translateY(3px)' : 'translateY(9px)',
                      transition: isActive
                        ? 'opacity 200ms ease-out 180ms, transform 200ms ease-out 180ms'
                        : 'opacity 200ms ease-out, transform 200ms ease-out',
                      pointerEvents: 'none',
                    }}
                  >
                    {tab.label}
                  </span>
                </div>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
