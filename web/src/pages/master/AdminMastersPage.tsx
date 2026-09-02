import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Section, Row } from '@/components/ui/SettingsList'

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

// docs/ADMIN_DESIGN.md, docs/MASTER_INVITATION_DESIGN.md — SettingsPage.tsx의 Section/Row 톤과
// 통일(사용자·관리자 디자인 통일감, 2026-09-02).
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

  // 기본 동작 — 이미 가입된 사용자에 한해 이메일 없이 즉시 Master 권한을 부여한다.
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

  // 보조 동작 — 신규(미가입) 이메일에 초대 메일을 발송한다.
  const handleInvite = async () => {
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
    <div className="flex flex-col min-h-full bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white flex items-center justify-between px-4 pt-6 pb-4 border-b border-gray-100">
        <h1 className="text-lg font-bold text-gray-900">Master 관리</h1>
      </div>

      <div className="flex-1 overflow-y-auto pb-8">
        <Section title="Master 추가 (이미 가입된 사용자)">
          <Row label="이메일">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일"
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-gray-400 w-40"
            />
          </Row>
          <button
            onClick={handleAddExisting}
            disabled={pendingAction === 'add-existing' || !email.trim()}
            className="w-full flex items-center px-4 py-3.5 min-h-[52px] disabled:opacity-50"
          >
            <span className="text-sm text-gray-900 font-medium">
              {pendingAction === 'add-existing' ? '추가 중...' : '추가'}
            </span>
          </button>
          <button
            onClick={handleInvite}
            disabled={pendingAction === 'invite' || !email.trim()}
            className="w-full flex items-center px-4 py-3.5 min-h-[52px] disabled:opacity-50"
          >
            <span className="text-sm text-gray-800">
              {pendingAction === 'invite' ? '발송 중...' : '초대 메일 보내기'}
            </span>
          </button>
          {inviteError && (
            <div className="px-4 py-3">
              <p className="text-xs text-red-500">{inviteError}</p>
            </div>
          )}
        </Section>

        <Section title="초대 목록">
          {invitationsQuery.data?.length === 0 && (
            <div className="px-4 py-3.5">
              <p className="text-xs text-gray-400">초대 내역이 없습니다.</p>
            </div>
          )}
          {invitationsQuery.data?.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between px-4 py-3.5 min-h-[52px]">
              <div className="flex flex-col">
                <span className="text-sm text-gray-800">{inv.email}</span>
                <span className="text-xs text-gray-400">
                  {inv.status} · 만료 {new Date(inv.expires_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex gap-2 shrink-0">
                {(inv.status === 'sent' || inv.status === 'expired') && (
                  <button
                    onClick={() => handleResend(inv.id)}
                    disabled={pendingAction === inv.id}
                    className="text-xs text-gray-600 border border-gray-200 rounded-md px-3 py-1.5 disabled:opacity-50"
                  >
                    재발송
                  </button>
                )}
                {(inv.status === 'pending' || inv.status === 'sent') && (
                  <button
                    onClick={() => handleRevokeInvite(inv.id)}
                    disabled={pendingAction === inv.id}
                    className="text-xs text-red-500 border border-red-200 rounded-md px-3 py-1.5 disabled:opacity-50"
                  >
                    취소
                  </button>
                )}
              </div>
            </div>
          ))}
        </Section>

        <Section title="현재 Master">
          {mastersQuery.data?.length === 0 && (
            <div className="px-4 py-3.5">
              <p className="text-xs text-gray-400">Master가 없습니다.</p>
            </div>
          )}
          {mastersQuery.data?.map((m) => (
            <div key={m.user_id} className="flex items-center justify-between px-4 py-3.5 min-h-[52px]">
              <div className="flex flex-col">
                <span className="text-sm text-gray-800">{m.email}</span>
                {m.granted_at && (
                  <span className="text-xs text-gray-400">{new Date(m.granted_at).toLocaleDateString()} 부여</span>
                )}
              </div>
              <button
                onClick={() => handleRevokeMaster(m.user_id)}
                disabled={pendingAction === m.user_id}
                className="text-xs text-red-500 border border-red-200 rounded-md px-3 py-1.5 disabled:opacity-50 shrink-0"
              >
                권한 해제
              </button>
            </div>
          ))}
        </Section>
      </div>
    </div>
  )
}
