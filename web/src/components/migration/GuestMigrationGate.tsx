import { useEffect, useState } from 'react'
import { usePermissions } from '@/hooks/usePermissions'
import { useGuestMigration } from '@/hooks/useGuestMigration'
import GuestMigrationModal from './GuestMigrationModal'

const DISMISS_KEY = 'moroutine_migration_prompt_dismissed'

// docs/MIGRATION_DESIGN.md §2 — 로그인 사용자의 serviceTier가 pro/premium/master로 확인되고
// 이 기기에 로컬(Guest) 데이터가 남아있으면 전환 확인 모달을 띄운다.
// App.tsx의 AuthProvider 안에서 한 번만 마운트한다.
export default function GuestMigrationGate() {
  const { permissions } = usePermissions()
  const { summary, progress, checkLocalData, start, deleteLocalData, reset } = useGuestMigration()
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const tier = permissions?.serviceTier
    if (!tier || (tier !== 'pro' && tier !== 'premium' && tier !== 'master')) return
    if (sessionStorage.getItem(DISMISS_KEY)) return
    checkLocalData().catch((err) => console.error('[guest migration] summary check failed', err))
  }, [permissions?.serviceTier, checkLocalData])

  if (!summary || !summary.hasAnyData || dismissed) return null

  const handleClose = () => {
    sessionStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
    reset()
  }

  const handleDeleteLocal = () => {
    deleteLocalData()
      .catch((err) => console.error('[guest migration] local cleanup failed', err))
      .finally(handleClose)
  }

  return (
    <GuestMigrationModal
      summary={summary}
      progress={progress}
      onStart={() => start().catch((err) => console.error('[guest migration]', err))}
      onDeleteLocal={handleDeleteLocal}
      onClose={handleClose}
    />
  )
}
