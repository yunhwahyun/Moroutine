import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getPublicBook, getPublicBookChapters } from '@/lib/publicBooks'
import { buildChapterAutoPlaySegments, buildChapterAutoPlayCaption } from '@/lib/bookAutoplaySegments'
import { sourceTTSLang } from '@/lib/ttsLang'
import { useAutoplayStore } from '@/stores/autoplayStore'
import { usePermissions } from '@/hooks/usePermissions'
import { BackIcon, SpeakerIcon } from '@/components/icons'
import Spinner from '@/components/ui/Spinner'
import ExpandableText from '@/components/ui/ExpandableText'

// 원본 참조 방식 — 읽기 전용, 수정/삭제 UI 없음. 학습/퀴즈가 없어 공용 단어장 상세 화면보다
// 단순하다. "듣기"는 탭한 목차부터 그 책의 전체 목차를 자동재생 세션으로 시작한다 —
// 미니 플레이어의 이전/다음으로 같은 책의 다른 목차로 자연스럽게 넘어갈 수 있다.
export default function PublicBookViewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { permissions } = usePermissions()
  const canUse = permissions?.canUsePublicWordbooks ?? false

  const { data: book } = useQuery({
    queryKey: ['public-book', id],
    queryFn: () => getPublicBook(id!),
    enabled: !!id,
  })

  const { data: chapters = [], isLoading } = useQuery({
    queryKey: ['public-book-chapters', id],
    queryFn: () => getPublicBookChapters(id!),
    enabled: !!id,
  })

  const autoSupported = useAutoplayStore((s) => s.isSupported)
  const autoStart = useAutoplayStore((s) => s.start)

  const handleListen = (startIndex: number) => {
    if (chapters.length === 0) return
    // 사용자 리포트 — 중국어/일본어 책장이 항상 영어 음성으로 읽혔음(docs/DECISION_LOG.md 2026-09-16).
    const lang = sourceTTSLang(book?.language)
    autoStart(
      chapters.map((c) => ({
        term: c.title,
        caption: buildChapterAutoPlayCaption(c),
        segments: buildChapterAutoPlaySegments(c, lang),
      })),
      { startIndex },
    )
  }

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
    <div className="flex flex-col min-h-dvh bg-gray-50">
      <div
        className="sticky top-0 z-10 bg-white flex items-center justify-between px-4 pb-3 border-b border-gray-100"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <button onClick={() => navigate(-1)} className="p-1 -ml-1 text-gray-600" aria-label="뒤로">
          <BackIcon />
        </button>
        <h1 className="text-base font-semibold text-gray-900 truncate max-w-[200px]">
          {book?.title ?? '책'}
        </h1>
        <button
          onClick={() => handleListen(0)}
          disabled={!autoSupported || chapters.length === 0}
          className="text-xs text-gray-500 px-2.5 py-1.5 rounded-md border border-gray-200 disabled:opacity-40"
        >
          전체 듣기
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 pb-6">
        {isLoading && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}

        {!isLoading && chapters.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-16">등록된 목차가 없습니다</p>
        )}

        {chapters.map((chapter, i) => (
          <div key={chapter.id} className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-300 shrink-0">{i + 1}</span>
              <span className="text-base font-bold text-gray-900 flex-1 min-w-0 truncate">{chapter.title}</span>
              <button
                onClick={() => handleListen(i)}
                disabled={!autoSupported}
                className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-40 shrink-0"
                aria-label="듣기"
              >
                <SpeakerIcon />
              </button>
            </div>
            <ExpandableText text={chapter.content} />
          </div>
        ))}
      </div>
    </div>
  )
}
