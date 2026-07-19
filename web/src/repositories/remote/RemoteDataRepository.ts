import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { DEFAULT_SETTINGS } from '@/stores/settingsStore'
import type { NotificationRecord, Schedule, ScheduleException, UserSettings, Word, Wordbook } from '@/types'
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
import { WordLimitExceededError } from '../types'

// docs/SUBSCRIPTION_DESIGN.md §4-2 — create_words_checked RPC 응답 형태
type CreateWordsCheckedResult = {
  inserted: Word[]
  inserted_count: number
  current_total: number
  limit_value: number | null
  blocked: boolean
}

async function callCreateWordsChecked(
  wordbookId: string,
  words: Array<{ term: string; definition: string; description?: string | null; example?: string | null; memo?: string | null }>,
): Promise<CreateWordsCheckedResult> {
  const { data, error } = await supabase.rpc('create_words_checked', {
    p_wordbook_id: wordbookId,
    p_words: words,
  })
  if (error) throw error
  return data as CreateWordsCheckedResult
}

// docs/DATA_STORAGE_DESIGN.md §6 — Pro/Premium/Master 전용 구현. Supabase가 정본이다.
// docs/DEVELOPMENT_RULES.md #9 — 훅 외부(클래스 메서드)에서 Zustand 상태를 읽으므로 getState() 사용.
function requireUserId(): string {
  const user = useAuthStore.getState().user
  if (!user) throw new Error('RemoteDataRepository requires an authenticated user')
  return user.id
}

function settingsRowToUserSettings(row: Record<string, unknown> | null): UserSettings {
  if (!row) return { ...DEFAULT_SETTINGS }
  return {
    nickname: (row.nickname as string | null) ?? null,
    quizMode: (row.quiz_mode as UserSettings['quizMode']) ?? DEFAULT_SETTINGS.quizMode,
    questionOrder: (row.question_order as UserSettings['questionOrder']) ?? DEFAULT_SETTINGS.questionOrder,
    reviewIntervals: (row.review_intervals as string[]) ?? DEFAULT_SETTINGS.reviewIntervals,
    reviewPolicy: (row.review_policy as UserSettings['reviewPolicy']) ?? DEFAULT_SETTINGS.reviewPolicy,
    scheduleNotification: (row.schedule_notification as boolean) ?? DEFAULT_SETTINGS.scheduleNotification,
    reviewNotification: (row.review_notification as boolean) ?? DEFAULT_SETTINGS.reviewNotification,
    reviewNotificationTime:
      (row.review_notification_time as string) ?? DEFAULT_SETTINGS.reviewNotificationTime,
    shortAnswerInput: (row.short_answer_input as UserSettings['shortAnswerInput']) ?? DEFAULT_SETTINGS.shortAnswerInput,
  }
}

function userSettingsToRow(input: Partial<UserSettings>): Record<string, unknown> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('nickname' in input) row.nickname = input.nickname
  if ('quizMode' in input) row.quiz_mode = input.quizMode
  if ('questionOrder' in input) row.question_order = input.questionOrder
  if ('reviewIntervals' in input) row.review_intervals = input.reviewIntervals
  if ('reviewPolicy' in input) row.review_policy = input.reviewPolicy
  if ('scheduleNotification' in input) row.schedule_notification = input.scheduleNotification
  if ('reviewNotification' in input) row.review_notification = input.reviewNotification
  if ('reviewNotificationTime' in input) row.review_notification_time = input.reviewNotificationTime
  if ('shortAnswerInput' in input) row.short_answer_input = input.shortAnswerInput
  return row
}

export class RemoteDataRepository implements DataRepository {
  async getWordbooks(): Promise<Wordbook[]> {
    const { data, error } = await supabase
      .from('wordbooks')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  }

  async getWordbook(id: string): Promise<Wordbook | null> {
    const { data, error } = await supabase.from('wordbooks').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    return data
  }

  async createWordbook(input: CreateWordbookInput): Promise<Wordbook> {
    const { data, error } = await supabase
      .from('wordbooks')
      .insert({
        user_id: requireUserId(),
        name: input.name,
        description: input.description ?? null,
        language: input.language ?? null,
      })
      .select()
      .single()
    if (error) throw error
    return data
  }

  async updateWordbook(id: string, input: UpdateWordbookInput): Promise<void> {
    const { error } = await supabase
      .from('wordbooks')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  }

  async deleteWordbook(id: string): Promise<void> {
    const { error } = await supabase.from('wordbooks').delete().eq('id', id)
    if (error) throw error
  }

  async getWords(wordbookId: string): Promise<Word[]> {
    const { data, error } = await supabase
      .from('words')
      .select('*')
      .eq('wordbook_id', wordbookId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return data ?? []
  }

  // docs/SUBSCRIPTION_DESIGN.md §4-2 — Pro 한도를 create_words_checked RPC로 원자적 검증.
  async createWord(input: CreateWordInput): Promise<Word> {
    const result = await callCreateWordsChecked(input.wordbookId, [
      {
        term: input.term.trim(),
        definition: input.definition.trim(),
        description: input.description?.trim() || null,
        example: input.example?.trim() || null,
        memo: input.memo?.trim() || null,
      },
    ])
    if (result.blocked || result.inserted.length === 0) {
      throw new WordLimitExceededError(result.current_total, result.limit_value ?? 0)
    }
    return result.inserted[0]
  }

  async bulkCreateWords(input: BulkCreateWordsInput): Promise<BulkCreateResult> {
    const result = await callCreateWordsChecked(
      input.wordbookId,
      input.words.map((w) => ({
        term: w.term.trim(),
        definition: w.definition.trim(),
        description: w.description?.trim() || null,
      })),
    )
    return {
      insertedCount: result.inserted_count,
      currentTotal: result.current_total,
      limitValue: result.limit_value,
      blocked: result.blocked,
    }
  }

  async getPersonalWordCount(): Promise<number> {
    const { count, error } = await supabase
      .from('words')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', requireUserId())
    if (error) throw error
    return count ?? 0
  }

  async updateWord(id: string, input: UpdateWordInput): Promise<void> {
    const { error } = await supabase
      .from('words')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  }

  async deleteWord(id: string): Promise<void> {
    const { error } = await supabase.from('words').delete().eq('id', id)
    if (error) throw error
  }

  async createStudySession(input: CreateStudySessionInput): Promise<string | null> {
    if (input.totalCount === 0) return null
    const { data, error } = await supabase
      .from('study_sessions')
      .insert({
        user_id: requireUserId(),
        session_type: input.sessionType,
        wordbook_ids: input.wordbookIds.length > 0 ? input.wordbookIds : null,
        total_count: input.totalCount,
      })
      .select('id')
      .single()
    if (error) throw error
    return data.id
  }

  async completeStudySession(sessionId: string, correctCount: number, wrongCount: number): Promise<void> {
    const { error } = await supabase
      .from('study_sessions')
      .update({
        completed_at: new Date().toISOString(),
        correct_count: correctCount,
        wrong_count: wrongCount,
      })
      .eq('id', sessionId)
    if (error) throw error
  }

  async saveStudyResult(input: StudyResultInput): Promise<void> {
    const { error } = await supabase.from('study_results').insert({
      session_id: input.sessionId,
      word_id: input.wordId,
      user_id: requireUserId(),
      is_correct: input.isCorrect,
      attempt_count: input.attemptCount ?? 1,
    })
    if (error) throw error
  }

  async getReviewQueue(date: string): Promise<ReviewItem[]> {
    const { data, error } = await supabase
      .from('words')
      .select('id, wordbook_id, term, definition, description, next_review_at')
      .eq('user_id', requireUserId())
      .eq('status', 'reviewing')
      .lte('next_review_at', date)
    if (error) throw error
    return data ?? []
  }

  async getSchedules(): Promise<Schedule[]> {
    const { data, error } = await supabase
      .from('schedules')
      .select('*')
      .order('starts_at', { ascending: true })
    if (error) throw error
    return data ?? []
  }

  async saveSchedule(input: ScheduleInput): Promise<Schedule> {
    if (input.id) {
      const { id, ...rest } = input
      const { data, error } = await supabase
        .from('schedules')
        .update({ ...rest, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    }
    // input.id가 falsy면 타입 계약상 ScheduleInput의 "생성" 분기(전체 필드 필수)다.
    // TS는 이 truthy 체크만으로 유니온을 완전히 좁히지 못해 단언이 필요하다.
    const fields = input as Omit<Schedule, 'id' | 'user_id' | 'created_at' | 'updated_at'>
    const { data, error } = await supabase
      .from('schedules')
      .insert({ ...fields, user_id: requireUserId() })
      .select()
      .single()
    if (error) throw error
    return data
  }

  async deleteSchedule(id: string): Promise<void> {
    const { error } = await supabase.from('schedules').delete().eq('id', id)
    if (error) throw error
  }

  async getScheduleExceptions(fromDate: string, toDate: string): Promise<ScheduleException[]> {
    const { data, error } = await supabase
      .from('schedule_exceptions')
      .select('*')
      .gte('occurrence_date', fromDate)
      .lte('occurrence_date', toDate)
    if (error) throw error
    return data ?? []
  }

  async saveScheduleException(input: ScheduleExceptionInput): Promise<ScheduleException> {
    const { data: existing, error: findError } = await supabase
      .from('schedule_exceptions')
      .select('*')
      .eq('schedule_id', input.scheduleId)
      .eq('occurrence_date', input.occurrenceDate)
      .maybeSingle()
    if (findError) throw findError

    const modifiedFields = {
      exception_type: input.exceptionType,
      title: input.title ?? existing?.title ?? null,
      location: input.location ?? existing?.location ?? null,
      starts_at: input.startsAt ?? existing?.starts_at ?? null,
      ends_at: input.endsAt ?? existing?.ends_at ?? null,
      is_all_day: input.isAllDay ?? existing?.is_all_day ?? null,
      alarm_minutes: input.alarmMinutes ?? existing?.alarm_minutes ?? null,
      updated_at: new Date().toISOString(),
    }

    if (existing) {
      const { data, error } = await supabase
        .from('schedule_exceptions')
        .update(modifiedFields)
        .eq('id', existing.id)
        .select()
        .single()
      if (error) throw error
      return data
    }

    const { data, error } = await supabase
      .from('schedule_exceptions')
      .insert({
        user_id: requireUserId(),
        schedule_id: input.scheduleId,
        occurrence_date: input.occurrenceDate,
        original_starts_at: input.originalStartsAt,
        original_ends_at: input.originalEndsAt,
        ...modifiedFields,
      })
      .select()
      .single()
    if (error) throw error
    return data
  }

  async getActiveNotifications(scheduleId: string): Promise<NotificationRecord[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('schedule_id', scheduleId)
      .eq('is_cancelled', false)
    if (error) throw error
    return data ?? []
  }

  async createNotifications(inputs: CreateNotificationInput[]): Promise<NotificationRecord[]> {
    const userId = requireUserId()
    const { data, error } = await supabase
      .from('notifications')
      .insert(inputs.map((i) => ({ schedule_id: i.scheduleId, fire_at: i.fireAt, user_id: userId })))
      .select()
    if (error) throw error
    return data ?? []
  }

  async cancelNotifications(scheduleId: string): Promise<NotificationRecord[]> {
    const active = await this.getActiveNotifications(scheduleId)
    if (active.length === 0) return []
    const { error } = await supabase
      .from('notifications')
      .update({ is_cancelled: true })
      .eq('schedule_id', scheduleId)
      .eq('is_cancelled', false)
    if (error) throw error
    return active
  }

  async updateNotificationNativeId(id: string, nativeId: string): Promise<void> {
    const { error } = await supabase.from('notifications').update({ native_id: nativeId }).eq('id', id)
    if (error) throw error
  }

  async getSettings(): Promise<UserSettings> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', requireUserId())
      .maybeSingle()
    if (error) throw error
    return settingsRowToUserSettings(data)
  }

  async saveSettings(input: Partial<UserSettings>): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update(userSettingsToRow(input))
      .eq('id', requireUserId())
    if (error) throw error
  }
}

export const remoteDataRepository = new RemoteDataRepository()
