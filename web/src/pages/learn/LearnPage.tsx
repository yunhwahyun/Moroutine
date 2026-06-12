import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTTS } from '@/hooks/useTTS'
import { renderLineBreaks } from '@/lib/text'
import { BackIcon, SpeakerIcon } from '@/components/icons'
import { STATUS_LABEL, STATUS_COLOR } from '@/lib/wordConstants'
import { createStudySession, completeStudySession } from '@/lib/studySession'
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

  const words: Word[] = sortWords(location.state?.words ?? [])
  const sessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (words.length === 0) return
    createStudySession({ sessionType: 'learn', wordbookIds: [], totalCount: words.length })
      .then((id) => { sessionIdRef.current = id })
      .catch(console.error)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleComplete = () => {
    if (sessionIdRef.current) {
      completeStudySession(sessionIdRef.current, words.length, 0).catch(console.error)
    }
    navigate(-1)
  }

  return (
    <div className="flex flex-col min-h-dvh bg-gray-50">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-white flex items-center justify-between px-4 py-3 border-b border-gray-100">
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
          <div key={word.id} className="bg-white rounded-2xl p-5 shadow-sm">
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
            {(word.description || word.example || word.memo) && (
              <div className="border-t border-gray-100 my-3" />
            )}

            {/* 설명 */}
            {word.description && (
              <p className="text-gray-400 text-xs leading-relaxed mb-2">
                {renderLineBreaks(word.description)}
              </p>
            )}

            {/* 예문 */}
            {word.example && (
              <p className="text-gray-400 text-xs italic leading-relaxed mb-2">
                <span className="not-italic text-gray-300 mr-1">예문</span>
                {word.example}
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
