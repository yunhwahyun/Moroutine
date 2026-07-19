// Master 초대 토큰 재발급 + 재발송. 스펙: docs/MASTER_INVITATION_DESIGN.md §4-4
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts'
import { createServiceClient, requireAdmin } from '../_shared/auth.ts'
import { INVITE_TTL_DAYS, addDays, sendInviteEmail, inviteRedirectTo } from '../_shared/masterInvite.ts'

Deno.serve(async (req: Request) => {
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

  let body: { invitation_id?: string }
  try {
    body = await req.json()
  } catch {
    return new Response('invalid json', { status: 400, headers: corsHeaders })
  }

  const invitationId = body.invitation_id
  if (!invitationId) {
    return new Response('invitation_id is required', { status: 400, headers: corsHeaders })
  }

  const { data: invitation, error: findError } = await serviceClient
    .from('master_invitations')
    .select('id, email, status')
    .eq('id', invitationId)
    .maybeSingle()
  if (findError || !invitation) {
    return new Response('초대를 찾을 수 없습니다.', { status: 404, headers: corsHeaders })
  }
  if (!['sent', 'expired'].includes(invitation.status)) {
    return new Response('재발송할 수 없는 상태입니다.', { status: 400, headers: corsHeaders })
  }

  const sendResult = await sendInviteEmail(serviceClient, invitation.email, inviteRedirectTo())
  if (sendResult.ok === false) {
    return new Response(sendResult.error, { status: 500, headers: corsHeaders })
  }

  const { error: updateError } = await serviceClient
    .from('master_invitations')
    .update({ status: 'sent', expires_at: addDays(INVITE_TTL_DAYS) })
    .eq('id', invitationId)
  if (updateError) {
    return new Response(updateError.message, { status: 500, headers: corsHeaders })
  }

  await serviceClient.from('admin_audit_log').insert({
    actor_id: admin.id,
    action: 'master_invite_resend',
    target_type: 'master_invitation',
    target_id: invitationId,
    detail: { email: invitation.email },
  })

  return new Response(JSON.stringify({ status: 'sent' }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
