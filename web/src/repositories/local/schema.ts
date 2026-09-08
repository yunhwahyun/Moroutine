import Dexie, { type Table } from 'dexie'
import type {
  Book,
  BookChapter,
  NotificationRecord,
  Schedule,
  ScheduleException,
  SessionType,
  UserSettings,
  Word,
  Wordbook,
} from '@/types'

// docs/DATA_STORAGE_DESIGN.md §7 — Guest 정본 데이터 저장소(IndexedDB).
// 실제 도메인 타입(Word/Wordbook/Schedule)이 이미 snake_case로 Supabase row와 동일한 형태라,
// Local 테이블도 그대로 같은 타입을 사용해 Local↔Remote 매핑 계층을 없앤다(§8 원칙과 동일한 목적,
// 문서의 camelCase 가정과 달리 실제 코드 타입이 snake_case라 이 형태가 매핑 비용이 0으로 더 낮다).
// speaking* 테이블은 아직 Repository 메서드가 없어 이번 단계에서는 생성하지 않는다
// (Phase 23에서 해당 기능이 Repository에 연결될 때 버전을 올려 추가한다).
//
// ⚠️ v1은 이미 실제 배포되어 사용자 IndexedDB에 존재한다 — 이 시점부터 스토어를 추가할 때는
// 반드시 새 버전(this.version(N).stores({...}))으로 추가해야 한다(§10 참고). 새 스토어만 추가하는
// 경우 .upgrade() 콜백 없이도 Dexie가 빈 테이블로 자동 생성한다(2026-09-08, 개인 책장 추가 시 처음
// 적용한 선례 — version(2) 참고).

export const GUEST_USER_ID = 'guest'

export type LocalStudySession = {
  id: string
  session_type: SessionType
  wordbook_ids: string[] | null
  total_count: number
  correct_count: number
  wrong_count: number
  completed_at: string | null
  created_at: string
}

export type LocalStudyResult = {
  id: string
  session_id: string | null
  word_id: string
  is_correct: boolean
  attempt_count: number
  answered_at: string
}

export type LocalSettingsRow = UserSettings & { id: 'local' }

class LocalDB extends Dexie {
  wordbooks!: Table<Wordbook, string>
  words!: Table<Word, string>
  schedules!: Table<Schedule, string>
  scheduleExceptions!: Table<ScheduleException, string>
  notifications!: Table<NotificationRecord, string>
  studySessions!: Table<LocalStudySession, string>
  studyResults!: Table<LocalStudyResult, string>
  settings!: Table<LocalSettingsRow, string>
  meta!: Table<{ key: string; value: unknown }, string>
  books!: Table<Book, string>
  bookChapters!: Table<BookChapter, string>

  constructor() {
    super('moroutine_local_db')
    this.version(1).stores({
      wordbooks: 'id, created_at',
      words: 'id, wordbook_id, status, next_review_at, created_at',
      schedules: 'id, starts_at',
      scheduleExceptions: 'id, [schedule_id+occurrence_date], occurrence_date',
      notifications: 'id, schedule_id, is_cancelled',
      studySessions: 'id, created_at',
      studyResults: 'id, session_id, word_id',
      settings: 'id',
      meta: 'key',
    })
    // v1은 이미 실사용 Guest 기기에 배포돼 있어(§10) 새 스토어는 반드시 새 버전으로 추가한다 —
    // 개인 책장(books/bookChapters) 신규 추가, 기존 스토어는 무변경.
    this.version(2).stores({
      books: 'id, created_at',
      bookChapters: 'id, book_id, sort_order, created_at',
    })
  }
}

export const localDB = new LocalDB()
