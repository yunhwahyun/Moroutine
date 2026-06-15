import { create } from 'zustand'
import type { UserSettings } from '@/types'

export const DEFAULT_SETTINGS: UserSettings = {
  nickname: null,
  quizMode: 'multiple_choice',
  questionOrder: 'random',
  reviewIntervals: ['7d', '30d', '90d'],
  reviewPolicy: 'keep',
  scheduleNotification: true,
  reviewNotification: true,
  reviewNotificationTime: '09:00',
  shortAnswerInput: 'both',
}

interface SettingsState {
  settings: UserSettings
  isLoaded: boolean
  setSettings: (s: UserSettings) => void
  patchSettings: (partial: Partial<UserSettings>) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: DEFAULT_SETTINGS,
  isLoaded: false,
  setSettings: (s) => set({ settings: s, isLoaded: true }),
  patchSettings: (partial) =>
    set((state) => ({ settings: { ...state.settings, ...partial } })),
}))
