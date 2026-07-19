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
      <GuestMigrationGate />
      <DowngradeGate />
    </>
  )
}

export default function App() {
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
