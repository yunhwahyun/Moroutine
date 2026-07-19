import { addDays } from 'date-fns'
import type { DataRepository, UpdateWordInput } from '@/repositories/types'
import type { ReviewPolicy, WordStatus } from '@/types'

function parseIntervalDays(interval: string): number {
  const match = interval.match(/^(\d+)d$/)
  return match ? parseInt(match[1], 10) : 7
}

// 개인 words / 공용 user_public_word_progress 양쪽에 공통으로 필요한 최소 상태.
export type QuizAnswerState = {
  status: WordStatus
  review_step: number
  first_passed_at: string | null
  wrong_count: number
}

export type QuizAnswerUpdate = Partial<
  Pick<QuizAnswerState, 'status' | 'review_step' | 'first_passed_at' | 'wrong_count'> & {
    next_review_at: string | null
  }
>

// 복습 상태(status/review_step/next_review_at/wrong_count) 전이 계산 — 저장소를 전혀 모르는 순수 함수.
// 개인 단어(applyQuizAnswer)와 공용 단어(publicWordbooks.ts의 applyPublicQuizAnswer) 양쪽이 공유한다.
export function computeQuizAnswerUpdate(
  current: QuizAnswerState,
  isCorrect: boolean,
  options: { reviewIntervals: string[]; reviewPolicy: ReviewPolicy },
): QuizAnswerUpdate {
  const now = new Date()
  const { reviewIntervals, reviewPolicy } = options
  const totalSteps = reviewIntervals.length
  let update: QuizAnswerUpdate = {}

  if (!isCorrect) {
    update.wrong_count = current.wrong_count + 1
    if (current.status === 'unseen') {
      update.status = 'learning'
    } else if (current.status === 'reviewing' && reviewPolicy === 'downgrade') {
      const step = current.review_step
      if (step <= 1) {
        // 1단계 실패 → 재도전: next_review_at을 intervals[0] 후로 재설정
        update.next_review_at = addDays(now, parseIntervalDays(reviewIntervals[0])).toISOString()
      } else if (step === 2) {
        // 2단계 실패 → 1단계 강등
        update.review_step = 1
        update.next_review_at = addDays(now, parseIntervalDays(reviewIntervals[0])).toISOString()
      } else {
        // N단계(≥3) 실패 → N-1단계 강등
        const newStep = step - 1
        update.review_step = newStep
        update.next_review_at = addDays(now, parseIntervalDays(reviewIntervals[newStep - 1])).toISOString()
      }
    }
  } else {
    if (current.status === 'unseen' || current.status === 'learning') {
      const passedAt = current.first_passed_at ? new Date(current.first_passed_at) : now
      update = {
        ...update,
        status: 'reviewing',
        review_step: 1,
        first_passed_at: current.first_passed_at ?? now.toISOString(),
        next_review_at: addDays(passedAt, parseIntervalDays(reviewIntervals[0])).toISOString(),
      }
    } else if (current.status === 'reviewing') {
      const nextStep = current.review_step + 1
      if (nextStep > totalSteps) {
        update = { ...update, status: 'mastered', review_step: 0, next_review_at: null }
      } else {
        const base = current.first_passed_at ? new Date(current.first_passed_at) : now
        update = {
          ...update,
          review_step: nextStep,
          next_review_at: addDays(base, parseIntervalDays(reviewIntervals[nextStep - 1])).toISOString(),
        }
      }
    }
    // mastered → 변경 없음
  }

  return update
}

// docs/DATA_STORAGE_DESIGN.md §6 — Guest는 LocalDataRepository, 그 외는 RemoteDataRepository로
// 복습 상태를 저장한다. 저장소 자체는 이 함수가 몰라도 되도록 repository를 주입받는다
// (Repository Factory 선택은 호출부 책임).
export async function applyQuizAnswer(
  repository: DataRepository,
  word: QuizAnswerState & { id: string },
  isCorrect: boolean,
  options: { reviewIntervals: string[]; reviewPolicy: ReviewPolicy },
): Promise<void> {
  const update: UpdateWordInput = computeQuizAnswerUpdate(word, isCorrect, options)
  if (Object.keys(update).length === 0) return  // mastered → 변경 없음
  await repository.updateWord(word.id, update)
}
