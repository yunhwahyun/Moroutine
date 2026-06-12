import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'

export default function AppLayout() {
  return (
    <div className="flex flex-col min-h-dvh bg-gray-50">
      <main className="flex-1 pb-16">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
