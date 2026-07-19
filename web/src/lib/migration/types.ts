import type { Schedule, ScheduleException, Wordbook, Word } from '@/types'
import type { LocalStudyResult, LocalStudySession } from '@/repositories/local/schema'

// docs/MIGRATION_DESIGN.md §2, §3 — Guest(로컬) → Pro/Premium/Master(원격) 데이터 이전.

export type LocalSnapshot = {
  wordbooks: Wordbook[]
  words: Word[]
  schedules: Schedule[]
  scheduleExceptions: ScheduleException[]
  studySessions: LocalStudySession[]
  studyResults: LocalStudyResult[]
}

// docs/UI_FLOW.md "Guest → Pro/Premium 전환 확인 모달" — 요약 카드에 표시할 개수.
// 로컬 녹음(speaking)은 아직 Repository/스키마 자체가 없어(Phase 23) 집계 대상에서 제외한다.
export type LocalDataSummary = {
  wordbookCount: number
  wordCount: number
  studyHistoryCount: number   // study_results 총 건수
  reviewDueCount: number      // status='reviewing'이고 next_review_at이 현재 이하인 단어 수
  scheduleCount: number
  hasAnyData: boolean
}

export type MigrationEntityType =
  | 'wordbook'
  | 'word'
  | 'schedule'
  | 'schedule_exception'
  | 'study_session'
  | 'study_result'
  | 'notification'

export type MigrationPhase =
  | 'idle'
  | 'in_progress'
  | 'verifying'
  | 'completed'
  | 'failed'

export type MigrationProgress = {
  phase: MigrationPhase
  currentEntity: MigrationEntityType | null
  processedRecords: number
  totalRecords: number
  errorMessage: string | null
}
