import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

type RetentionSchedule = {
  id: string
  retention_expires_at: string
}

async function fetchActiveRetention(userId: string): Promise<RetentionSchedule | null> {
  const { data, error } = await supabase
    .from('retention_schedules')
    .select('id, retention_expires_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('retention_expires_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

// docs/DATA_RETENTION_DESIGN.md §6-1/§6-3 편차(2026-07-18) — Supabase Auth 기본 메일 템플릿이 임의 내용의
// 알림에 맞지 않아 이메일(retention-notify) 대신 앱 내 배너로 구현. AppLayout 상단에 마운트해
// "앱 열기" 진입점 요구사항을 충족한다.
export default function RetentionBanner() {
  const { user } = useAuthStore()

  const { data: schedule } = useQuery({
    queryKey: ['retention-schedule', user?.id],
    queryFn: () => fetchActiveRetention(user!.id),
    enabled: !!user,
  })

  if (!schedule) return null

  const expiresAt = new Date(schedule.retention_expires_at)
  const daysLeft = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  const isUrgent = daysLeft <= 7
  const dateLabel = expiresAt.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })

  return (
    <div className={`px-4 py-3 text-xs leading-relaxed ${isUrgent ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
      구독이 종료되어 클라우드 데이터가 {dateLabel}에 삭제될 예정입니다.
      <br />
      삭제 전 앱을 열어 데이터를 기기에 저장하거나 구독을 복원해주세요.
    </div>
  )
}
