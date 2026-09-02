import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getAdminPublicWordbooks } from '@/lib/publicWordbooks'
import Spinner from '@/components/ui/Spinner'
import type { PublicWordbookStatus } from '@/types'

const STATUS_LABEL: Record<PublicWordbookStatus, string> = {
  draft: '초안',
  published: '게시됨',
  hidden: '숨김',
  archived: '보관됨',
}

const FILTERS: (PublicWordbookStatus | 'all')[] = ['all', 'draft', 'published', 'hidden', 'archived']

// docs/ADMIN_DESIGN.md §2 — WordbookListPage.tsx와 헤더/필터/카드 톤을 맞춘다(사용자·관리자 통일감, 2026-09-02).
export default function AdminWordbookListPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<PublicWordbookStatus | 'all'>('all')

  const { data: wordbooks = [], isLoading } = useQuery({
    queryKey: ['admin', 'public-wordbooks'],
    queryFn: getAdminPublicWordbooks,
  })

  const filtered = useMemo(
    () => (filter === 'all' ? wordbooks : wordbooks.filter((wb) => wb.status === filter)),
    [wordbooks, filter],
  )

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="bg-white flex items-center justify-between px-4 pt-6 pb-4 border-b border-gray-100">
        <h1 className="text-lg font-bold text-gray-900">단어장</h1>
        <button
          onClick={() => navigate('/admin/wordbooks/new')}
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
            <p className="text-gray-400 text-sm">단어장이 없습니다</p>
            <p className="text-gray-300 text-xs">신규 버튼으로 만들어보세요</p>
          </div>
        )}

        {filtered.map((wb) => (
          <button
            key={wb.id}
            onClick={() => navigate(`/admin/wordbooks/${wb.id}`)}
            className="text-left bg-white rounded-2xl shadow-sm overflow-hidden px-4 py-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                {wb.title}
                {wb.is_sample && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-900 text-white">샘플</span>
                )}
              </span>
              <span className="text-xs text-gray-400">{STATUS_LABEL[wb.status]}</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {wb.category ?? '카테고리 없음'} · {wb.difficulty} · 단어 {wb.word_count}개
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}
