import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { usePermissions } from '@/hooks/usePermissions'
import { useGuestMigration } from '@/hooks/useGuestMigration'
import { isAuthGateExemptPath } from '@/lib/authGateExemptPaths'
import GuestMigrationModal from './GuestMigrationModal'

const DISMISS_KEY = 'moroutine_migration_prompt_dismissed'

// docs/MIGRATION_DESIGN.md §2 — 로그인 사용자의 serviceTier가 pro/master로 확인되고
// 이 기기에 로컬(Guest) 데이터가 남아있으면 전환 확인 모달을 띄운다.
// App.tsx의 AuthProvider 안에서 한 번만 마운트한다.
// /reset-password 등에서는 뜨면 안 된다(2026-09-12 QA 발견) — DowngradeGate와 동일한 이유로
// web/src/lib/authGateExemptPaths.ts를 공유한다.
export default function GuestMigrationGate() {
  const { permissions } = usePermissions()
  const { summary, progress, checkLocalData, start, deleteLocalData, reset } = useGuestMigration()
  const [dismissed, setDismissed] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    const tier = permissions?.serviceTier
    if (!tier || (tier !== 'pro' && tier !== 'master')) return
    if (sessionStorage.getItem(DISMISS_KEY)) return
    checkLocalData().catch((err) => console.error('[guest migration] summary check failed', err))
  }, [permissions?.serviceTier, checkLocalData])

  if (!summary || !summary.hasAnyData || dismissed || isAuthGateExemptPath(pathname)) return null

  const handleClose = () => {
    sessionStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
    reset()
  }

  // "새로 시작"이 아니라 "저장 데이터 지우기" — 계정 이전 없이 이 기기의 로컬 데이터를 바로 지운다.
  // 지운 뒤에는 hasAnyData가 다시 false가 되므로(세션이 아니라 실제 데이터 유무로 판정) 다음에 앱을
  // 열어도 이 모달이 다시 뜨지 않는다(2026-09-11 — 예전엔 그냥 닫기만 해서 데이터가 남아있었고,
  // sessionStorage 표시도 앱 재시작(WebView 세션 갱신)마다 사라져 매번 다시 떴었다).
  const handleDeleteLocal = () => {
    deleteLocalData()
      .catch((err) => console.error('[guest migration] local cleanup failed', err))
      .finally(handleClose)
  }

  // "계정으로 이전"은 이전 성공 후 "기기에 남길지" 다시 묻지 않고 바로 로컬 데이터를 지운다 — 어떤
  // 버튼을 눌러도 결국 팝업이 닫히는 흐름으로 단순화(2026-09-11). 실패하면(phase==='failed') 로컬
  // 데이터는 그대로 보존되고, 모달은 GuestMigrationModal의 "다시 시도"/"나중에 다시 하기"로 넘어간다.
  const handleStart = () => {
    start()
      .then((result) => {
        if (result.success) return handleDeleteLocal()
      })
      .catch((err) => console.error('[guest migration]', err))
  }

  return (
    <GuestMigrationModal
      summary={summary}
      progress={progress}
      onStart={handleStart}
      onDeleteLocal={handleDeleteLocal}
      onClose={handleClose}
    />
  )
}
