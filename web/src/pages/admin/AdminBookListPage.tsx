import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getAdminPublicBooks, deletePublicBooks } from '@/lib/publicBooks'
import { ChevronRightIcon } from '@/components/icons'
import Spinner from '@/components/ui/Spinner'
import type { PublicBookStatus } from '@/types'

const STATUS_LABEL: Record<PublicBookStatus, string> = {
  draft: '초안',
  published: '게시됨',
  archived: '보관됨',
}

const FILTERS: (PublicBookStatus | 'all')[] = ['all', 'draft', 'published', 'archived']

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

// AdminWordbookListPage.tsx와 헤더/필터/카드 톤을 맞춘다. 여기서 관리하는 건 "공용 책장"이다
// (사용자가 직접 만드는 개인 책장은 web/src/pages/bookshelf/에 별도로 있다).
// 2026-09-10 — 멀티 선택 삭제 추가.
export default function AdminBookListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<PublicBookStatus | 'all'>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const { data: books = [], isLoading } = useQuery({
    queryKey: ['admin', 'public-books'],
    queryFn: getAdminPublicBooks,
  })

  const filtered = useMemo(
    () => (filter === 'all' ? books : books.filter((b) => b.status === filter)),
    [books, filter],
  )

  const { mutate: deleteSelected, isPending: isDeleting } = useMutation({
    mutationFn: (ids: string[]) => deletePublicBooks(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'public-books'] })
      setSelectedIds(new Set())
    },
    onError: (err) => console.error('[admin book bulk delete error]', err),
  })

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return
    if (!confirm(`선택한 책 ${selectedIds.size}개를 삭제하시겠습니까? 포함된 목차도 함께 삭제되며, 되돌릴 수 없습니다.`)) return
    deleteSelected([...selectedIds])
  }

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="bg-white flex items-center justify-between px-4 pt-6 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold text-gray-900">책장</h1>
          {selectedIds.size > 0 && <span className="text-xs text-gray-400">{selectedIds.size}개 선택됨</span>}
        </div>
        <button
          onClick={() => navigate('/admin/books/new')}
          className="text-sm text-gray-600 font-medium px-3 py-1.5 rounded-lg border border-gray-200"
        >
          + 신규
        </button>
      </div>

      {/* 필터 — 전체 너비, 좌측 정렬 */}
      <div className="bg-white px-4 pt-3 pb-4 border-b border-gray-100">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-full justify-start">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                filter === f ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              {f === 'all' ? '전체' : STATUS_LABEL[f]}
            </button>
          ))}
        </div>
      </div>

      {/* 리스트 */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {isLoading && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-1">
            <p className="text-gray-400 text-sm">책이 없습니다</p>
            <p className="text-gray-300 text-xs">신규 버튼으로 만들어보세요</p>
          </div>
        )}

        {filtered.map((b) => (
          <div
            key={b.id}
            className={`bg-white rounded-2xl shadow-sm overflow-hidden flex items-center gap-3 px-4 py-4 cursor-pointer ${
              selectedIds.has(b.id) ? 'ring-2 ring-gray-900 ring-inset' : ''
            }`}
            onClick={() => toggleId(b.id)}
          >
            <Checkbox checked={selectedIds.has(b.id)} />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-gray-900 truncate block">{b.title}</span>
              <p className="text-xs text-gray-400 mt-1">목차 {b.chapter_count}개</p>
            </div>
            <span className="text-xs text-gray-400 shrink-0">{STATUS_LABEL[b.status]}</span>
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/admin/books/${b.id}`) }}
              className="p-1 text-gray-300 shrink-0"
              aria-label="책 상세"
            >
              <ChevronRightIcon />
            </button>
          </div>
        ))}
      </div>

      {/* 선택 시 하단 액션바 */}
      {selectedIds.size > 0 && (
        <div className="px-4 py-3 bg-white border-t border-gray-100">
          <button
            onClick={handleDeleteSelected}
            disabled={isDeleting}
            className="w-full py-3 rounded-lg bg-red-500 text-white text-sm font-medium disabled:opacity-50"
          >
            {isDeleting ? '삭제 중...' : `선택한 ${selectedIds.size}개 삭제`}
          </button>
        </div>
      )}
    </div>
  )
}
