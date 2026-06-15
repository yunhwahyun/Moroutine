export type SelectionTarget =
  | { type: 'review' }
  | { type: 'wordbook'; id: string }
  | { type: 'word'; id: string }

export type WordStatus = 'unseen' | 'learning' | 'reviewing' | 'mastered'
export type SessionType = 'learn' | 'quiz' | 'review_quiz'

export type Word = {
  id: string
  wordbook_id: string
  user_id: string
  term: string
  definition: string
  description: string | null
  example: string | null
  memo: string | null
  wrong_count: number
  status: WordStatus
  review_step: 0 | 1 | 2 | 3
  first_passed_at: string | null
  next_review_at: string | null
  created_at: string
  updated_at: string
}

export type Wordbook = {
  id: string
  user_id: string
  name: string
  description: string | null
  language: string | null
  word_count: number
  created_at: string
  updated_at: string
}

export type RepeatType = 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly' | 'custom'
export type RepeatEndType = 'none' | 'until' | 'count'

export type Schedule = {
  id: string
  user_id: string
  title: string
  location: string | null
  starts_at: string
  ends_at: string | null
  is_all_day: boolean
  repeat_type: RepeatType
  repeat_unit: string | null
  repeat_value: number | null
  repeat_end_type: RepeatEndType
  repeat_until: string | null   // YYYY-MM-DD
  repeat_count: number | null
  parent_schedule_id: string | null
  alarm_minutes: number | null
  created_at: string
  updated_at: string
}

export type ScheduleException = {
  id: string
  user_id: string
  schedule_id: string
  occurrence_date: string       // YYYY-MM-DD
  exception_type: 'cancelled' | 'modified'
  original_starts_at: string
  original_ends_at: string | null
  title: string | null
  location: string | null
  starts_at: string | null
  ends_at: string | null
  is_all_day: boolean | null
  alarm_minutes: number | null
  created_at: string
  updated_at: string
}

export type ScheduleOccurrence = {
  occurrence_id: string         // `${schedule_id}:${occurrence_date}`
  schedule_id: string
  occurrence_date: string       // YYYY-MM-DD
  title: string
  location: string | null
  starts_at: string
  ends_at: string | null
  is_all_day: boolean
  alarm_minutes: number | null
  repeat_type: RepeatType
  is_recurring: boolean
  is_exception: boolean
  exception_id?: string
}

export type QuizWord = {
  id: string
  term: string
  definition: string
  description: string | null
  distractors: Array<{ id: string; definition: string }>
}

export type QuizMode = 'multiple_choice' | 'short_answer'
export type QuestionOrder = 'asc' | 'desc' | 'random'
export type ReviewPolicy = 'keep' | 'downgrade'
export type ShortAnswerInputMode = 'keyboard' | 'voice' | 'both'

export type UserSettings = {
  nickname: string | null
  quizMode: QuizMode
  questionOrder: QuestionOrder
  reviewIntervals: string[]        // ['7d', '30d', '90d'] 등 순서 있는 배열
  reviewPolicy: ReviewPolicy
  scheduleNotification: boolean
  reviewNotification: boolean
  reviewNotificationTime: string   // 'HH:mm'
  shortAnswerInput: ShortAnswerInputMode
}
