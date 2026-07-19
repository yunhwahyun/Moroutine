import { useCallback, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { runRemoteToLocalMigration } from '@/lib/migration/remoteToLocalMigration'
import type { MigrationProgress } from '@/lib/migration/types'

const IDLE_PROGRESS: MigrationProgress = {
  phase: 'idle', currentEntity: null, processedRecords: 0, totalRecords: 0, errorMessage: null,
}

// docs/SUBSCRIPTION_DESIGN.md §6 — 구독 만료/해지(또는 결제 이력 없는 가입) 강제 전환 모달의 상태/액션을 담당하는 훅.
// GuestMigrationGate/useGuestMigration과 달리 사용자 확인 없이 자동으로 시작되고,
// 성공(phase==='completed')한 뒤에만 로그아웃까지 이 훅이 직접 처리한다(§6 절차 3~8단계).
export function useSubscriptionDowngrade() {
  const [progress, setProgress] = useState<MigrationProgress>(IDLE_PROGRESS)

  const start = useCallback(async (userId: string) => {
    setProgress({ ...IDLE_PROGRESS, phase: 'in_progress' })
    const result = await runRemoteToLocalMigration(userId, setProgress)
    if (result.success) {
      await supabase.auth.signOut()
    }
    return result
  }, [])

  return { progress, start }
}
