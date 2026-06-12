import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Word, QuizWord, QuestionOrder } from '@/types'

export function applyQuestionOrder(words: Word[], order: QuestionOrder): Word[] {
  if (order === 'random') return [...words].sort(() => Math.random() - 0.5)
  if (order === 'asc')   return [...words].sort((a, b) => a.created_at.localeCompare(b.created_at))
  if (order === 'desc')  return [...words].sort((a, b) => b.created_at.localeCompare(a.created_at))
  return words
}

// 오늘 학습할 단어: 미학습(unseen/learning) + 복습 시기가 된 단어(reviewing & next_review_at <= now)
export function useTodayStudyWords() {
  return useQuery<Word[]>({
    queryKey: ['today_study_words'],
    queryFn: async () => {
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('words')
        .select('*')
        .or(`status.in.(unseen,learning),and(status.eq.reviewing,next_review_at.lte.${now})`)
        .order('next_review_at', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data ?? []
    },
  })
}

export function buildQuizWords(words: Word[]): QuizWord[] {
  return words.map((w) => ({
    id: w.id,
    term: w.term,
    definition: w.definition,
    description: w.description,
    distractors: words
      .filter((d) => d.id !== w.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map((d) => ({ id: d.id, definition: d.definition })),
  }))
}
