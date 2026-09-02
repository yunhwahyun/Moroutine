import { useEffect } from 'react'
import { usePermissions } from '@/hooks/usePermissions'
import { seedAdminSettingsForGuest } from '@/lib/settingsSeed'

// Guest 최초 진입 시 Admin이 저장해 둔 설정값을 로컬 기본값으로 복사한다.
// App.tsx의 AuthProvider 안에서 SampleWordbookSeedGate와 나란히 한 번만 마운트한다.
export default function SettingsSeedGate() {
  const { permissions } = usePermissions()

  useEffect(() => {
    if (permissions?.serviceTier !== 'guest') return
    seedAdminSettingsForGuest().catch((err) => console.error('[settings seed]', err))
  }, [permissions?.serviceTier])

  return null
}
