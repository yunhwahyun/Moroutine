import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { PublicBook, PublicBookChapter, PublicBookStatus } from '@/types'

// docs/ADMIN_DESIGN.md §8 — 공용 단어장(publicWordbooks.ts)과 같은 이유로 DataRepository를
// 확장하지 않고 독립 모듈로 직접 Supabase를 호출한다(Guest는 접근 불가, Admin은 tier 체계 밖).
// RLS(is_admin()/get_service_tier())가 실제 접근 제어를 담당한다. 학습/퀴즈/진행률/개인 복사가
// 없어 publicWordbooks.ts보다 훨씬 단순하다. 개인 책장(lib/books.ts)과는 완전히 별개 테이블.

function requireUserId(): string {
  const user = useAuthStore.getState().user
  if (!user) throw new Error('publicBooks requires an authenticated user')
  return user.id
}

export type CreatePublicBookInput = {
  title: string
  language: string | null
  status: PublicBookStatus
}

export type UpdatePublicBookInput = Partial<Pick<PublicBook, 'title' | 'language' | 'status'>>

export type PublicBookChapterInput = {
  title: string
  content: string
}

// ── Admin ────────────────────────────────────────────────────────────────

export async function getAdminPublicBooks(): Promise<PublicBook[]> {
  const { data, error } = await supabase.from('public_books').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getAdminPublicBook(id: string): Promise<PublicBook | null> {
  const { data, error } = await supabase.from('public_books').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function createPublicBook(input: CreatePublicBookInput): Promise<PublicBook> {
  const { data, error } = await supabase
    .from('public_books')
    .insert({ ...input, created_by: requireUserId() })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updatePublicBook(id: string, input: UpdatePublicBookInput): Promise<void> {
  const { error } = await supabase
    .from('public_books')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// 2026-09-10 신설 — 하위 public_book_chapters는 ON DELETE CASCADE(마이그레이션 41)로 함께 삭제된다.
export async function deletePublicBook(id: string): Promise<void> {
  const { error } = await supabase.from('public_books').delete().eq('id', id)
  if (error) throw error
}

export async function deletePublicBooks(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('public_books').delete().in('id', ids)
  if (error) throw error
}

export async function getAdminPublicBookChapters(bookId: string): Promise<PublicBookChapter[]> {
  const { data, error } = await supabase
    .from('public_book_chapters')
    .select('*')
    .eq('book_id', bookId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data ?? []
}

async function nextSortOrder(bookId: string): Promise<number> {
  const { data, error } = await supabase
    .from('public_book_chapters')
    .select('sort_order')
    .eq('book_id', bookId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data?.sort_order ?? -1) + 1
}

export async function createPublicBookChapter(bookId: string, input: PublicBookChapterInput): Promise<PublicBookChapter> {
  const sortOrder = await nextSortOrder(bookId)
  const { data, error } = await supabase
    .from('public_book_chapters')
    .insert({ book_id: bookId, title: input.title, content: input.content, sort_order: sortOrder })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function bulkCreatePublicBookChapters(bookId: string, chapters: PublicBookChapterInput[]): Promise<void> {
  let sortOrder = await nextSortOrder(bookId)
  const rows = chapters.map((c) => ({
    book_id: bookId,
    title: c.title,
    content: c.content,
    sort_order: sortOrder++,
  }))
  const { error } = await supabase.from('public_book_chapters').insert(rows)
  if (error) throw error
}

// 2026-09-10 신설
export async function deletePublicBookChapter(id: string): Promise<void> {
  const { error } = await supabase.from('public_book_chapters').delete().eq('id', id)
  if (error) throw error
}

// "비우기" — 책은 유지한 채 하위 목차 전체만 삭제.
export async function clearPublicBookChapters(bookId: string): Promise<void> {
  const { error } = await supabase.from('public_book_chapters').delete().eq('book_id', bookId)
  if (error) throw error
}

// ── 사용자(Pro/Master) ──────────────────────────────────────────────────

export async function getPublishedPublicBooks(): Promise<PublicBook[]> {
  const { data, error } = await supabase
    .from('public_books')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getPublicBook(id: string): Promise<PublicBook | null> {
  const { data, error } = await supabase.from('public_books').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function getPublicBookChapters(bookId: string): Promise<PublicBookChapter[]> {
  const { data, error } = await supabase
    .from('public_book_chapters')
    .select('*')
    .eq('book_id', bookId)
    .eq('status', 'active')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data ?? []
}
