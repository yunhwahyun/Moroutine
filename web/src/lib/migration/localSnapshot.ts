import { localDB } from '@/repositories/local/schema'
import type { LocalDataSummary, LocalSnapshot } from './types'

// hashtags 컬럼 추가(마이그레이션 51, 2026-09-15) 이전에 저장된 레코드는 이 필드 자체가 없다 —
// LocalDataRepository.ts의 동명 함수와 같은 이유(Dexie가 기존 레코드에 새 필드를 소급 적용하지
// 않음). 이 파일은 LocalDataRepository를 거치지 않고 localDB를 직접 읽어서 별도로 방어해야 한다.
function withHashtags<T extends { hashtags?: string[] }>(row: T): T & { hashtags: string[] } {
  return { ...row, hashtags: row.hashtags ?? [] }
}

// docs/MIGRATION_DESIGN.md — 이전 엔진 전용. 화면은 이 함수를 직접 쓰지 않고
// useGuestMigration() 훅을 거친다. LocalDataRepository가 아니라 localDB를 직접 읽는 이유는
// 이전에는 "로컬 ID를 보존한 전체 스냅샷"이 필요한데(개별 CRUD 인터페이스로는 로컬 ID를 노출하지 않음),
// 화면 표시용 도메인 타입(Word/Wordbook 등)은 애초에 로컬 ID를 그대로 id 필드에 담고 있어 문제없다.
export async function readLocalSnapshot(): Promise<LocalSnapshot> {
  const [wordbooks, words, books, bookChapters, schedules, scheduleExceptions, studySessions, studyResults] =
    await Promise.all([
      localDB.wordbooks.toArray(),
      localDB.words.toArray(),
      localDB.books.toArray(),
      localDB.bookChapters.toArray(),
      localDB.schedules.toArray(),
      localDB.scheduleExceptions.toArray(),
      localDB.studySessions.toArray(),
      localDB.studyResults.toArray(),
    ])
  return {
    wordbooks: wordbooks.map(withHashtags),
    words,
    books: books.map(withHashtags),
    bookChapters,
    schedules,
    scheduleExceptions,
    studySessions,
    studyResults,
  }
}

export async function readLocalDataSummary(): Promise<LocalDataSummary> {
  const snapshot = await readLocalSnapshot()
  const now = new Date().toISOString()
  const reviewDueCount = snapshot.words.filter(
    (w) => w.status === 'reviewing' && w.next_review_at !== null && w.next_review_at <= now,
  ).length

  const wordbookCount = snapshot.wordbooks.length
  const wordCount = snapshot.words.length
  const bookCount = snapshot.books.length
  const chapterCount = snapshot.bookChapters.length
  const studyHistoryCount = snapshot.studyResults.length
  const scheduleCount = snapshot.schedules.length

  return {
    wordbookCount,
    wordCount,
    bookCount,
    chapterCount,
    studyHistoryCount,
    reviewDueCount,
    scheduleCount,
    hasAnyData:
      wordbookCount > 0 || wordCount > 0 || bookCount > 0 || chapterCount > 0 ||
      studyHistoryCount > 0 || scheduleCount > 0,
  }
}
