import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

type MasterInvitation = {
  id: string
  email: string
  status: string
  expires_at: string
  created_at: string
}

type MasterEntry = {
  user_id: string
  email: string
  granted_at: string | null
  granted_by: string | null
}

async function fetchInvitations(): Promise<MasterInvitation[]> {
  const { data, error } = await supabase
    .from('master_invitations')
    .select('id, email, status, expires_at, created_at')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

async function fetchMasters(): Promise<MasterEntry[]> {
  const { data, error } = await supabase.rpc('list_masters')
  if (error) throw error
  return (data ?? []) as MasterEntry[]
}

// docs/ADMIN_DESIGN.md, docs/MASTER_INVITATION_DESIGN.md — Phase 20("/admin/** 라우트 + 전용 레이아웃")
// 이전의 최소 기능 placeholder(PricingPage와 같은 성격). 전용 레이아웃 없이 단독 페이지로 둔다.
export default function AdminMastersPage() {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [pendingAction, setPendingAction] = useState<string | null>(null)

  const invitationsQuery = useQuery({ queryKey: ['admin', 'master-invitations'], queryFn: fetchInvitations })
  const mastersQuery = useQuery({ queryKey: ['admin', 'masters'], queryFn: fetchMasters })

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'master-invitations'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'masters'] })
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviteError('')
    const trimmed = email.trim()
    if (!trimmed) return
    setPendingAction('invite')
    const { error } = await supabase.functions.invoke('master-invite', { body: { email: trimmed } })
    setPendingAction(null)
    if (error) {
      setInviteError(error.message)
      return
    }
    setEmail('')
    invalidateAll()
  }

  // 초대 메일 발송이 막혀 있을 때(SMTP 미설정 등)를 위한 대안 — 이미 가입된 사용자에 한해
  // 이메일 없이 즉시 Master 권한을 부여한다.
  const handleAddExisting = async () => {
    setInviteError('')
    const trimmed = email.trim()
    if (!trimmed) return
    setPendingAction('add-existing')
    const { error } = await supabase.functions.invoke('master-add-existing', { body: { email: trimmed } })
    setPendingAction(null)
    if (error) {
      setInviteError(error.message)
      return
    }
    setEmail('')
    invalidateAll()
  }

  const handleResend = async (invitationId: string) => {
    setPendingAction(invitationId)
    await supabase.functions.invoke('master-invite-resend', { body: { invitation_id: invitationId } })
    setPendingAction(null)
    invalidateAll()
  }

  const handleRevokeInvite = async (invitationId: string) => {
    setPendingAction(invitationId)
    await supabase.functions.invoke('master-invite-revoke', { body: { invitation_id: invitationId } })
    setPendingAction(null)
    invalidateAll()
  }

  const handleRevokeMaster = async (userId: string) => {
    if (!confirm('이 사용자의 Master 권한을 해제할까요?')) return
    setPendingAction(userId)
    await supabase.functions.invoke('master-revoke', { body: { userId } })
    setPendingAction(null)
    invalidateAll()
  }

  return (
    <div className="min-h-dvh bg-white px-6 py-8">
      <div className="max-w-lg mx-auto flex flex-col gap-8">
        <h1 className="text-lg font-bold text-gray-900">Master 관리</h1>

        <form onSubmit={handleInvite} className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">Master 초대</label>
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일"
              className="flex-1 border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-gray-400"
            />
            <button
              type="submit"
              disabled={pendingAction === 'invite'}
              className="px-4 py-3 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
            >
              초대
            </button>
          </div>
          <button
            type="button"
            onClick={handleAddExisting}
            disabled={pendingAction === 'add-existing' || !email.trim()}
            className="text-xs text-gray-600 border border-gray-200 rounded-lg px-4 py-2 self-start disabled:opacity-50"
          >
            이미 가입된 사용자라면 초대 메일 없이 즉시 추가
          </button>
          {inviteError && <p className="text-xs text-red-500">{inviteError}</p>}
        </form>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold text-gray-900">초대 목록</h2>
          {invitationsQuery.data?.length === 0 && <p className="text-xs text-gray-400">초대 내역이 없습니다.</p>}
          {invitationsQuery.data?.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center justify-between border border-gray-100 rounded-lg px-4 py-3"
            >
              <div className="flex flex-col">
                <span className="text-sm text-gray-900">{inv.email}</span>
                <span className="text-xs text-gray-400">
                  {inv.status} · 만료 {new Date(inv.expires_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex gap-2">
                {(inv.status === 'sent' || inv.status === 'expired') && (
                  <button
                    onClick={() => handleResend(inv.id)}
                    disabled={pendingAction === inv.id}
                    className="text-xs text-gray-600 border border-gray-200 rounded px-3 py-1.5 disabled:opacity-50"
                  >
                    재발송
                  </button>
                )}
                {(inv.status === 'pending' || inv.status === 'sent') && (
                  <button
                    onClick={() => handleRevokeInvite(inv.id)}
                    disabled={pendingAction === inv.id}
                    className="text-xs text-red-500 border border-red-200 rounded px-3 py-1.5 disabled:opacity-50"
                  >
                    취소
                  </button>
                )}
              </div>
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold text-gray-900">현재 Master</h2>
          {mastersQuery.data?.length === 0 && <p className="text-xs text-gray-400">Master가 없습니다.</p>}
          {mastersQuery.data?.map((m) => (
            <div
              key={m.user_id}
              className="flex items-center justify-between border border-gray-100 rounded-lg px-4 py-3"
            >
              <div className="flex flex-col">
                <span className="text-sm text-gray-900">{m.email}</span>
                {m.granted_at && (
                  <span className="text-xs text-gray-400">{new Date(m.granted_at).toLocaleDateString()} 부여</span>
                )}
              </div>
              <button
                onClick={() => handleRevokeMaster(m.user_id)}
                disabled={pendingAction === m.user_id}
                className="text-xs text-red-500 border border-red-200 rounded px-3 py-1.5 disabled:opacity-50"
              >
                권한 해제
              </button>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
