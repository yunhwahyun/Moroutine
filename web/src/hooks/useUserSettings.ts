import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useSettingsStore, DEFAULT_SETTINGS } from '@/stores/settingsStore'
import type { UserSettings } from '@/types'

// DB row → UserSettings
function rowToSettings(row: Record<string, unknown>): UserSettings {
  return {
    nickname: (row.nickname as string | null) ?? null,
    quizMode: (row.quiz_mode as UserSettings['quizMode']) ?? DEFAULT_SETTINGS.quizMode,
    questionOrder: (row.question_order as UserSettings['questionOrder']) ?? DEFAULT_SETTINGS.questionOrder,
    reviewIntervals: (row.review_intervals as string[]) ?? DEFAULT_SETTINGS.reviewIntervals,
    reviewPolicy: (row.review_policy as UserSettings['reviewPolicy']) ?? DEFAULT_SETTINGS.reviewPolicy,
    scheduleNotification: (row.schedule_notification as boolean) ?? DEFAULT_SETTINGS.scheduleNotification,
    reviewNotification: (row.review_notification as boolean) ?? DEFAULT_SETTINGS.reviewNotification,
    reviewNotificationTime: (row.review_notification_time as string) ?? DEFAULT_SETTINGS.reviewNotificationTime,
    shortAnswerInput: (row.short_answer_input as UserSettings['shortAnswerInput']) ?? DEFAULT_SETTINGS.shortAnswerInput,
  }
}

// UserSettings partial → DB columns
function settingsToRow(s: Partial<UserSettings>): Record<string, unknown> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('nickname' in s)               row.nickname = s.nickname
  if ('quizMode' in s)               row.quiz_mode = s.quizMode
  if ('questionOrder' in s)          row.question_order = s.questionOrder
  if ('reviewIntervals' in s)        row.review_intervals = s.reviewIntervals
  if ('reviewPolicy' in s)           row.review_policy = s.reviewPolicy
  if ('scheduleNotification' in s)   row.schedule_notification = s.scheduleNotification
  if ('reviewNotification' in s)     row.review_notification = s.reviewNotification
  if ('reviewNotificationTime' in s) row.review_notification_time = s.reviewNotificationTime
  if ('shortAnswerInput' in s)       row.short_answer_input = s.shortAnswerInput
  return row
}

// 앱 전체에서 한 번만 호출 (App.tsx > SettingsProvider)
export function useLoadSettings() {
  const { user } = useAuthStore()
  const { setSettings } = useSettingsStore()

  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        setSettings(data ? rowToSettings(data) : { ...DEFAULT_SETTINGS })
      })
  }, [user?.id, setSettings])
}

// 설정 화면에서 사용
export function useUserSettings() {
  const { user } = useAuthStore()
  const { settings, patchSettings } = useSettingsStore()

  const update = async (partial: Partial<UserSettings>) => {
    patchSettings(partial)  // 낙관적 업데이트
    if (!user) return
    const { error } = await supabase
      .from('profiles')
      .update(settingsToRow(partial))
      .eq('id', user.id)
    if (error) console.error('[settings update error]', error)
  }

  return { settings, update }
}
