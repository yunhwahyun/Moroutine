import { localDB } from '@/repositories/local/schema'
import type { LocalDataSummary, LocalSnapshot } from './types'

// docs/MIGRATION_DESIGN.md — 이전 엔진 전용. 화면은 이 함수를 직접 쓰지 않고
// useGuestMigration() 훅을 거친다. LocalDataRepository가 아니라 localDB를 직접 읽는 이유는
// 이전에는 "로컬 ID를 보존한 전체 스냅샷"이 필요한데(개별 CRUD 인터페이스로는 로컬 ID를 노출하지 않음),
// 화면 표시용 도메인 타입(Word/Wordbook 등)은 애초에 로컬 ID를 그대로 id 필드에 담고 있어 문제없다.
export async function readLocalSnapshot(): Promise<LocalSnapshot> {
  const [wordbooks, words, schedules, scheduleExceptions, studySessions, studyResults] = await Promise.all([
    localDB.wordbooks.toArray(),
    localDB.words.toArray(),
    localDB.schedules.toArray(),
    localDB.scheduleExceptions.toArray(),
    localDB.studySessions.toArray(),
    localDB.studyResults.toArray(),
  ])
  return { wordbooks, words, schedules, scheduleExceptions, studySessions, studyResults }
}

export async function readLocalDataSummary(): Promise<LocalDataSummary> {
  const snapshot = await readLocalSnapshot()
  const now = new Date().toISOString()
  const reviewDueCount = snapshot.words.filter(
    (w) => w.status === 'reviewing' && w.next_review_at !== null && w.next_review_at <= now,
  ).length

  const wordbookCount = snapshot.wordbooks.length
  const wordCount = snapshot.words.length
  const studyHistoryCount = snapshot.studyResults.length
  const scheduleCount = snapshot.schedules.length

  return {
    wordbookCount,
    wordCount,
    studyHistoryCount,
    reviewDueCount,
    scheduleCount,
    hasAnyData: wordbookCount > 0 || wordCount > 0 || studyHistoryCount > 0 || scheduleCount > 0,
  }
}
