import { useLocation } from 'react-router-dom'
import { useAutoplayStore } from '@/stores/autoplayStore'
import AutoPlayBar from './AutoPlayBar'

// routes/index.tsx에서 AppLayout(BottomNav 포함) 하위에 있는 라우트 목록 — 여기 있으면 미니
// 플레이어를 BottomNav 위에, 없으면 화면 맨 아래에 붙인다. 라우트 구성이 바뀌면 함께 갱신할 것.
const BOTTOM_NAV_ROUTES = ['/', '/wordbooks', '/public-wordbooks', '/schedules', '/settings']

// 자동재생은 특정 페이지에 묶이지 않는 전역 상태(stores/autoplayStore.ts)라, 미니 플레이어도
// 페이지마다 따로 그리지 않고 앱 루트에 한 번만 마운트한다 — 페이지를 이동해도 재생이 끊기지 않고,
// 항상 같은 위치에 뜬다(docs/DECISION_LOG.md 참고).
export default function GlobalAutoPlayBar() {
  const { pathname } = useLocation()
  const { active, items, index, playing, rate, toggle, next, previous, setRate, close } = useAutoplayStore()

  if (!active || !items[index]) return null

  const hasBottomNav = BOTTOM_NAV_ROUTES.includes(pathname)

  return (
    <div
      className="fixed inset-x-0 z-40 px-4"
      style={{
        bottom: hasBottomNav
          ? 'calc(env(safe-area-inset-bottom) + 92px)'
          : 'max(calc(env(safe-area-inset-bottom) + 10px), 1.25rem)',
      }}
    >
      <AutoPlayBar
        term={items[index].term}
        caption={items[index].caption}
        index={index}
        total={items.length}
        playing={playing}
        rate={rate}
        onToggle={toggle}
        onNext={next}
        onPrevious={previous}
        onRateChange={setRate}
        onClose={close}
      />
    </div>
  )
}
