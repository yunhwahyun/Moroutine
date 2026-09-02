import { useEffect } from 'react'
import { useSettingsStore } from '@/stores/settingsStore'
import { usePermissions } from '@/hooks/usePermissions'
import { getRepository } from '@/repositories/factory'
import { remoteDataRepository } from '@/repositories/remote/RemoteDataRepository'
import type { DataRepository } from '@/repositories/types'
import type { ServiceTier, UserSettings } from '@/types'

// docs/DATA_STORAGE_DESIGN.md §6 — Guest는 LocalDataRepository(IndexedDB), 그 외는 RemoteDataRepository(profiles
// 테이블)로 설정을 읽고 쓴다. snake_case↔camelCase 매핑은 각 Repository 구현체 내부 책임(이 훅은 모른다).
// Admin은 getRepository()가 throw하므로(docs/ADMIN_DESIGN.md — 단어장/일정 등 개인 학습 기능은 여전히
// 미제공), 설정 화면에 한해서만 같은 profiles 테이블을 쓰는 remoteDataRepository를 직접 사용한다.
function settingsRepositoryFor(tier: ServiceTier): DataRepository {
  return tier === 'admin' ? remoteDataRepository : getRepository(tier)
}

// 앱 전체에서 한 번만 호출 (App.tsx > AuthProvider)
export function useLoadSettings() {
  const { permissions } = usePermissions()
  const tier = permissions?.serviceTier ?? null
  const { setSettings } = useSettingsStore()

  useEffect(() => {
    if (!tier) return
    settingsRepositoryFor(tier)
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
    if (!tier) return
    try {
      await settingsRepositoryFor(tier).saveSettings(partial)
    } catch (err) {
      console.error('[settings update error]', err)
    }
  }

  return { settings, update }
}
