import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { usePermissions } from '@/hooks/usePermissions'
import { getPublishedBooks, getChapters } from '@/lib/books'
import { buildChapterAutoPlaySegments, buildChapterAutoPlayCaption } from '@/lib/bookAutoplaySegments'
import { useAutoplayStore } from '@/stores/autoplayStore'
import { ChevronRightIcon, PlayIcon } from '@/components/icons'
import Spinner from '@/components/ui/Spinner'

const LANG_LABEL: Record<string, string> = {
  'en-ko': '영어',
  'ja-ko': '일본어',
  'zh-ko': '중국어',
}

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

// docs/ADMIN_DESIGN.md §책장 — 공용 단어장과 동일하게 Pro/Master 전용, Guest는 접근 불가.
// 학습/퀴즈가 없어 다중 선택 후 할 수 있는 액션은 자동재생뿐이다(순차 재생, 랜덤 아님).
export default function BookshelfListPage() {
  const navigate = useNavigate()
  const { permissions } = usePermissions()
  const canUse = permissions?.canUsePublicWordbooks ?? false

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isActionLoading, setIsActionLoading] = useState(false)

  const { data: books = [], isLoading } = useQuery({
    queryKey: ['books'],
    queryFn: getPublishedBooks,
    enabled: canUse,
  })

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
    if (selectedIds.size === 0 || isActionLoading) return
    setIsActionLoading(true)
    try {
      const chapterLists = await Promise.all([...selectedIds].map((id) => getChapters(id)))
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

  if (!canUse) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 gap-3 text-center">
        <p className="text-sm font-semibold text-gray-900">Pro/Master 전용 기능입니다</p>
        <p className="text-xs text-gray-400">책장은 요금제를 업그레이드하면 이용할 수 있어요.</p>
        <button
          onClick={() => navigate('/pricing')}
          className="mt-2 px-4 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium"
        >
          요금제 보기
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="bg-white flex items-center gap-2 px-4 pt-6 pb-4 border-b border-gray-100">
        <h1 className="text-lg font-bold text-gray-900">책장</h1>
        {selectedIds.size > 0 && (
          <span className="text-xs text-gray-400">{selectedIds.size}개 선택됨</span>
        )}
      </div>

      {/* 리스트 */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {isLoading && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}

        {!isLoading && books.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-16">공개된 책이 없습니다</p>
        )}

        {books.map((b) => (
          <div
            key={b.id}
            className={`bg-white rounded-2xl shadow-sm overflow-hidden flex items-center gap-3 px-4 py-4 cursor-pointer transition-shadow ${
              selectedIds.has(b.id) ? 'ring-2 ring-gray-900 ring-inset' : ''
            }`}
            onClick={() => toggleId(b.id)}
          >
            <Checkbox checked={selectedIds.has(b.id)} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {b.language && (
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                    {LANG_LABEL[b.language] ?? b.language}
                  </span>
                )}
                <span className="text-xs text-gray-400">목차 {b.chapter_count}개</span>
              </div>
              <p className="text-sm font-semibold text-gray-900 mt-0.5 truncate">{b.title}</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/books/${b.id}`) }}
              className="p-1 text-gray-300"
              aria-label="책 상세"
            >
              <ChevronRightIcon />
            </button>
          </div>
        ))}
      </div>

      {/* 선택 시 하단 액션바 — 학습/퀴즈가 없어 자동재생 버튼 하나뿐 */}
      {selectedIds.size > 0 && (
        <div className="px-4 py-3 bg-white border-t border-gray-100">
          <button
            onClick={handleAutoPlayStart}
            disabled={isActionLoading || !autoSupported}
            className="w-full py-3 rounded-lg bg-gray-900 text-white text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <PlayIcon size={18} />
            {isActionLoading ? '로딩 중...' : '선택한 책 자동재생'}
          </button>
        </div>
      )}
    </div>
  )
}
