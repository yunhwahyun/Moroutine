// Master 초대 수락 — docs/MASTER_INVITATION_DESIGN.md §4-3 참고.
// 2026-09-12 — 세션 기반(2026-07-18 편차)에서 자체 토큰 방식으로 복귀. 이제 이 함수 호출 시점에는
// 세션이 전혀 없다(초대 이메일 링크는 우리 도메인의 ?token=... 링크일 뿐, Supabase 인증을 거치지
// 않는다) — 그래서 계정(auth.users) 자체를 여기서 처음 생성한다. 토큰이 유효할 때만, 그리고
// 이용약관 동의/만 14세 확인이 모두 true일 때만 진행한다(docs/launch/PHASE1_POLICY.md §4, §5).
const POLICY_VERSION_FALLBACK = 'phase1-v1' // TODO: docs/legal/*_PHASE1.md 시행일 확정되면 버전 문자열 갱신

import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts'
import { createServiceClient } from '../_shared/auth.ts'
import { hashInviteToken } from '../_shared/masterInvite.ts'

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

  let body: { token?: string; password?: string; agreedTerms?: boolean; agreedAge?: boolean; policyVersion?: string }
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
  const token = body.token?.trim()
  if (!token) {
    return new Response('초대 링크가 올바르지 않습니다.', { status: 400, headers: corsHeaders })
  }
  const password = body.password ?? ''
  if (password.length < 6) {
    return new Response('비밀번호는 6자 이상이어야 합니다.', { status: 400, headers: corsHeaders })
  }
  const policyVersion =
    typeof body.policyVersion === 'string' && body.policyVersion.trim() !== ''
      ? body.policyVersion
      : POLICY_VERSION_FALLBACK

  const serviceClient = createServiceClient()
  const tokenHash = await hashInviteToken(token)

  const { data: invitation, error: findError } = await serviceClient
    .from('master_invitations')
    .select('*')
    .eq('token_hash', tokenHash)
    .eq('status', 'sent')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (findError) {
    return new Response(findError.message, { status: 500, headers: corsHeaders })
  }
  if (!invitation) {
    return new Response('초대 링크가 유효하지 않거나 만료되었습니다.', { status: 404, headers: corsHeaders })
  }

  const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
    email: invitation.email,
    password,
    email_confirm: true,
  })
  if (createError || !created.user) {
    return new Response(createError?.message ?? '계정 생성에 실패했습니다.', {
      status: 500,
      headers: corsHeaders,
    })
  }
  const userId = created.user.id

  const { error: profileError } = await serviceClient
    .from('profiles')
    .update({
      special_access: 'master',
      special_access_granted_at: new Date().toISOString(),
      special_access_granted_by: invitation.invited_by,
      special_access_revoked_at: null,
    })
    .eq('id', userId)
  if (profileError) {
    return new Response(profileError.message, { status: 500, headers: corsHeaders })
  }

  await serviceClient
    .from('master_invitations')
    .update({ status: 'accepted', accepted_at: new Date().toISOString(), accepted_user_id: userId })
    .eq('id', invitation.id)

  const { error: agreementError } = await serviceClient.from('user_policy_agreements').insert([
    { user_id: userId, agreement_type: 'terms', policy_version: policyVersion },
    { user_id: userId, agreement_type: 'age_eligibility', policy_version: policyVersion },
  ])
  if (agreementError) {
    return new Response(agreementError.message, { status: 500, headers: corsHeaders })
  }

  await serviceClient.from('admin_audit_log').insert({
    actor_id: userId,
    action: 'master_accepted',
    target_type: 'master_invitation',
    target_id: invitation.id,
    detail: { email: invitation.email, invited_by: invitation.invited_by },
  })

  return new Response(JSON.stringify({ success: true, email: invitation.email }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
