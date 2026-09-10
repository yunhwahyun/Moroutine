import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePermissions } from '@/hooks/usePermissions'
import { getRepository } from '@/repositories/factory'
import { useAutoplayStore } from '@/stores/autoplayStore'
import { buildChapterAutoPlaySegments, buildChapterAutoPlayCaption } from '@/lib/bookAutoplaySegments'
import { EditIcon, ChevronRightIcon, PlayIcon } from '@/components/icons'
import Spinner from '@/components/ui/Spinner'
import type { Book } from '@/types'

const LANG_LABEL: Record<string, string> = {
  'en-ko': '영어',
  'ja-ko': '일본어',
  'zh-ko': '중국어',
}

const LANG_OPTIONS = [
  { value: '', label: '언어 선택 (선택사항)' },
  { value: 'en-ko', label: '영어' },
  { value: 'ja-ko', label: '일본어' },
  { value: 'zh-ko', label: '중국어' },
]

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <div
      className={`w-5 h-5 rounded border-2 flex-none flex items-center justify-center transition-colors ${
        checked ? 'bg-gray-900 border-gray-900' : 'border-gray-200'
      }`}
    >
      {checked && (
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  )
}

// WordbookListPage.tsx와 동일한 패턴(누구나 개인 책을 만들 수 있음, Guest 포함) + 헤더의
// "공용 책장" 링크(Pro/Master에게만 노출, PublicBookListPage로 이동). 학습/퀴즈가 없어 다중
// 선택 후 액션은 자동재생뿐이다(선택 순서 → 책 안에서는 목차 순서, 랜덤 아님).
export default function BookshelfListPage() {
  const navigate = useNavigate()
  const { permissions } = usePermissions()
  const tier = permissions?.serviceTier ?? null
  const repository = tier && tier !== 'admin' ? getRepository(tier) : null
  const queryClient = useQueryClient()

  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [formLanguage, setFormLanguage] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isActionLoading, setIsActionLoading] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editLanguage, setEditLanguage] = useState('')

  const { data: books = [], isLoading } = useQuery<Book[]>({
    queryKey: ['books', tier],
    queryFn: () => repository!.getBooks(),
    enabled: !!repository,
  })

  const { mutateAsync: createBook, isPending, error: createError, reset: resetError } = useMutation({
    mutationFn: async ({ name, language }: { name: string; language: string | null }) =>
      repository!.createBook({ name, language }),
    onSuccess: (data) => {
      queryClient.setQueryData<Book[]>(['books', tier], (old = []) => [data, ...old])
      handleCancelForm()
    },
    onError: (err) => console.error('[book create error]', err),
  })

  const { mutate: deleteBook, isPending: isDeleting } = useMutation({
    mutationFn: async (id: string) => {
      await repository!.deleteBook(id)
    },
    onSuccess: (_, id) => {
      queryClient.setQueryData<Book[]>(['books', tier], (old = []) => old.filter((b) => b.id !== id))
      setEditingId(null)
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next })
    },
    onError: (err) => console.error('[book delete error]', err),
  })

  // 2026-09-10 신설 — 멀티 선택 삭제.
  const { mutate: deleteSelectedBooks, isPending: isBulkDeleting } = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map((bid) => repository!.deleteBook(bid)))
    },
    onSuccess: (_, ids) => {
      queryClient.setQueryData<Book[]>(['books', tier], (old = []) => old.filter((b) => !ids.includes(b.id)))
      setSelectedIds(new Set())
    },
    onError: (err) => console.error('[book bulk delete error]', err),
  })

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return
    if (!confirm(`선택한 책 ${selectedIds.size}개를 삭제하시겠습니까? 포함된 목차도 함께 삭제되며, 되돌릴 수 없습니다.`)) return
    deleteSelectedBooks([...selectedIds])
  }

  const { mutate: updateBook, isPending: isUpdating } = useMutation({
    mutationFn: async ({ id, name, language }: { id: string; name: string; language: string | null }) => {
      await repository!.updateBook(id, { name, language })
    },
    onSuccess: (_, { id, name, language }) => {
      queryClient.setQueryData<Book[]>(['books', tier], (old = []) =>
        old.map((b) => (b.id === id ? { ...b, name, language } : b)),
      )
      setEditingId(null)
    },
    onError: (err) => console.error('[book update error]', err),
  })

  const handleCancelForm = () => {
    setShowForm(false)
    setFormName('')
    setFormLanguage('')
  }

  const handleCreate = async () => {
    if (!formName.trim()) return
    await createBook({ name: formName.trim(), language: formLanguage || null })
  }

  const handleEditStart = (book: Book) => {
    setEditingId(book.id)
    setEditName(book.name)
    setEditLanguage(book.language ?? '')
  }

  const handleEditSave = () => {
    if (!editName.trim() || !editingId) return
    updateBook({ id: editingId, name: editName.trim(), language: editLanguage || null })
  }

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const autoSupported = useAutoplayStore((s) => s.isSupported)
  const autoStart = useAutoplayStore((s) => s.start)

  // 선택 순서 → 책 안에서는 sort_order 순으로 이어 붙인다(셔플 없음, 순차재생).
  const handleAutoPlayStart = async () => {
    if (selectedIds.size === 0 || isActionLoading || !repository) return
    setIsActionLoading(true)
    try {
      const chapterLists = await Promise.all([...selectedIds].map((id) => repository.getChapters(id)))
      const chapters = chapterLists.flat()
      if (chapters.length === 0) return
      autoStart(
        chapters.map((c) => ({
          term: c.title,
          caption: buildChapterAutoPlayCaption(c),
          segments: buildChapterAutoPlaySegments(c),
        })),
      )
    } catch (err) {
      console.error('[bookshelf autoplay fetch error]', err)
    } finally {
      setIsActionLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="bg-white flex items-center justify-between px-4 pt-6 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold text-gray-900">책장</h1>
          {selectedIds.size > 0 && (
            <span className="text-xs text-gray-400">{selectedIds.size}개 선택됨</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {permissions?.canUsePublicWordbooks && (
            <button
              onClick={() => navigate('/public-books')}
              className="text-sm text-gray-500 font-medium px-3 py-1.5 rounded-lg border border-gray-200"
            >
              공용 책장
            </button>
          )}
          <button
            onClick={() => setShowForm(true)}
            disabled={showForm || !!editingId}
            className="text-sm text-gray-600 font-medium px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40"
          >
            + 추가
          </button>
        </div>
      </div>

      {/* 리스트 */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {/* 새 책 추가 폼 */}
        {showForm && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-3">
            {createError ? (
              <>
                <p className="text-red-500 text-sm text-center py-1">
                  {(createError as { message?: string })?.message ?? '추가에 실패했습니다.'}
                </p>
                <button
                  onClick={() => { resetError(); setFormName(''); setFormLanguage('') }}
                  className="w-full py-2.5 rounded-lg border border-gray-200 text-gray-700 text-sm"
                >
                  다시 시도
                </button>
              </>
            ) : (
              <>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="책 이름"
                  autoFocus
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-400"
                />
                <select
                  value={formLanguage}
                  onChange={(e) => setFormLanguage(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-400 bg-white text-gray-700"
                >
                  {LANG_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={handleCreate}
                    disabled={!formName.trim() || isPending}
                    className="flex-1 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
                  >
                    {isPending ? '추가 중...' : '추가'}
                  </button>
                  <button
                    onClick={handleCancelForm}
                    className="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-700 text-sm"
                  >
                    취소
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}

        {!isLoading && books.length === 0 && !showForm && (
          <div className="flex flex-col items-center justify-center py-16 gap-1">
            <p className="text-gray-400 text-sm">책이 없습니다</p>
            <p className="text-gray-300 text-xs">책을 추가하고, 목차를 만들어보세요</p>
          </div>
        )}

        {/* 책 목록 */}
        {books.map((book) => (
          <div
            key={book.id}
            className={`bg-white rounded-2xl shadow-sm overflow-hidden ${
              selectedIds.has(book.id) ? 'ring-2 ring-gray-900 ring-inset' : ''
            }`}
          >
            {editingId === book.id ? (
              /* 수정 폼 */
              <div className="p-4 flex flex-col gap-3">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-400"
                />
                <select
                  value={editLanguage}
                  onChange={(e) => setEditLanguage(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-400 bg-white text-gray-700"
                >
                  {LANG_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={handleEditSave}
                    disabled={!editName.trim() || isUpdating || isDeleting}
                    className="flex-1 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
                  >
                    {isUpdating ? '저장 중...' : '수정완료'}
                  </button>
                  <button
                    onClick={() => editingId && deleteBook(editingId)}
                    disabled={isUpdating || isDeleting}
                    className="px-4 py-2.5 rounded-lg border border-red-200 text-red-500 text-sm disabled:opacity-50"
                  >
                    {isDeleting ? '삭제 중...' : '삭제'}
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    disabled={isUpdating || isDeleting}
                    className="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm disabled:opacity-50"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-4 cursor-pointer" onClick={() => toggleId(book.id)}>
                <Checkbox checked={selectedIds.has(book.id)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {book.language && (
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        {LANG_LABEL[book.language] ?? book.language}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">목차 {book.chapter_count}개</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 mt-0.5 truncate">{book.name}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleEditStart(book) }}
                  className="p-1.5 text-gray-300 hover:text-gray-600"
                  aria-label="책 수정"
                >
                  <EditIcon size={14} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); navigate(`/books/${book.id}`) }}
                  className="p-1 text-gray-300"
                  aria-label="책 상세"
                >
                  <ChevronRightIcon />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 선택 시 하단 액션바 — 학습/퀴즈가 없어 자동재생 + 삭제뿐 */}
      {selectedIds.size > 0 && (
        <div className="px-4 py-3 bg-white border-t border-gray-100 flex gap-2">
          <button
            onClick={handleAutoPlayStart}
            disabled={isActionLoading || !autoSupported}
            className="flex-1 py-3 rounded-lg bg-gray-900 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <PlayIcon size={18} />
            {isActionLoading ? '로딩 중...' : '선택한 책 자동재생'}
          </button>
          <button
            onClick={handleDeleteSelected}
            disabled={isBulkDeleting}
            className="w-16 shrink-0 rounded-lg border border-red-200 text-red-500 text-xs font-medium disabled:opacity-50"
          >
            {isBulkDeleting ? '...' : '삭제'}
          </button>
        </div>
      )}
    </div>
  )
}
