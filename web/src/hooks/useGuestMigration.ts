import { useCallback, useState } from 'react'
import { readLocalDataSummary } from '@/lib/migration/localSnapshot'
import { runGuestToRemoteMigration } from '@/lib/migration/guestToRemoteMigration'
import { localDB } from '@/repositories/local/schema'
import type { LocalDataSummary, MigrationProgress } from '@/lib/migration/types'

const IDLE_PROGRESS: MigrationProgress = {
  phase: 'idle', currentEntity: null, processedRecords: 0, totalRecords: 0, errorMessage: null,
}

// docs/MIGRATION_DESIGN.md §2 — Guest→Pro 전환 확인 모달의 상태/액션을 담당하는 훅.
// 화면(모달 컴포넌트)은 이 훅만 사용하고 마이그레이션 엔진 내부 구조를 몰라도 된다.
export function useGuestMigration() {
  const [summary, setSummary] = useState<LocalDataSummary | null>(null)
  const [progress, setProgress] = useState<MigrationProgress>(IDLE_PROGRESS)

  const checkLocalData = useCallback(async () => {
    const result = await readLocalDataSummary()
    setSummary(result)
    return result
  }, [])

  const start = useCallback(async () => {
    setProgress({ ...IDLE_PROGRESS, phase: 'in_progress' })
    const result = await runGuestToRemoteMigration(setProgress)
    return result
  }, [])

  // "계정으로 이전" 완료 후, 또는 이전 없이 로컬 데이터만 지우고 싶을 때 호출한다.
  // docs/MIGRATION_DESIGN.md §5 — 계정으로 이전한 경우 성공 검증(phase==='completed') 전에는 호출 금지.
  const deleteLocalData = useCallback(async () => {
    await localDB.transaction(
      'rw',
      [localDB.wordbooks, localDB.words, localDB.books, localDB.bookChapters, localDB.schedules,
        localDB.scheduleExceptions, localDB.studySessions, localDB.studyResults],
      async () => {
        await Promise.all([
          localDB.wordbooks.clear(),
          localDB.words.clear(),
          localDB.books.clear(),
          localDB.bookChapters.clear(),
          localDB.schedules.clear(),
          localDB.scheduleExceptions.clear(),
          localDB.studySessions.clear(),
          localDB.studyResults.clear(),
        ])
      },
    )
  }, [])

  const reset = useCallback(() => {
    setProgress(IDLE_PROGRESS)
    setSummary(null)
  }, [])

  return { summary, progress, checkLocalData, start, deleteLocalData, reset }
}
