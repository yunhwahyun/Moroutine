import { useEffect } from 'react'
import { usePermissions } from '@/hooks/usePermissions'
import { seedSampleWordbooksForGuest } from '@/lib/sampleWordbookSeed'

// Guest 최초 진입 시 Admin이 지정한 샘플 공용 단어장을 로컬로 복사한다.
// App.tsx의 AuthProvider 안에서 한 번만 마운트한다(GuestMigrationGate 등과 동일한 패턴).
export default function SampleWordbookSeedGate() {
  const { permissions } = usePermissions()

  useEffect(() => {
    if (permissions?.serviceTier !== 'guest') return
    seedSampleWordbooksForGuest().catch((err) => console.error('[sample wordbook seed]', err))
  }, [permissions?.serviceTier])

  return null
}
