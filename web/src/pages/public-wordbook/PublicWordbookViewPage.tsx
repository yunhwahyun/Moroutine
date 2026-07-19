import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getPublicWordbook, getPublicWords, getPublicWordProgressMap, toStudyWord } from '@/lib/publicWordbooks'
import { applyQuestionOrder, buildQuizWords } from '@/hooks/useStudyWords'
import { usePermissions } from '@/hooks/usePermissions'
import { useAuthStore } from '@/stores/authStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { BackIcon } from '@/components/icons'
import Spinner from '@/components/ui/Spinner'

// 원본 참조 방식(docs/ADMIN_DESIGN.md §3-1) — 읽기 전용, 수정/삭제 UI 없음.
// 학습하기/퀴즈는 개인 words와 스키마가 달라 toStudyWord() 어댑터로 Word 형태로 변환해 진입한다
// (docs/DECISION_LOG.md 2026-07-19).
export default function PublicWordbookViewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { permissions } = usePermissions()
  const { settings } = useSettingsStore()
  const [isPreparing, setIsPreparing] = useState<'learn' | 'quiz' | null>(null)

  const { data: wordbook } = useQuery({
    queryKey: ['public-wordbook', id],
    queryFn: () => getPublicWordbook(id!),
    enabled: !!id,
  })

  const { data: words = [], isLoading } = useQuery({
    queryKey: ['public-words', id],
    queryFn: () => getPublicWords(id!),
    enabled: !!id,
  })

  const canUse = permissions?.canUsePublicWordbooks ?? false

  const prepareStudyWords = async () => {
    const progressMap = await getPublicWordProgressMap(user!.id, words.map((w) => w.id))
    const studyWords = words.map((w) => toStudyWord(w, progressMap.get(w.id), user!.id))
    return applyQuestionOrder(studyWords, settings.questionOrder)
  }

  const handleLearn = async () => {
    if (!id || !user || words.length === 0) return
    setIsPreparing('learn')
    try {
      const ordered = await prepareStudyWords()
      navigate('/learn', { state: { targets: [{ type: 'public_wordbook', id }], words: ordered } })
    } catch (err) {
      console.error('[public wordbook learn error]', err)
    } finally {
      setIsPreparing(null)
    }
  }

  const handleQuiz = async () => {
    if (!id || !user || words.length === 0) return
    setIsPreparing('quiz')
    try {
      const ordered = await prepareStudyWords()
      navigate('/quiz', {
        state: { targets: [{ type: 'public_wordbook', id }], words: buildQuizWords(ordered), wordData: ordered },
      })
    } catch (err) {
      console.error('[public wordbook quiz error]', err)
    } finally {
      setIsPreparing(null)
    }
  }

  if (!canUse) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 gap-3 text-center">
        <p className="text-sm font-semibold text-gray-900">Pro/Premium/Master 전용 기능입니다</p>
        <p className="text-xs text-gray-400">공용 단어장은 요금제를 업그레이드하면 이용할 수 있어요.</p>
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
          {wordbook?.title ?? '공용 단어장'}
        </h1>
        <div className="w-6" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 pb-6">
        {isLoading && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}

        {!isLoading && words.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-16">등록된 단어가 없습니다</p>
        )}

        {words.map((word, i) => (
          <div key={word.id} className="bg-white rounded-2xl p-4 shadow-sm">
            <span className="text-xs text-gray-300 mr-1.5">{i + 1}</span>
            <span className="text-base font-bold text-gray-900">{word.term}</span>
            <p className="text-gray-600 text-sm mt-1.5 leading-relaxed">{word.definition}</p>
            {word.description && <p className="text-gray-400 text-xs mt-1.5 leading-relaxed">{word.description}</p>}
          </div>
        ))}
      </div>

      {words.length > 0 && (
        <div className="px-4 pb-8 pt-2 flex gap-2">
          <button
            onClick={handleLearn}
            disabled={!!isPreparing}
            className="flex-1 py-3.5 rounded-lg border border-gray-200 text-sm text-gray-700 font-medium disabled:opacity-50"
          >
            {isPreparing === 'learn' ? '준비 중...' : '학습하기'}
          </button>
          <button
            onClick={handleQuiz}
            disabled={!!isPreparing}
            className="flex-1 py-3.5 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
          >
            {isPreparing === 'quiz' ? '준비 중...' : '퀴즈 풀기'}
          </button>
        </div>
      )}
    </div>
  )
}
