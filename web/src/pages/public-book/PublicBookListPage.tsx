import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { usePermissions } from '@/hooks/usePermissions'
import { getPublishedPublicBooks } from '@/lib/publicBooks'
import { BackIcon, ChevronRightIcon } from '@/components/icons'
import Spinner from '@/components/ui/Spinner'

const LANG_LABEL: Record<string, string> = {
  'en-ko': '영어',
  'ja-ko': '일본어',
  'zh-ko': '중국어',
}

// docs/ADMIN_DESIGN.md §8 — 공용 단어장과 동일하게 Pro/Master 전용, Guest는 접근 불가.
// PublicWordbookListPage.tsx와 동일하게 순수 열람 목록(다중 선택/자동재생/복사는 없음) —
// 다중 선택 자동재생은 개인 책장(BookshelfListPage)에서만 지원한다.
export default function PublicBookListPage() {
  const navigate = useNavigate()
  const { permissions } = usePermissions()
  const canUse = permissions?.canUsePublicWordbooks ?? false

  const { data: books = [], isLoading } = useQuery({
    queryKey: ['public-books'],
    queryFn: getPublishedPublicBooks,
    enabled: canUse,
  })

  if (!canUse) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 gap-3 text-center">
        <p className="text-sm font-semibold text-gray-900">Pro/Master 전용 기능입니다</p>
        <p className="text-xs text-gray-400">공용 책장은 요금제를 업그레이드하면 이용할 수 있어요.</p>
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
      <div className="bg-white px-4 pt-6 pb-4 border-b border-gray-100 flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="p-1 -ml-1 text-gray-600" aria-label="뒤로">
          <BackIcon />
        </button>
        <h1 className="text-lg font-bold text-gray-900">공용 책장</h1>
      </div>

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
          <button
            key={b.id}
            onClick={() => navigate(`/public-books/${b.id}`)}
            className="text-left bg-white rounded-2xl shadow-sm overflow-hidden flex items-center gap-3 px-4 py-4"
          >
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
            <ChevronRightIcon className="text-gray-300 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  )
}
