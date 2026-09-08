import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { Book, BookChapter, BookStatus } from '@/types'

// docs/ADMIN_DESIGN.md §책장 — 공용 단어장(publicWordbooks.ts)과 같은 이유로 DataRepository를
// 확장하지 않고 독립 모듈로 직접 Supabase를 호출한다(Guest는 접근 불가, Admin은 tier 체계 밖).
// RLS(is_admin()/get_service_tier())가 실제 접근 제어를 담당한다. 학습/퀴즈/진행률/개인 복사가
// 없어 publicWordbooks.ts보다 훨씬 단순하다.

function requireUserId(): string {
  const user = useAuthStore.getState().user
  if (!user) throw new Error('books requires an authenticated user')
  return user.id
}

export type CreateBookInput = {
  title: string
  language: string | null
  status: BookStatus
}

export type UpdateBookInput = Partial<Pick<Book, 'title' | 'language' | 'status'>>

export type BookChapterInput = {
  title: string
  content: string
}

// ── Admin ────────────────────────────────────────────────────────────────

export async function getAdminBooks(): Promise<Book[]> {
  const { data, error } = await supabase.from('books').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getAdminBook(id: string): Promise<Book | null> {
  const { data, error } = await supabase.from('books').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function createBook(input: CreateBookInput): Promise<Book> {
  const { data, error } = await supabase
    .from('books')
    .insert({ ...input, created_by: requireUserId() })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateBook(id: string, input: UpdateBookInput): Promise<void> {
  const { error } = await supabase
    .from('books')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function getAdminChapters(bookId: string): Promise<BookChapter[]> {
  const { data, error } = await supabase
    .from('book_chapters')
    .select('*')
    .eq('book_id', bookId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data ?? []
}

async function nextSortOrder(bookId: string): Promise<number> {
  const { data, error } = await supabase
    .from('book_chapters')
    .select('sort_order')
    .eq('book_id', bookId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return (data?.sort_order ?? -1) + 1
}

export async function createChapter(bookId: string, input: BookChapterInput): Promise<BookChapter> {
  const sortOrder = await nextSortOrder(bookId)
  const { data, error } = await supabase
    .from('book_chapters')
    .insert({ book_id: bookId, title: input.title, content: input.content, sort_order: sortOrder })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function bulkCreateChapters(bookId: string, chapters: BookChapterInput[]): Promise<void> {
  let sortOrder = await nextSortOrder(bookId)
  const rows = chapters.map((c) => ({
    book_id: bookId,
    title: c.title,
    content: c.content,
    sort_order: sortOrder++,
  }))
  const { error } = await supabase.from('book_chapters').insert(rows)
  if (error) throw error
}

// ── 사용자(Pro/Master) ──────────────────────────────────────────────────

export async function getPublishedBooks(): Promise<Book[]> {
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getBook(id: string): Promise<Book | null> {
  const { data, error } = await supabase.from('books').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function getChapters(bookId: string): Promise<BookChapter[]> {
  const { data, error } = await supabase
    .from('book_chapters')
    .select('*')
    .eq('book_id', bookId)
    .eq('status', 'active')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data ?? []
}
