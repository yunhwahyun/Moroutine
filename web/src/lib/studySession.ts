import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { SessionType } from '@/types'

export async function createStudySession(params: {
  sessionType: SessionType
  wordbookIds: string[]
  totalCount: number
}): Promise<string | null> {
  const userId = useAuthStore.getState().user?.id
  if (!userId || params.totalCount === 0) return null
  const { data, error } = await supabase
    .from('study_sessions')
    .insert({
      user_id: userId,
      session_type: params.sessionType,
      wordbook_ids: params.wordbookIds.length > 0 ? params.wordbookIds : null,
      total_count: params.totalCount,
    })
    .select('id')
    .single()
  if (error) { console.error('[session create error]', error); return null }
  return data.id
}

export async function completeStudySession(
  sessionId: string,
  correctCount: number,
  wrongCount: number,
): Promise<void> {
  const { error } = await supabase
    .from('study_sessions')
    .update({
      completed_at: new Date().toISOString(),
      correct_count: correctCount,
      wrong_count: wrongCount,
    })
    .eq('id', sessionId)
  if (error) console.error('[session complete error]', error)
}

export async function insertStudyResult(
  sessionId: string,
  wordId: string,
  isCorrect: boolean,
): Promise<void> {
  const userId = useAuthStore.getState().user?.id
  if (!userId) return
  const { error } = await supabase
    .from('study_results')
    .insert({ session_id: sessionId, word_id: wordId, user_id: userId, is_correct: isCorrect })
  if (error) console.error('[study result error]', error)
}
