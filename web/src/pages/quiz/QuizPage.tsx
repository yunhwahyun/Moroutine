import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import Quiz from '@/components/quiz/Quiz'
import { loadQuizProgress, saveQuizProgress, clearQuizProgress } from '@/lib/quizProgress'
import { applyQuizAnswer } from '@/lib/wordStatus'
import { applyPublicQuizAnswer } from '@/lib/publicWordbooks'
import { usePermissions } from '@/hooks/usePermissions'
import { useAuthStore } from '@/stores/authStore'
import { getRepository } from '@/repositories/factory'
import { useSettingsStore } from '@/stores/settingsStore'
import type { QuizWord, SelectionTarget, SessionType, Word } from '@/types'

interface QuizPageState {
  targets?: SelectionTarget[]
  words?: QuizWord[]
  wordData?: Word[]  // 상태 업데이트용 전체 Word 데이터
}

// docs/DECISION_LOG.md 2026-07-19 — 공용 단어장 퀴즈는 개인 wb: 키와 충돌하지 않도록 pwb: 접두어 사용.
function deriveSessionKey(targets?: SelectionTarget[]): string | null {
  if (!targets || targets.length === 0) return null
  const publicWordbookId = targets.find((t) => t.type === 'public_wordbook')?.id
  if (publicWordbookId) return `pwb:${publicWordbookId}`
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
  const { permissions } = usePermissions()
  const { user } = useAuthStore()
  const tier = permissions?.serviceTier ?? null
  const repository = tier && tier !== 'admin' ? getRepository(tier) : null
  const publicWordbookId = state?.targets?.find((t) => t.type === 'public_wordbook')?.id ?? null
  const isPublicMode = !!publicWordbookId
  const allWords = state?.words ?? []
  const sessionKey = deriveSessionKey(state?.targets)
  const sessionIdRef = useRef<string | null>(null)
  const sessionCreatedRef = useRef(false)  // React StrictMode 개발 모드 이중 마운트로 세션이 중복 생성되는 것 방지
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

  // resumeChoice가 확정되면 study_session 생성. 공용 단어장 퀴즈는 개인 study_sessions에 기록하지
  // 않는다(docs/DECISION_LOG.md 2026-07-19 — FK가 개인 words(id)를 참조해 애초에 불가능하고, 진행
  // 상태는 user_public_word_progress에 별도 저장).
  useEffect(() => {
    if (resumeChoice === 'pending' || !repository || sessionCreatedRef.current || isPublicMode) return
    sessionCreatedRef.current = true
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
    repository
      .createStudySession({ sessionType, wordbookIds, totalCount })
      .then((id) => { sessionIdRef.current = id })
      .catch(console.error)
  }, [resumeChoice, repository]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleWordAnswered = useCallback(
    (wordId: string, isCorrect: boolean) => {
      // DB/로컬 상태 업데이트 (fire-and-forget)
      const word = wordDataMap[wordId]
      if (isPublicMode) {
        if (word && user) {
          applyPublicQuizAnswer(user.id, wordId, word, isCorrect, {
            reviewIntervals: settings.reviewIntervals,
            reviewPolicy: settings.reviewPolicy,
          }).catch(console.error)
        }
        // 공용 단어장은 개인 study_results에 기록하지 않는다(위 세션 생성 주석 참고) — sessionIdRef가
        // 애초에 채워지지 않으므로 아래 블록은 자연히 스킵된다.
      } else if (repository) {
        if (word) applyQuizAnswer(repository, word, isCorrect, {
          reviewIntervals: settings.reviewIntervals,
          reviewPolicy: settings.reviewPolicy,
        }).catch(console.error)

        // study_results 로깅
        if (sessionIdRef.current) {
          repository
            .saveStudyResult({ sessionId: sessionIdRef.current, wordId, isCorrect })
            .catch(console.error)
        }
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
    [
      repository, wordDataMap, sessionKey, sessionAllWords,
      settings.reviewIntervals, settings.reviewPolicy, isPublicMode, user,
    ],
  )

  const handleComplete = (correctCount: number, total: number) => {
    if (sessionKey) clearQuizProgress()
    if (sessionIdRef.current && repository) {
      repository
        .completeStudySession(sessionIdRef.current, correctCount, total - correctCount)
        .catch(console.error)
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
      <div className="flex flex-col min-h-dvh bg-white items-center justify-center px-6 gap-6" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
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
