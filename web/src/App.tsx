import { useEffect } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useLoadSettings } from '@/hooks/useUserSettings'
import { useBridgeListener } from '@/hooks/useBridgeListener'
import { useSubscriptionRealtimeSync } from '@/hooks/useSubscriptionRealtimeSync'
import { bridge, isNative } from '@/bridge'
import GuestMigrationGate from '@/components/migration/GuestMigrationGate'
import DowngradeGate from '@/components/migration/DowngradeGate'
import SignupPricingGate from '@/components/onboarding/SignupPricingGate'
import SampleWordbookSeedGate from '@/components/onboarding/SampleWordbookSeedGate'
import SettingsSeedGate from '@/components/onboarding/SettingsSeedGate'
import GlobalAutoPlayBar from '@/components/autoplay/GlobalAutoPlayBar'
import AppRoutes from '@/routes'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
})

function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setSession, setLoading } = useAuthStore()
  useLoadSettings()
  useBridgeListener()
  useSubscriptionRealtimeSync()

  useEffect(() => {
    // 초기 세션 복원
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
      if (isNative()) bridge.setUserId({ userId: session?.user?.id ?? null })
    })

    // 세션 변경 구독 — 네이티브에 로그인 상태 전달(RevenueCat app_user_id를 Supabase user_id와 맞추기 위함)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setLoading(false)
      if (isNative()) bridge.setUserId({ userId: session?.user?.id ?? null })
    })

    return () => subscription.unsubscribe()
  }, [setSession, setLoading])

  return (
    <>
      {children}
      <SignupPricingGate />
      <SampleWordbookSeedGate />
      <SettingsSeedGate />
      <GuestMigrationGate />
      <DowngradeGate />
      <GlobalAutoPlayBar />
    </>
  )
}

export default function App() {
  // 네이티브(mobile/App.tsx)는 이 신호(WEB_READY)를 받기 전까지 보내는 메시지를 전부 큐에만
  // 쌓아두고 실제로 전달하지 않는다 — 이 호출이 빠져 있으면 알림/구매 결과/자동재생 진행 상황 등
  // 네이티브가 보내는 모든 메시지가 영원히 화면에 반영되지 않는다(실기기에서 확인된 근본 원인).
  useEffect(() => {
    if (isNative()) bridge.ready()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
