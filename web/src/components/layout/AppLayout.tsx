import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import RetentionBanner from '@/components/retention/RetentionBanner'

export default function AppLayout() {
  return (
    <div className="flex flex-col min-h-dvh bg-gray-50" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <RetentionBanner />
      <main className="flex-1 pb-24">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
