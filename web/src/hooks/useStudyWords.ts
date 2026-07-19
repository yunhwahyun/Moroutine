import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { usePermissions } from '@/hooks/usePermissions'
import { getRepository } from '@/repositories/factory'
import type { Word, QuizWord, QuestionOrder } from '@/types'

export function applyQuestionOrder(words: Word[], order: QuestionOrder): Word[] {
  if (order === 'random') return [...words].sort(() => Math.random() - 0.5)
  if (order === 'asc')   return [...words].sort((a, b) => a.created_at.localeCompare(b.created_at))
  if (order === 'desc')  return [...words].sort((a, b) => b.created_at.localeCompare(a.created_at))
  return words
}

function sortByNextReviewAt(words: Word[]): Word[] {
  // 원래 supabase 쿼리의 `order('next_review_at', { nullsFirst: false })`와 동일한 정렬(null은 마지막)
  return [...words].sort((a, b) => {
    if (a.next_review_at === null && b.next_review_at === null) return 0
    if (a.next_review_at === null) return 1
    if (b.next_review_at === null) return -1
    return a.next_review_at.localeCompare(b.next_review_at)
  })
}

// Guest(로컬) 전용 — docs/DATA_STORAGE_DESIGN.md §6. Repository만 사용하고 Supabase는 호출하지 않는다.
async function fetchLocalTodayStudyWords(): Promise<Word[]> {
  const now = new Date().toISOString()
  const repository = getRepository('guest')
  const wordbooks = await repository.getWordbooks()
  const allWords = (await Promise.all(wordbooks.map((wb) => repository.getWords(wb.id)))).flat()
  const due = allWords.filter(
    (w) =>
      w.status === 'unseen' ||
      w.status === 'learning' ||
      (w.status === 'reviewing' && w.next_review_at !== null && w.next_review_at <= now),
  )
  return sortByNextReviewAt(due)
}

async function fetchRemoteTodayStudyWords(): Promise<Word[]> {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('words')
    .select('*')
    .or(`status.in.(unseen,learning),and(status.eq.reviewing,next_review_at.lte.${now})`)
    .order('next_review_at', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data ?? []
}

// 오늘 학습할 단어: 미학습(unseen/learning) + 복습 시기가 된 단어(reviewing & next_review_at <= now)
// docs/PERMISSION_DESIGN.md §9 — Guest는 LocalDataRepository, 그 외 등급은 기존 Supabase 직접 조회(성능 유지).
export function useTodayStudyWords() {
  const { permissions } = usePermissions()
  const tier = permissions?.serviceTier ?? null

  return useQuery<Word[]>({
    queryKey: ['today_study_words', tier],
    queryFn: () => (tier === 'guest' ? fetchLocalTodayStudyWords() : fetchRemoteTodayStudyWords()),
    enabled: tier !== null,
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
