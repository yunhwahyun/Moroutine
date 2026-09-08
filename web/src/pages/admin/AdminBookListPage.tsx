import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getAdminBooks } from '@/lib/books'
import Spinner from '@/components/ui/Spinner'
import type { BookStatus } from '@/types'

const STATUS_LABEL: Record<BookStatus, string> = {
  draft: '초안',
  published: '게시됨',
  archived: '보관됨',
}

const FILTERS: (BookStatus | 'all')[] = ['all', 'draft', 'published', 'archived']

// AdminWordbookListPage.tsx와 헤더/필터/카드 톤을 맞춘다.
export default function AdminBookListPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<BookStatus | 'all'>('all')

  const { data: books = [], isLoading } = useQuery({
    queryKey: ['admin', 'books'],
    queryFn: getAdminBooks,
  })

  const filtered = useMemo(
    () => (filter === 'all' ? books : books.filter((b) => b.status === filter)),
    [books, filter],
  )

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="bg-white flex items-center justify-between px-4 pt-6 pb-4 border-b border-gray-100">
        <h1 className="text-lg font-bold text-gray-900">책장</h1>
        <button
          onClick={() => navigate('/admin/books/new')}
          className="text-sm text-gray-600 font-medium px-3 py-1.5 rounded-lg border border-gray-200"
        >
          + 신규
        </button>
      </div>

      {/* 필터 — 전체 너비, 좌측 정렬 */}
      <div className="bg-white px-4 pb-4 border-b border-gray-100">
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
          <button
            key={b.id}
            onClick={() => navigate(`/admin/books/${b.id}`)}
            className="text-left bg-white rounded-2xl shadow-sm overflow-hidden px-4 py-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-900">{b.title}</span>
              <span className="text-xs text-gray-400">{STATUS_LABEL[b.status]}</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">목차 {b.chapter_count}개</p>
          </button>
        ))}
      </div>
    </div>
  )
}
