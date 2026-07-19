import { useEffect } from 'react'
import { useSettingsStore, DEFAULT_SETTINGS } from '@/stores/settingsStore'
import { usePermissions } from '@/hooks/usePermissions'
import { getRepository } from '@/repositories/factory'
import type { UserSettings } from '@/types'

// docs/DATA_STORAGE_DESIGN.md §6 — Guest는 LocalDataRepository(IndexedDB), 그 외는 RemoteDataRepository(profiles
// 테이블)로 설정을 읽고 쓴다. snake_case↔camelCase 매핑은 각 Repository 구현체 내부 책임(이 훅은 모른다).
// Admin은 §8 결정 필요 항목(일반 학습 기능 사용 여부) 확정 전까지 기본 설정만 사용하고 영구 저장하지 않는다.

// 앱 전체에서 한 번만 호출 (App.tsx > AuthProvider)
export function useLoadSettings() {
  const { permissions } = usePermissions()
  const tier = permissions?.serviceTier ?? null
  const { setSettings } = useSettingsStore()

  useEffect(() => {
    if (!tier) return
    if (tier === 'admin') {
      setSettings({ ...DEFAULT_SETTINGS })
      return
    }
    getRepository(tier)
      .getSettings()
      .then(setSettings)
      .catch((err) => console.error('[settings load error]', err))
  }, [tier, setSettings])
}

// 설정 화면에서 사용
export function useUserSettings() {
  const { permissions } = usePermissions()
  const tier = permissions?.serviceTier ?? null
  const { settings, patchSettings } = useSettingsStore()

  const update = async (partial: Partial<UserSettings>) => {
    patchSettings(partial)  // 낙관적 업데이트
    if (!tier || tier === 'admin') return
    try {
      await getRepository(tier).saveSettings(partial)
    } catch (err) {
      console.error('[settings update error]', err)
    }
  }

  return { settings, update }
}
