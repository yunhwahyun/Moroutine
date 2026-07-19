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
    <div className="min-h-dvh bg-white px-6 py-8">
      <div className="max-w-lg mx-auto flex flex-col gap-6">
        <h1 className="text-lg font-bold text-gray-900">공용 단어장 관리</h1>

        <div className="flex items-center justify-between">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
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
          <button
            onClick={() => navigate('/admin/wordbooks/new')}
            className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium"
          >
            + 신규
          </button>
        </div>

        {isLoading && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-10">단어장이 없습니다.</p>
        )}

        <div className="flex flex-col gap-3">
          {filtered.map((wb) => (
            <button
              key={wb.id}
              onClick={() => navigate(`/admin/wordbooks/${wb.id}`)}
              className="text-left border border-gray-100 rounded-lg px-4 py-3 hover:border-gray-300"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-900">{wb.title}</span>
                <span className="text-xs text-gray-400">{STATUS_LABEL[wb.status]}</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {wb.category ?? '카테고리 없음'} · {wb.difficulty} · 단어 {wb.word_count}개
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
