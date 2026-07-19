import type {
  NotificationRecord,
  Schedule,
  ScheduleException,
  SessionType,
  UserSettings,
  Word,
  Wordbook,
} from '@/types'

// docs/DATA_STORAGE_DESIGN.md §6 — 화면은 이 인터페이스만 호출하고, Local/Remote를 직접 분기하지 않는다.

export type CreateWordbookInput = {
  name: string
  description?: string | null
  language?: string | null
}
export type UpdateWordbookInput = Partial<Pick<Wordbook, 'name' | 'description' | 'language'>>

export type CreateWordInput = {
  wordbookId: string
  term: string
  definition: string
  description?: string | null
  example?: string | null
  memo?: string | null
}
export type UpdateWordInput = Partial<
  Pick<
    Word,
    | 'term'
    | 'definition'
    | 'description'
    | 'example'
    | 'memo'
    | 'status'
    | 'review_step'
    | 'first_passed_at'
    | 'next_review_at'
    | 'wrong_count'
  >
>

export type BulkCreateWordsInput = {
  wordbookId: string
  words: Array<{ term: string; definition: string; description?: string | null }>
}

// docs/SUBSCRIPTION_DESIGN.md §4 — Pro 한도 검증 결과. Remote(Pro)는 실제 검증값을 채우고,
// Local(Guest)/Premium/Master는 한도가 없으므로 blocked=false, limitValue=null 고정.
export type BulkCreateResult = {
  insertedCount: number
  currentTotal: number
  limitValue: number | null
  blocked: boolean
}

export type StudyResultInput = {
  sessionId: string | null
  wordId: string
  isCorrect: boolean
  attemptCount?: number
}

export type CreateStudySessionInput = {
  sessionType: SessionType
  wordbookIds: string[]
  totalCount: number
}

export type ReviewItem = Pick<
  Word,
  'id' | 'wordbook_id' | 'term' | 'definition' | 'description' | 'next_review_at'
>

type ScheduleFields = Omit<Schedule, 'id' | 'user_id' | 'created_at' | 'updated_at'>
// id 없으면 생성(전체 필드 필요), id 있으면 수정(부분 필드 허용)
export type ScheduleInput =
  | (ScheduleFields & { id?: undefined })
  | (Partial<ScheduleFields> & { id: string })

// 단건 등록/수정 — schedule_exceptions의 자연키(schedule_id, occurrence_date) 기준 upsert.
// 기존 행이 있으면 병합(수정), 없으면 신규 생성(cancelOccurrence는 exceptionType='cancelled'만 채워서 호출).
export type ScheduleExceptionInput = {
  scheduleId: string
  occurrenceDate: string
  exceptionType: ScheduleException['exception_type']
  originalStartsAt: string
  originalEndsAt: string | null
  title?: string | null
  location?: string | null
  startsAt?: string | null
  endsAt?: string | null
  isAllDay?: boolean | null
  alarmMinutes?: number | null
}

export type CreateNotificationInput = { scheduleId: string; fireAt: string }

// docs/SUBSCRIPTION_DESIGN.md §4-2 — createWord()가 한도 초과로 차단될 때 던지는 에러.
// bulkCreateWords()는 예외 대신 BulkCreateResult.blocked로 결과를 반환하지만(대량 등록은 부분 실패가 아니라
// "전량 차단"이라 예외 처리가 UX상 부자연스러움), 단건 등록은 Promise<Word> 반환 계약상 예외로 알릴 수밖에 없다.
export class WordLimitExceededError extends Error {
  constructor(public readonly currentTotal: number, public readonly limitValue: number) {
    super(`personal word limit exceeded: ${currentTotal}/${limitValue}`)
    this.name = 'WordLimitExceededError'
  }
}

export interface DataRepository {
  getWordbooks(): Promise<Wordbook[]>
  getWordbook(id: string): Promise<Wordbook | null>
  createWordbook(input: CreateWordbookInput): Promise<Wordbook>
  updateWordbook(id: string, input: UpdateWordbookInput): Promise<void>
  deleteWordbook(id: string): Promise<void>

  getWords(wordbookId: string): Promise<Word[]>
  createWord(input: CreateWordInput): Promise<Word>  // 한도 초과 시 WordLimitExceededError throw(Guest/Premium/Master는 무제한이라 발생 안 함)
  bulkCreateWords(input: BulkCreateWordsInput): Promise<BulkCreateResult>
  updateWord(id: string, input: UpdateWordInput): Promise<void>
  deleteWord(id: string): Promise<void>
  getPersonalWordCount(): Promise<number>  // 요금제 한도 UI 표시용 — 전체 단어장 합산 개인 단어 총수

  // totalCount === 0이면 null 반환(세션 생성 안 함) — 기존 lib/studySession.ts 동작과 동일
  createStudySession(input: CreateStudySessionInput): Promise<string | null>
  completeStudySession(sessionId: string, correctCount: number, wrongCount: number): Promise<void>
  saveStudyResult(input: StudyResultInput): Promise<void>
  getReviewQueue(date: string): Promise<ReviewItem[]>

  getSchedules(): Promise<Schedule[]>
  saveSchedule(input: ScheduleInput): Promise<Schedule>
  deleteSchedule(id: string): Promise<void>

  // fromDate/toDate: 'YYYY-MM-DD' (occurrence_date 기준 범위)
  getScheduleExceptions(fromDate: string, toDate: string): Promise<ScheduleException[]>
  saveScheduleException(input: ScheduleExceptionInput): Promise<ScheduleException>

  // 알림(Bridge 네이티브 알림 예약 상태 추적) — docs/DESIGN.md §5 참고
  getActiveNotifications(scheduleId: string): Promise<NotificationRecord[]>
  createNotifications(inputs: CreateNotificationInput[]): Promise<NotificationRecord[]>
  cancelNotifications(scheduleId: string): Promise<NotificationRecord[]>  // 방금 취소된 레코드(native_id 포함) 반환
  updateNotificationNativeId(id: string, nativeId: string): Promise<void>

  getSettings(): Promise<UserSettings>
  saveSettings(input: Partial<UserSettings>): Promise<void>
}
