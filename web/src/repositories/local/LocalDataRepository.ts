import type { NotificationRecord, Schedule, ScheduleException, UserSettings, Word, Wordbook } from '@/types'
import { DEFAULT_SETTINGS } from '@/stores/settingsStore'
import type {
  BulkCreateResult,
  BulkCreateWordsInput,
  CreateNotificationInput,
  CreateStudySessionInput,
  CreateWordInput,
  CreateWordbookInput,
  DataRepository,
  ReviewItem,
  ScheduleExceptionInput,
  ScheduleInput,
  StudyResultInput,
  UpdateWordInput,
  UpdateWordbookInput,
} from '../types'
import { GUEST_USER_ID, localDB } from './schema'

function nowIso(): string {
  return new Date().toISOString()
}

// docs/DATA_STORAGE_DESIGN.md §6 — Guest 전용 구현. 서버 왕복 없이 IndexedDB(Dexie)에 정본을 저장한다.
// Guest는 개인 단어 등록 수를 제한하지 않는다(docs/SUBSCRIPTION_DESIGN.md §1) — bulkCreateWords는
// 항상 blocked=false, limitValue=null을 반환한다.
export class LocalDataRepository implements DataRepository {
  async getWordbooks(): Promise<Wordbook[]> {
    return localDB.wordbooks.orderBy('created_at').reverse().toArray()
  }

  async getWordbook(id: string): Promise<Wordbook | null> {
    return (await localDB.wordbooks.get(id)) ?? null
  }

  async createWordbook(input: CreateWordbookInput): Promise<Wordbook> {
    const now = nowIso()
    const wordbook: Wordbook = {
      id: crypto.randomUUID(),
      user_id: GUEST_USER_ID,
      name: input.name,
      description: input.description ?? null,
      language: input.language ?? null,
      word_count: 0,
      created_at: now,
      updated_at: now,
    }
    await localDB.wordbooks.add(wordbook)
    return wordbook
  }

  async updateWordbook(id: string, input: UpdateWordbookInput): Promise<void> {
    await localDB.wordbooks.update(id, { ...input, updated_at: nowIso() })
  }

  async deleteWordbook(id: string): Promise<void> {
    await localDB.transaction('rw', localDB.wordbooks, localDB.words, async () => {
      await localDB.words.where('wordbook_id').equals(id).delete()
      await localDB.wordbooks.delete(id)
    })
  }

  async getWords(wordbookId: string): Promise<Word[]> {
    return localDB.words.where('wordbook_id').equals(wordbookId).sortBy('created_at')
  }

  async createWord(input: CreateWordInput): Promise<Word> {
    const now = nowIso()
    const word: Word = {
      id: crypto.randomUUID(),
      wordbook_id: input.wordbookId,
      user_id: GUEST_USER_ID,
      term: input.term,
      definition: input.definition,
      description: input.description ?? null,
      example: input.example ?? null,
      memo: input.memo ?? null,
      wrong_count: 0,
      status: 'unseen',
      review_step: 0,
      first_passed_at: null,
      next_review_at: null,
      created_at: now,
      updated_at: now,
    }
    await localDB.transaction('rw', localDB.words, localDB.wordbooks, async () => {
      await localDB.words.add(word)
      await this.bumpWordCount(input.wordbookId, 1)
    })
    return word
  }

  async bulkCreateWords(input: BulkCreateWordsInput): Promise<BulkCreateResult> {
    const now = nowIso()
    const rows: Word[] = input.words.map((w) => ({
      id: crypto.randomUUID(),
      wordbook_id: input.wordbookId,
      user_id: GUEST_USER_ID,
      term: w.term,
      definition: w.definition,
      description: w.description ?? null,
      example: null,
      memo: null,
      wrong_count: 0,
      status: 'unseen',
      review_step: 0,
      first_passed_at: null,
      next_review_at: null,
      created_at: now,
      updated_at: now,
    }))
    await localDB.transaction('rw', localDB.words, localDB.wordbooks, async () => {
      await localDB.words.bulkAdd(rows)
      await this.bumpWordCount(input.wordbookId, rows.length)
    })
    const currentTotal = await localDB.words.count()
    return { insertedCount: rows.length, currentTotal, limitValue: null, blocked: false }
  }

  async updateWord(id: string, input: UpdateWordInput): Promise<void> {
    await localDB.words.update(id, { ...input, updated_at: nowIso() })
  }

  async deleteWord(id: string): Promise<void> {
    const word = await localDB.words.get(id)
    if (!word) return
    await localDB.transaction('rw', localDB.words, localDB.wordbooks, async () => {
      await localDB.words.delete(id)
      await this.bumpWordCount(word.wordbook_id, -1)
    })
  }

  async getPersonalWordCount(): Promise<number> {
    return localDB.words.count()
  }

  async createStudySession(input: CreateStudySessionInput): Promise<string | null> {
    if (input.totalCount === 0) return null
    const id = crypto.randomUUID()
    await localDB.studySessions.add({
      id,
      session_type: input.sessionType,
      wordbook_ids: input.wordbookIds.length > 0 ? input.wordbookIds : null,
      total_count: input.totalCount,
      correct_count: 0,
      wrong_count: 0,
      completed_at: null,
      created_at: nowIso(),
    })
    return id
  }

  async completeStudySession(sessionId: string, correctCount: number, wrongCount: number): Promise<void> {
    await localDB.studySessions.update(sessionId, {
      completed_at: nowIso(),
      correct_count: correctCount,
      wrong_count: wrongCount,
    })
  }

  async saveStudyResult(input: StudyResultInput): Promise<void> {
    await localDB.studyResults.add({
      id: crypto.randomUUID(),
      session_id: input.sessionId,
      word_id: input.wordId,
      is_correct: input.isCorrect,
      attempt_count: input.attemptCount ?? 1,
      answered_at: nowIso(),
    })
  }

  // date: 'reviewing' 단어 중 next_review_at이 이 값(ISO 문자열) 이하인 것만 반환
  async getReviewQueue(date: string): Promise<ReviewItem[]> {
    const dueWords = await localDB.words.where('status').equals('reviewing').toArray()
    return dueWords
      .filter((w) => w.next_review_at !== null && w.next_review_at <= date)
      .map((w) => ({
        id: w.id,
        wordbook_id: w.wordbook_id,
        term: w.term,
        definition: w.definition,
        description: w.description,
        next_review_at: w.next_review_at,
      }))
  }

  async getSchedules(): Promise<Schedule[]> {
    return localDB.schedules.orderBy('starts_at').toArray()
  }

  async saveSchedule(input: ScheduleInput): Promise<Schedule> {
    const now = nowIso()
    if (input.id) {
      const existing = await localDB.schedules.get(input.id)
      const merged: Schedule = {
        ...(existing as Schedule),
        ...input,
        id: input.id,
        user_id: GUEST_USER_ID,
        updated_at: now,
      }
      await localDB.schedules.put(merged)
      return merged
    }
    // input.id가 falsy면 타입 계약상 ScheduleInput의 "생성" 분기(전체 필드 필수)다.
    // TS는 이 truthy 체크만으로 유니온을 완전히 좁히지 못해 단언이 필요하다.
    const fields = input as Omit<Schedule, 'id' | 'user_id' | 'created_at' | 'updated_at'>
    const schedule: Schedule = {
      ...fields,
      id: crypto.randomUUID(),
      user_id: GUEST_USER_ID,
      created_at: now,
      updated_at: now,
    }
    await localDB.schedules.add(schedule)
    return schedule
  }

  async deleteSchedule(id: string): Promise<void> {
    await localDB.transaction('rw', localDB.schedules, localDB.scheduleExceptions, localDB.notifications, async () => {
      await localDB.schedules.delete(id)
      await localDB.scheduleExceptions.where('schedule_id').equals(id).delete()
      await localDB.notifications.where('schedule_id').equals(id).delete()
    })
  }

  async getScheduleExceptions(fromDate: string, toDate: string): Promise<ScheduleException[]> {
    return localDB.scheduleExceptions
      .where('occurrence_date')
      .between(fromDate, toDate, true, true)
      .toArray()
  }

  async saveScheduleException(input: ScheduleExceptionInput): Promise<ScheduleException> {
    const existing = await localDB.scheduleExceptions
      .where('[schedule_id+occurrence_date]')
      .equals([input.scheduleId, input.occurrenceDate])
      .first()
    const now = nowIso()
    const merged: ScheduleException = {
      id: existing?.id ?? crypto.randomUUID(),
      user_id: GUEST_USER_ID,
      schedule_id: input.scheduleId,
      occurrence_date: input.occurrenceDate,
      exception_type: input.exceptionType,
      original_starts_at: existing?.original_starts_at ?? input.originalStartsAt,
      original_ends_at: existing ? existing.original_ends_at : input.originalEndsAt,
      title: input.title ?? existing?.title ?? null,
      location: input.location ?? existing?.location ?? null,
      starts_at: input.startsAt ?? existing?.starts_at ?? null,
      ends_at: input.endsAt ?? existing?.ends_at ?? null,
      is_all_day: input.isAllDay ?? existing?.is_all_day ?? null,
      alarm_minutes: input.alarmMinutes ?? existing?.alarm_minutes ?? null,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    }
    await localDB.scheduleExceptions.put(merged)
    return merged
  }

  async getActiveNotifications(scheduleId: string): Promise<NotificationRecord[]> {
    return localDB.notifications
      .where('schedule_id')
      .equals(scheduleId)
      .filter((n) => !n.is_cancelled)
      .toArray()
  }

  async createNotifications(inputs: CreateNotificationInput[]): Promise<NotificationRecord[]> {
    const rows: NotificationRecord[] = inputs.map((input) => ({
      id: crypto.randomUUID(),
      user_id: GUEST_USER_ID,
      schedule_id: input.scheduleId,
      native_id: null,
      fire_at: input.fireAt,
      is_cancelled: false,
      created_at: nowIso(),
    }))
    await localDB.notifications.bulkAdd(rows)
    return rows
  }

  async cancelNotifications(scheduleId: string): Promise<NotificationRecord[]> {
    const active = await this.getActiveNotifications(scheduleId)
    await localDB.notifications.bulkUpdate(active.map((n) => ({ key: n.id, changes: { is_cancelled: true } })))
    return active
  }

  async updateNotificationNativeId(id: string, nativeId: string): Promise<void> {
    await localDB.notifications.update(id, { native_id: nativeId })
  }

  async getSettings(): Promise<UserSettings> {
    const row = await localDB.settings.get('local')
    return row ?? { ...DEFAULT_SETTINGS }
  }

  async saveSettings(input: Partial<UserSettings>): Promise<void> {
    const current = await this.getSettings()
    await localDB.settings.put({ ...current, ...input, id: 'local' })
  }

  private async bumpWordCount(wordbookId: string, delta: number): Promise<void> {
    const wordbook = await localDB.wordbooks.get(wordbookId)
    if (!wordbook) return
    await localDB.wordbooks.update(wordbookId, { word_count: wordbook.word_count + delta })
  }
}

export const localDataRepository = new LocalDataRepository()
