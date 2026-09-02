import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export async function fetchAppConfig(): Promise<{ paymentsEnabled: boolean }> {
  const { data, error } = await supabase.from('app_config').select('payments_enabled').eq('id', true).single()
  if (error) throw error
  return { paymentsEnabled: data.payments_enabled }
}

// docs/SUBSCRIPTION_DESIGN.md §11 — 앱 전체 결제 스위치(사용자별 타이머 아님). 인증 여부와 무관하게
// 항상 조회(Guest도 /pricing에서 필요)하고, 거의 바뀌지 않는 값이라 staleTime을 길게 둔다.
// 로딩/에러 시에는 결제 UI를 노출하지 않는 쪽(false)으로 fail-safe한다 — 반대로 fail하면(true 기본값)
// 실제로는 꺼져 있는데 잠깐이라도 구매 버튼이 보일 위험이 있다(심사 중 결제 UI 비노출 요구사항과 상충).
export function useAppConfig() {
  const { data, isLoading } = useQuery({
    queryKey: ['app-config'],
    queryFn: fetchAppConfig,
    staleTime: 10 * 60 * 1000,
  })
  return { paymentsEnabled: data?.paymentsEnabled ?? false, isLoading }
}
