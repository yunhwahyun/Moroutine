import type { QuizWord } from '@/types'

export type QuizProgress = {
  sessionKey: string
  allWords: QuizWord[]
  answeredIds: string[]  // 최종 답변 완료된 word ID
  wrongIds: string[]     // 오답 처리된 word ID
  timestamp: number
}

const STORAGE_KEY = 'moroutine_quiz_progress'
const TTL_MS = 24 * 60 * 60 * 1000  // 24시간

export function saveQuizProgress(p: QuizProgress) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)) } catch {}
}

export function loadQuizProgress(sessionKey: string): QuizProgress | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as QuizProgress
    if (p.sessionKey !== sessionKey) return null
    if (Date.now() - p.timestamp > TTL_MS) { clearQuizProgress(); return null }
    return p
  } catch { return null }
}

export function clearQuizProgress() {
  try { localStorage.removeItem(STORAGE_KEY) } catch {}
}
