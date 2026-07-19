export type SelectionTarget =
  | { type: 'review' }
  | { type: 'wordbook'; id: string }
  | { type: 'word'; id: string }
  | { type: 'public_wordbook'; id: string }

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
  review_step: number  // 0: 비복습, 1~N: 복습 단계(N = 사용자 설정 reviewIntervals 길이, 최대 5)
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

// docs/ADMIN_DESIGN.md §3 — 공용 단어장. 개인 Wordbook/Word와 별개 테이블(원본 참조 방식).
export type PublicWordbookStatus = 'draft' | 'published' | 'hidden' | 'archived'
export type PublicWordStatus = 'active' | 'archived'
export type Difficulty = 'beginner' | 'intermediate' | 'advanced'

export type PublicWordbook = {
  id: string
  title: string
  description: string | null
  category: string | null
  difficulty: Difficulty
  language: string
  status: PublicWordbookStatus
  word_count: number
  is_sample: boolean
  created_by: string
  created_at: string
  updated_at: string
}

export type PublicWord = {
  id: string
  wordbook_id: string
  term: string
  definition: string
  description: string | null
  example: string | null
  sort_order: number
  status: PublicWordStatus
  created_at: string
  updated_at: string
}

// docs/ADMIN_DESIGN.md §3-3 — 공용 단어에 대한 사용자별 학습 진행 상태(user_public_word_progress).
export type PublicWordProgress = {
  id: string
  user_id: string
  public_word_id: string
  status: WordStatus
  review_step: number
  first_passed_at: string | null
  next_review_at: string | null
  wrong_count: number
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

export type NotificationRecord = {
  id: string
  user_id: string
  schedule_id: string
  native_id: string | null
  fire_at: string
  is_cancelled: boolean
  created_at: string
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

// --- 권한 모델 (docs/PERMISSION_DESIGN.md) ---

export type AccountRole = 'user' | 'admin'
export type SpecialAccess = 'none' | 'master'

export type PlanCode = 'pro' | 'premium'
export type SubscriptionStatus = 'active' | 'grace_period' | 'billing_retry' | 'expired' | 'revoked'

export type Subscription = {
  id: string
  user_id: string
  plan_code: PlanCode
  status: SubscriptionStatus
  provider: string
  provider_subscription_id: string | null
  started_at: string
  current_period_end: string | null
  grace_period_end: string | null
  canceled_at: string | null
  expired_at: string | null
  retention_expires_at: string | null
  created_at: string
  updated_at: string
}

export type SubscriptionPlan = {
  code: PlanCode
  personal_word_limit: number | null   // null = 무제한
  sync_enabled: boolean
  public_wordbook_enabled: boolean
  bulk_import_enabled: boolean
  is_active: boolean
}

export type ServiceTier = 'guest' | 'pro' | 'premium' | 'master' | 'admin'

export type Permissions = {
  serviceTier: ServiceTier
  isAuthenticated: boolean
  usesRemoteStorage: boolean       // false = LocalDataRepository, true = RemoteDataRepository
  canSync: boolean
  canBulkImport: boolean
  canUsePublicWordbooks: boolean
  personalWordLimit: number | null // null = 무제한
  canAccessAdmin: boolean
}
