import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Quiz from '@/components/quiz/Quiz'
import { loadQuizProgress, saveQuizProgress, clearQuizProgress } from '@/lib/quizProgress'
import { applyQuizAnswer } from '@/lib/wordStatus'
import { createStudySession, completeStudySession, insertStudyResult } from '@/lib/studySession'
import { useSettingsStore } from '@/stores/settingsStore'
import type { QuizWord, SelectionTarget, SessionType, Word } from '@/types'

interface QuizPageState {
  targets?: SelectionTarget[]
  words?: QuizWord[]
  wordData?: Word[]  // 상태 업데이트용 전체 Word 데이터
}

function deriveSessionKey(targets?: SelectionTarget[]): string | null {
  if (!targets || targets.length === 0) return null
  const ids = targets
    .filter((t): t is { type: 'wordbook'; id: string } => t.type === 'wordbook')
    .map((t) => t.id)
    .sort()
  return ids.length > 0 ? `wb:${ids.join(',')}` : null
}

export default function QuizPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as QuizPageState | null

  const { settings } = useSettingsStore()
  const allWords = state?.words ?? []
  const sessionKey = deriveSessionKey(state?.targets)
  const sessionIdRef = useRef<string | null>(null)
  const wordDataMap = useMemo(() => {
    const map: Record<string, Word> = {}
    for (const w of state?.wordData ?? []) map[w.id] = w
    return map
  }, [state?.wordData])

  const savedProgress = useMemo(
    () => (sessionKey ? loadQuizProgress(sessionKey) : null),
    [sessionKey],
  )

  // 저장된 진행이 있고 일부 완료된 경우 이어하기 여부 물음
  const hasResumable = !!savedProgress && savedProgress.answeredIds.length > 0
  const [resumeChoice, setResumeChoice] = useState<'pending' | 'resume' | 'restart'>(
    hasResumable ? 'pending' : 'resume',
  )

  const activeWords = useMemo(() => {
    if (resumeChoice === 'resume' && savedProgress) {
      const done = new Set(savedProgress.answeredIds)
      const remaining = savedProgress.allWords.filter((w) => !done.has(w.id))
      return remaining.length > 0 ? remaining : allWords
    }
    return allWords
  }, [resumeChoice, savedProgress, allWords])

  // 세션 전체 단어 목록: 이어하기면 저장된 allWords 사용, 아니면 현재 allWords
  const sessionAllWords = resumeChoice === 'resume' && savedProgress
    ? savedProgress.allWords
    : allWords

  // resumeChoice가 확정되면 study_session 생성
  useEffect(() => {
    if (resumeChoice === 'pending') return
    const totalCount =
      resumeChoice === 'resume' && savedProgress
        ? (savedProgress.allWords.filter((w) => !savedProgress.answeredIds.includes(w.id)).length ||
          allWords.length)
        : allWords.length
    if (totalCount === 0) return
    const sessionType: SessionType =
      state?.targets?.some((t) => t.type === 'review') ? 'review_quiz' : 'quiz'
    const wordbookIds = (state?.targets ?? [])
      .filter((t): t is { type: 'wordbook'; id: string } => t.type === 'wordbook')
      .map((t) => t.id)
    createStudySession({ sessionType, wordbookIds, totalCount })
      .then((id) => { sessionIdRef.current = id })
      .catch(console.error)
  }, [resumeChoice]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleWordAnswered = useCallback(
    (wordId: string, isCorrect: boolean) => {
      // DB 상태 업데이트 (fire-and-forget)
      const word = wordDataMap[wordId]
      if (word) applyQuizAnswer(word, isCorrect, {
        reviewIntervals: settings.reviewIntervals,
        reviewPolicy: settings.reviewPolicy,
      }).catch(console.error)

      // study_results 로깅
      if (sessionIdRef.current) {
        insertStudyResult(sessionIdRef.current, wordId, isCorrect).catch(console.error)
      }

      // localStorage 진행 상태 저장
      if (!sessionKey) return
      const prev = loadQuizProgress(sessionKey)
      const base = prev ?? {
        sessionKey,
        allWords: sessionAllWords,
        answeredIds: [] as string[],
        wrongIds: [] as string[],
        timestamp: Date.now(),
      }
      saveQuizProgress({
        ...base,
        answeredIds: [...new Set([...base.answeredIds, wordId])],
        wrongIds: isCorrect
          ? base.wrongIds
          : [...new Set([...base.wrongIds, wordId])],
        timestamp: Date.now(),
      })
    },
    [wordDataMap, sessionKey, sessionAllWords, settings.reviewIntervals, settings.reviewPolicy],
  )

  const handleComplete = (correctCount: number, total: number) => {
    if (sessionKey) clearQuizProgress()
    if (sessionIdRef.current) {
      completeStudySession(sessionIdRef.current, correctCount, total - correctCount).catch(console.error)
    }
    navigate('/quiz/complete', { state: { correctCount, total } })
  }

  const handleClose = () => navigate(-1)

  // 이어하기 선택 화면
  if (resumeChoice === 'pending' && savedProgress) {
    const done = savedProgress.answeredIds.length
    const total = savedProgress.allWords.length
    const remaining = total - done
    return (
      <div className="flex flex-col min-h-dvh bg-white items-center justify-center px-6 gap-6">
        <div className="text-center">
          <p className="text-lg font-bold text-gray-900 mb-1">이전 퀴즈가 있어요</p>
          <p className="text-sm text-gray-400">
            {done}/{total}개 완료 · 남은 문제 {remaining}개
          </p>
        </div>
        <div className="w-full flex flex-col gap-3">
          <button
            onClick={() => setResumeChoice('resume')}
            className="w-full py-4 rounded-lg bg-gray-900 text-white text-sm font-medium"
          >
            이어서 풀기
          </button>
          <button
            onClick={() => { clearQuizProgress(); setResumeChoice('restart') }}
            className="w-full py-4 rounded-lg border border-gray-200 text-gray-600 text-sm"
          >
            처음부터
          </button>
          <button
            onClick={() => navigate(-1)}
            className="w-full py-4 rounded-lg text-gray-400 text-sm"
          >
            취소
          </button>
        </div>
      </div>
    )
  }

  const quizWords = activeWords.length > 0 ? activeWords : allWords
  return (
    <Quiz
      words={quizWords}
      initialMode={settings.quizMode}
      onComplete={handleComplete}
      onClose={handleClose}
      onWordAnswered={handleWordAnswered}
    />
  )
}
