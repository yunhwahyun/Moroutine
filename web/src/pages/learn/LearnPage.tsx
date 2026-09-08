import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTTS } from '@/hooks/useTTS'
import { useAutoplayStore } from '@/stores/autoplayStore'
import { buildAutoPlaySegments, buildAutoPlayCaption } from '@/lib/autoplaySegments'
import { renderLineBreaks } from '@/lib/text'
import { BackIcon, SpeakerIcon, PlayIcon } from '@/components/icons'
import { STATUS_LABEL, STATUS_COLOR } from '@/lib/wordConstants'
import { usePermissions } from '@/hooks/usePermissions'
import { getRepository } from '@/repositories/factory'
import type { Word } from '@/types'




function statusGroup(w: Word): number {
  if (w.status === 'unseen' || w.status === 'learning') return 0
  if (w.status === 'reviewing') return w.review_step  // 1 | 2 | 3
  return 4  // mastered
}

function sortWords(words: Word[]): Word[] {
  return [...words].sort((a, b) => {
    const ga = statusGroup(a)
    const gb = statusGroup(b)
    if (ga !== gb) return ga - gb
    // 같은 그룹 안에서 최근 생성(내림차순)
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
}

export default function LearnPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { speak, isSupported } = useTTS()
  const { permissions } = usePermissions()
  const tier = permissions?.serviceTier ?? null
  const repository = tier && tier !== 'admin' ? getRepository(tier) : null

  const words: Word[] = sortWords(location.state?.words ?? [])
  // docs/DECISION_LOG.md 2026-07-19 — 공용 단어장 학습은 개인 study_sessions에 기록하지 않는다.
  const isPublicMode = !!location.state?.targets?.some(
    (t: { type: string }) => t.type === 'public_wordbook',
  )
  const sessionIdRef = useRef<string | null>(null)
  const sessionCreatedRef = useRef(false)  // React StrictMode 개발 모드 이중 마운트로 세션이 중복 생성되는 것 방지

  const autoActive = useAutoplayStore((s) => s.active)
  const autoIndex = useAutoplayStore((s) => s.index)
  const autoSupported = useAutoplayStore((s) => s.isSupported)
  const autoStart = useAutoplayStore((s) => s.start)

  // 이 버튼은 재생/일시정지를 토글하지 않는다(재생 중엔 애초에 안 보이고 미니 플레이어로 대체됨) —
  // 항상 "처음부터 새로 재생 시작"만 한다.
  const handleAutoPlayStart = () => {
    if (words.length === 0) return
    autoStart(
      words.map((w) => ({ term: w.term, caption: buildAutoPlayCaption(w), segments: buildAutoPlaySegments(w) })),
    )
  }

  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  useEffect(() => {
    if (autoActive) cardRefs.current[autoIndex]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [autoActive, autoIndex])

  useEffect(() => {
    if (words.length === 0 || !repository || sessionCreatedRef.current || isPublicMode) return
    sessionCreatedRef.current = true
    repository
      .createStudySession({ sessionType: 'learn', wordbookIds: [], totalCount: words.length })
      .then((id) => { sessionIdRef.current = id })
      .catch(console.error)
  }, [repository]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleComplete = () => {
    if (sessionIdRef.current && repository) {
      repository.completeStudySession(sessionIdRef.current, words.length, 0).catch(console.error)
    }
    navigate(-1)
  }

  return (
    <div className="flex flex-col min-h-dvh bg-gray-50">
      {/* 헤더 */}
      <div
        className="sticky top-0 z-10 bg-white flex items-center justify-between px-4 pb-3 border-b border-gray-100"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <button
          onClick={() => navigate(-1)}
          className="p-1 -ml-1 text-gray-600"
          aria-label="뒤로"
        >
          <BackIcon />
        </button>
        <h1 className="text-base font-semibold text-gray-900">학습하기</h1>
        <span className="text-sm text-gray-400">{words.length}개</span>
      </div>

      {/* 단어 목록 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 pb-2">
        {words.map((word, i) => (
          <div
            key={word.id}
            ref={(el) => { cardRefs.current[i] = el }}
            className={`bg-white rounded-2xl p-5 shadow-sm transition-shadow ${
              autoActive && autoIndex === i ? 'ring-2 ring-gray-900' : ''
            }`}
          >
            {/* 번호 + 상태 배지 + TTS */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-300 font-medium">{i + 1}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[word.status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {STATUS_LABEL[word.status] ?? word.status}
                </span>
              </div>
              {isSupported && (
                <button
                  onClick={() => speak(word.term)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 active:text-gray-900 transition-colors"
                  aria-label="발음 듣기"
                >
                  <SpeakerIcon />
                </button>
              )}
            </div>

            {/* 단어 */}
            <p className="text-2xl font-bold text-gray-900 mb-1">{word.term}</p>

            {/* 뜻 */}
            <p className="text-gray-600 text-sm leading-relaxed">{word.definition}</p>

            {/* 구분선 */}
            {(word.example || word.memo) && (
              <div className="border-t border-gray-100 my-3" />
            )}

            {/* 예문 */}
            {word.example && (
              <p className="text-gray-400 text-xs italic leading-relaxed mb-2">
                <span className="not-italic text-gray-300 mr-1">예문</span>
                {renderLineBreaks(word.example)}
              </p>
            )}

            {/* 메모 */}
            {word.memo && (
              <div className="bg-yellow-50 rounded-xl px-3 py-2 mt-1">
                <p className="text-yellow-700 text-xs leading-relaxed">{word.memo}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 자동재생 진행 중엔 전역 미니 플레이어(GlobalAutoPlayBar)에 가려지지 않도록 여백 확보 */}
      {autoActive && <div className="h-20" />}

      {/* 자동재생 토글 영역 — 재생 전엔 슬림 바로 노출, 재생 중엔 전역 미니 플레이어가 대신 보인다 */}
      {words.length > 0 && !autoActive && (
        <div className="px-4 pb-2 pt-1 flex justify-center border-t border-gray-100 bg-white">
          <button
            onClick={handleAutoPlayStart}
            disabled={!autoSupported}
            className="flex items-center gap-1.5 text-gray-500 text-xs font-medium py-2 px-3 disabled:opacity-40"
            aria-label="자동재생 시작"
          >
            <PlayIcon size={14} />
            자동재생
          </button>
        </div>
      )}

      {/* 학습 완료 버튼 */}
      {words.length > 0 && (
        <div className="px-4 pb-8 pt-2">
          <button
            onClick={handleComplete}
            className="w-full py-4 rounded-lg bg-gray-900 text-white text-sm font-medium"
          >
            학습 완료
          </button>
        </div>
      )}
    </div>
  )
}
