import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getAdminPublicWordbooks, deletePublicWordbooks } from '@/lib/publicWordbooks'
import { ChevronRightIcon } from '@/components/icons'
import Spinner from '@/components/ui/Spinner'
import type { PublicWordbookStatus } from '@/types'

const STATUS_LABEL: Record<PublicWordbookStatus, string> = {
  draft: '초안',
  default: '기본',
  published: '게시됨',
  archived: '보관됨',
}

const FILTERS: (PublicWordbookStatus | 'all')[] = ['all', 'draft', 'default', 'published', 'archived']

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

// docs/ADMIN_DESIGN.md §2 — WordbookListPage.tsx와 헤더/필터/카드 톤을 맞춘다(사용자·관리자 통일감, 2026-09-02).
// 2026-09-10 — 멀티 선택 삭제 추가(WordbookListPage.tsx의 selectedIds 패턴 재사용).
export default function AdminWordbookListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<PublicWordbookStatus | 'all'>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const { data: wordbooks = [], isLoading } = useQuery({
    queryKey: ['admin', 'public-wordbooks'],
    queryFn: getAdminPublicWordbooks,
  })

  const filtered = useMemo(
    () => (filter === 'all' ? wordbooks : wordbooks.filter((wb) => wb.status === filter)),
    [wordbooks, filter],
  )

  const { mutate: deleteSelected, isPending: isDeleting } = useMutation({
    mutationFn: (ids: string[]) => deletePublicWordbooks(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'public-wordbooks'] })
      setSelectedIds(new Set())
    },
    onError: (err) => console.error('[admin wordbook bulk delete error]', err),
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
    if (!confirm(`선택한 단어장 ${selectedIds.size}개를 삭제하시겠습니까? 포함된 단어도 함께 삭제되며, 되돌릴 수 없습니다.`)) return
    deleteSelected([...selectedIds])
  }

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="bg-white flex items-center justify-between px-4 pt-6 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold text-gray-900">단어장</h1>
          {selectedIds.size > 0 && <span className="text-xs text-gray-400">{selectedIds.size}개 선택됨</span>}
        </div>
        <button
          onClick={() => navigate('/admin/wordbooks/new')}
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
            <p className="text-gray-400 text-sm">단어장이 없습니다</p>
            <p className="text-gray-300 text-xs">신규 버튼으로 만들어보세요</p>
          </div>
        )}

        {filtered.map((wb) => (
          <div
            key={wb.id}
            className={`bg-white rounded-2xl shadow-sm overflow-hidden flex items-center gap-3 px-4 py-4 cursor-pointer ${
              selectedIds.has(wb.id) ? 'ring-2 ring-gray-900 ring-inset' : ''
            }`}
            onClick={() => toggleId(wb.id)}
          >
            <Checkbox checked={selectedIds.has(wb.id)} />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold text-gray-900 truncate block">{wb.title}</span>
              <p className="text-xs text-gray-400 mt-1">단어 {wb.word_count}개</p>
            </div>
            <span className="text-xs text-gray-400 shrink-0">{STATUS_LABEL[wb.status]}</span>
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/admin/wordbooks/${wb.id}`) }}
              className="p-1 text-gray-300 shrink-0"
              aria-label="단어장 상세"
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
