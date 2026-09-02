import { supabase } from '@/lib/supabase'
import { localDB } from '@/repositories/local/schema'
import { localDataRepository } from '@/repositories/local/LocalDataRepository'
import { settingsRowToUserSettings } from '@/repositories/remote/RemoteDataRepository'
import { useSettingsStore } from '@/stores/settingsStore'

const SEEDED_META_KEY = 'admin_settings_seeded'

// docs/DATA_STORAGE_DESIGN.md — sampleWordbookSeed.ts와 동일한 패턴. 관리자가 저장해 둔 설정값을
// 게스트의 로컬(IndexedDB)에 기기당 1회만 복사해 기본값으로 삼는다(신규 가입자에게는 handle_new_user()
// 트리거가 같은 역할을 한다). 네트워크 실패 시에는 플래그를 세우지 않아 다음 앱 진입 때 재시도한다.
export async function seedAdminSettingsForGuest(): Promise<void> {
  const already = await localDB.meta.get(SEEDED_META_KEY)
  if (already) return

  const { data, error } = await supabase.rpc('get_admin_default_settings')
  if (error) throw error

  if (data) {
    const settings = settingsRowToUserSettings(data as Record<string, unknown>)
    await localDataRepository.saveSettings(settings)
    useSettingsStore.getState().setSettings(settings)
  }

  await localDB.meta.put({ key: SEEDED_META_KEY, value: true })
}
