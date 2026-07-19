// Master 신규 초대 생성 + 발송. 스펙: docs/MASTER_INVITATION_DESIGN.md §4-1, §4-2
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts'
import { createServiceClient, requireAdmin } from '../_shared/auth.ts'
import { INVITE_TTL_DAYS, addDays, sendInviteEmail, inviteRedirectTo } from '../_shared/masterInvite.ts'

// 최상위 캐치 — 예상치 못한 예외가 플랫폼의 불투명한 EDGE_FUNCTION_ERROR(빈 본문)로 가려지지 않고
// 관리자가 원인을 알 수 있는 메시지로 응답되게 한다(2026-07-19, 실사용 중 500 원인 조사 과정에서 추가).
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

  const serviceClient = createServiceClient()

  let admin
  try {
    admin = await requireAdmin(req, serviceClient)
  } catch (res) {
    if (res instanceof Response) return new Response(await res.text(), { status: res.status, headers: corsHeaders })
    throw res
  }

  let body: { email?: string }
  try {
    body = await req.json()
  } catch {
    return new Response('invalid json', { status: 400, headers: corsHeaders })
  }

  const email = body.email?.trim().toLowerCase()
  if (!email) {
    return new Response('email is required', { status: 400, headers: corsHeaders })
  }

  const { data: existingActive } = await serviceClient
    .from('master_invitations')
    .select('id')
    .eq('email', email)
    .in('status', ['pending', 'sent'])
    .maybeSingle()
  if (existingActive) {
    return new Response('이미 진행 중인 초대가 있습니다.', { status: 409, headers: corsHeaders })
  }

  const sendResult = await sendInviteEmail(serviceClient, email, inviteRedirectTo())
  if (sendResult.ok === false) {
    return new Response(sendResult.error, { status: 500, headers: corsHeaders })
  }

  const { data: invitation, error: insertError } = await serviceClient
    .from('master_invitations')
    .insert({ email, status: 'sent', invited_by: admin.id, expires_at: addDays(INVITE_TTL_DAYS) })
    .select('id')
    .single()
  if (insertError) {
    return new Response(insertError.message, { status: 500, headers: corsHeaders })
  }

  await serviceClient.from('admin_audit_log').insert({
    actor_id: admin.id,
    action: 'master_invite',
    target_type: 'master_invitation',
    target_id: invitation.id,
    detail: { email },
  })

  return new Response(JSON.stringify({ invitation_id: invitation.id, status: 'sent' }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
