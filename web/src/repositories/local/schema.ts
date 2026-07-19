import Dexie, { type Table } from 'dexie'
import type {
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
// ⚠️ 아직 배포된 적 없는 스키마이므로(실사용 Guest 데이터 없음) 버전을 올리지 않고 version(1)에 직접
// 스토어를 추가한다. 이 앱이 실제 배포되어 사용자 IndexedDB에 v1이 이미 존재하는 시점부터는 스토어 추가 시
// 반드시 새 버전(this.version(2).stores({...}).upgrade(...))으로 마이그레이션해야 한다(§10 참고).

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
  }
}

export const localDB = new LocalDB()
