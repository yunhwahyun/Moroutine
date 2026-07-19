import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { computeQuizAnswerUpdate } from '@/lib/wordStatus'
import type { Difficulty, PublicWord, PublicWordbook, PublicWordProgress, ReviewPolicy, Word } from '@/types'

// docs/ADMIN_DESIGN.md §3 — 공용 단어장은 Guest/Pro/Premium/Master의 Local/Remote 분기 대상이 아니라
// (Guest는 애초에 접근 불가, Admin도 기존 tier 시스템 밖) DataRepository를 확장하지 않고 독립 모듈로
// 직접 Supabase를 호출한다. RLS(is_admin()/get_service_tier())가 실제 접근 제어를 담당한다.

function requireUserId(): string {
  const user = useAuthStore.getState().user
  if (!user) throw new Error('publicWordbooks requires an authenticated user')
  return user.id
}

export type CreatePublicWordbookInput = {
  title: string
  description: string | null
  category: string | null
  difficulty: Difficulty
  language: string
}

export type UpdatePublicWordbookInput = Partial<
  Pick<PublicWordbook, 'title' | 'description' | 'category' | 'difficulty' | 'language' | 'status'>
>

export type PublicWordInput = {
  term: string
  definition: string
  description?: string | null
  example?: string | null
}

// ── Admin ────────────────────────────────────────────────────────────────

export async function getAdminPublicWordbooks(): Promise<PublicWordbook[]> {
  const { data, error } = await supabase
    .from('public_wordbooks')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getAdminPublicWordbook(id: string): Promise<PublicWordbook | null> {
  const { data, error } = await supabase.from('public_wordbooks').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function createPublicWordbook(input: CreatePublicWordbookInput): Promise<PublicWordbook> {
  const { data, error } = await supabase
    .from('public_wordbooks')
    .insert({ ...input, created_by: requireUserId() })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updatePublicWordbook(id: string, input: UpdatePublicWordbookInput): Promise<void> {
  const { error } = await supabase
    .from('public_wordbooks')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function getAdminPublicWords(wordbookId: string): Promise<PublicWord[]> {
  const { data, error } = await supabase
    .from('public_words')
    .select('*')
    .eq('wordbook_id', wordbookId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data ?? []
}

async function nextSortOrder(wordbookId: string): Promise<number> {
  const { data, error } = await supabase
    .from('public_words')
    .select('sort_order')
    .eq('wordbook_id', wordbookId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data?.sort_order ?? -1) + 1
}

export async function createPublicWord(wordbookId: string, input: PublicWordInput): Promise<PublicWord> {
  const sortOrder = await nextSortOrder(wordbookId)
  const { data, error } = await supabase
    .from('public_words')
    .insert({
      wordbook_id: wordbookId,
      term: input.term,
      definition: input.definition,
      description: input.description ?? null,
      example: input.example ?? null,
      sort_order: sortOrder,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function bulkCreatePublicWords(wordbookId: string, words: PublicWordInput[]): Promise<void> {
  let sortOrder = await nextSortOrder(wordbookId)
  const rows = words.map((w) => ({
    wordbook_id: wordbookId,
    term: w.term,
    definition: w.definition,
    description: w.description ?? null,
    example: w.example ?? null,
    sort_order: sortOrder++,
  }))
  const { error } = await supabase.from('public_words').insert(rows)
  if (error) throw error
}

export async function updatePublicWord(
  id: string,
  input: Partial<Pick<PublicWord, 'term' | 'definition' | 'description' | 'example'>>,
): Promise<void> {
  const { error } = await supabase
    .from('public_words')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// 물리 삭제 금지(docs/ADMIN_DESIGN.md §3-1) — 기존 사용자 학습 기록을 보존하기 위해 상태만 전환한다.
export async function archivePublicWord(id: string): Promise<void> {
  const { error } = await supabase
    .from('public_words')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// ── 사용자(Pro/Premium/Master) ──────────────────────────────────────────

export async function getPublishedPublicWordbooks(): Promise<PublicWordbook[]> {
  const { data, error } = await supabase
    .from('public_wordbooks')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getPublicWordbook(id: string): Promise<PublicWordbook | null> {
  const { data, error } = await supabase.from('public_wordbooks').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function getPublicWords(wordbookId: string): Promise<PublicWord[]> {
  const { data, error } = await supabase
    .from('public_words')
    .select('*')
    .eq('wordbook_id', wordbookId)
    .eq('status', 'active')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function getEnrolledWordbookIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('user_public_wordbook_enrollments')
    .select('wordbook_id')
    .eq('user_id', userId)
  if (error) throw error
  return new Set((data ?? []).map((row) => row.wordbook_id))
}

export async function enrollPublicWordbook(userId: string, wordbookId: string): Promise<void> {
  const { error } = await supabase
    .from('user_public_wordbook_enrollments')
    .insert({ user_id: userId, wordbook_id: wordbookId })
  if (error) throw error
}

export async function unenrollPublicWordbook(userId: string, wordbookId: string): Promise<void> {
  const { error } = await supabase
    .from('user_public_wordbook_enrollments')
    .delete()
    .eq('user_id', userId)
    .eq('wordbook_id', wordbookId)
  if (error) throw error
}

// ── 학습/퀴즈 진행 상태(user_public_word_progress) ──────────────────────
// docs/DECISION_LOG.md 2026-07-19 — 공용 단어장 학습/퀴즈는 개인 study_sessions/study_results에는
// 기록하지 않고(FK가 개인 words(id)를 참조해 애초에 불가능), 진행 상태만 이 테이블에 저장한다.

export async function getPublicWordProgressMap(
  userId: string,
  publicWordIds: string[],
): Promise<Map<string, PublicWordProgress>> {
  if (publicWordIds.length === 0) return new Map()
  const { data, error } = await supabase
    .from('user_public_word_progress')
    .select('*')
    .eq('user_id', userId)
    .in('public_word_id', publicWordIds)
  if (error) throw error
  return new Map((data ?? []).map((row) => [row.public_word_id, row]))
}

type PublicWordProgressUpdate = Partial<
  Pick<PublicWordProgress, 'status' | 'review_step' | 'first_passed_at' | 'next_review_at' | 'wrong_count'>
>

export async function upsertPublicWordProgress(
  userId: string,
  publicWordId: string,
  update: PublicWordProgressUpdate,
): Promise<void> {
  const { error } = await supabase
    .from('user_public_word_progress')
    .upsert(
      { user_id: userId, public_word_id: publicWordId, ...update, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,public_word_id' },
    )
  if (error) throw error
}

// web/src/lib/wordStatus.ts의 computeQuizAnswerUpdate()를 그대로 재사용 — 상태 전이 계산 로직은
// 개인/공용 단어 양쪽이 동일하고 저장 위치만 다르다.
export async function applyPublicQuizAnswer(
  userId: string,
  publicWordId: string,
  progress: Pick<Word, 'status' | 'review_step' | 'first_passed_at' | 'wrong_count'>,
  isCorrect: boolean,
  options: { reviewIntervals: string[]; reviewPolicy: ReviewPolicy },
): Promise<void> {
  const update = computeQuizAnswerUpdate(progress, isCorrect, options)
  if (Object.keys(update).length === 0) return
  await upsertPublicWordProgress(userId, publicWordId, update)
}

// PublicWord + 진행 상태를 Word 형태로 변환 — 이 어댑터 덕분에 LearnPage/Quiz.tsx/buildQuizWords/
// applyQuestionOrder를 전혀 손대지 않고 그대로 재사용할 수 있다.
export function toStudyWord(publicWord: PublicWord, progress: PublicWordProgress | undefined, userId: string): Word {
  return {
    id: publicWord.id,
    wordbook_id: publicWord.wordbook_id,
    user_id: userId,
    term: publicWord.term,
    definition: publicWord.definition,
    description: publicWord.description,
    example: publicWord.example,
    memo: null,
    wrong_count: progress?.wrong_count ?? 0,
    status: progress?.status ?? 'unseen',
    review_step: progress?.review_step ?? 0,
    first_passed_at: progress?.first_passed_at ?? null,
    next_review_at: progress?.next_review_at ?? null,
    created_at: publicWord.created_at,
    updated_at: publicWord.updated_at,
  }
}
