// Master 신규 초대 생성 + 발송. 스펙: docs/MASTER_INVITATION_DESIGN.md §4-1, §4-2
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
})
