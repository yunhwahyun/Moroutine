// Master 초대 수락 — docs/MASTER_INVITATION_DESIGN.md §4-3, §2~§4 편차(2026-07-18) 참고.
// 자체 토큰 대신 호출자의 세션(Authorization 헤더)에서 이메일을 뽑아 master_invitations와 대조한다.
//
// docs/launch/PHASE1_POLICY.md §4, §5 — 이용약관 동의 / 만 14세 이상 자격확인은 클라이언트
// 체크박스만으로 끝내지 않고 서버에서 다시 검증한다. body: { agreedTerms: true, agreedAge: true,
// policyVersion: string } 세 값이 전부 갖춰져야 진행하며, 통과하면 user_policy_agreements에
// terms/age_eligibility 두 행을 기록한다.
const POLICY_VERSION_FALLBACK = 'phase1-v1' // TODO: docs/legal/*_PHASE1.md 시행일 확정되면 버전 문자열 갱신

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts'
import { createServiceClient, getCallerUser } from '../_shared/auth.ts'

Deno.serve(async (req: Request) => {
  try {
    return await handle(req)
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    return new Response(msg, { status: 500, headers: corsHeaders })
  }
})

async function handle(req: Request): Promise<Response> {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405, headers: corsHeaders })
  }

  let body: { agreedTerms?: boolean; agreedAge?: boolean; policyVersion?: string }
  try {
    body = await req.json()
  } catch {
    return new Response('invalid json', { status: 400, headers: corsHeaders })
  }
  if (body.agreedTerms !== true || body.agreedAge !== true) {
    return new Response('이용약관 동의와 만 14세 이상 확인이 모두 필요합니다.', {
      status: 400,
      headers: corsHeaders,
    })
  }
  const policyVersion =
    typeof body.policyVersion === 'string' && body.policyVersion.trim() !== ''
      ? body.policyVersion
      : POLICY_VERSION_FALLBACK

  const serviceClient = createServiceClient()
  const caller = await getCallerUser(req)
  if (!caller) {
    return new Response('unauthorized', { status: 401, headers: corsHeaders })
  }

  const { data: invitation, error: findError } = await serviceClient
    .from('master_invitations')
    .select('*')
    .eq('email', caller.email)
    .in('status', ['pending', 'sent'])
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (findError) {
    return new Response(findError.message, { status: 500, headers: corsHeaders })
  }
  if (!invitation) {
    return new Response('초대 내역을 찾을 수 없거나 만료되었습니다.', { status: 404, headers: corsHeaders })
  }

  const { error: profileError } = await serviceClient
    .from('profiles')
    .update({
      special_access: 'master',
      special_access_granted_at: new Date().toISOString(),
      special_access_granted_by: invitation.invited_by,
      special_access_revoked_at: null,
    })
    .eq('id', caller.id)
  if (profileError) {
    return new Response(profileError.message, { status: 500, headers: corsHeaders })
  }

  await serviceClient
    .from('master_invitations')
    .update({ status: 'accepted', accepted_at: new Date().toISOString(), accepted_user_id: caller.id })
    .eq('id', invitation.id)

  const { error: agreementError } = await serviceClient.from('user_policy_agreements').insert([
    { user_id: caller.id, agreement_type: 'terms', policy_version: policyVersion },
    { user_id: caller.id, agreement_type: 'age_eligibility', policy_version: policyVersion },
  ])
  if (agreementError) {
    return new Response(agreementError.message, { status: 500, headers: corsHeaders })
  }

  // docs/DATA_RETENTION_DESIGN.md §2 — 3개월 이내 Master 재지정 시 대기 중인 삭제 스케줄을 취소한다.
  await serviceClient
    .from('retention_schedules')
    .update({ status: 'canceled' })
    .eq('user_id', caller.id)
    .eq('status', 'active')

  await serviceClient.from('admin_audit_log').insert({
    actor_id: caller.id,
    action: 'master_accepted',
    target_type: 'master_invitation',
    target_id: invitation.id,
    detail: { email: caller.email, invited_by: invitation.invited_by },
  })

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
