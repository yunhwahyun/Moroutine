import { addDays } from 'date-fns'
import { supabase } from '@/lib/supabase'
import type { ReviewPolicy, Word } from '@/types'

function parseIntervalDays(interval: string): number {
  const match = interval.match(/^(\d+)d$/)
  return match ? parseInt(match[1], 10) : 7
}

export async function applyQuizAnswer(
  word: Word,
  isCorrect: boolean,
  options: { reviewIntervals: string[]; reviewPolicy: ReviewPolicy },
): Promise<void> {
  const now = new Date()
  const { reviewIntervals, reviewPolicy } = options
  const totalSteps = reviewIntervals.length
  let update: Record<string, unknown> = { updated_at: now.toISOString() }

  if (!isCorrect) {
    update.wrong_count = word.wrong_count + 1
    if (word.status === 'unseen') {
      update.status = 'learning'
    } else if (word.status === 'reviewing' && reviewPolicy === 'downgrade') {
      const step = word.review_step as number
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
    if (word.status === 'unseen' || word.status === 'learning') {
      const passedAt = word.first_passed_at ? new Date(word.first_passed_at) : now
      update = {
        ...update,
        status: 'reviewing',
        review_step: 1,
        first_passed_at: word.first_passed_at ?? now.toISOString(),
        next_review_at: addDays(passedAt, parseIntervalDays(reviewIntervals[0])).toISOString(),
      }
    } else if (word.status === 'reviewing') {
      const nextStep = (word.review_step as number) + 1
      if (nextStep > totalSteps) {
        update = { ...update, status: 'mastered', review_step: 0, next_review_at: null }
      } else {
        const base = word.first_passed_at ? new Date(word.first_passed_at) : now
        update = {
          ...update,
          review_step: nextStep,
          next_review_at: addDays(base, parseIntervalDays(reviewIntervals[nextStep - 1])).toISOString(),
        }
      }
    }
    // mastered → 변경 없음
  }

  await supabase.from('words').update(update).eq('id', word.id)
}
