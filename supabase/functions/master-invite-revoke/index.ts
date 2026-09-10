// Master 초대 취소 — pending/sent 상태의 초대를 실제로 삭제한다(2026-09-10 변경).
// 기존엔 status='revoked'로 이력만 남기고 행을 영구 보존했으나, 취소한 초대는 다시 쓰지 않는데도
// 목록에 계속 쌓이는 문제가 있어 하드 삭제로 변경했다. 스펙: docs/MASTER_INVITATION_DESIGN.md §4-4
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts'
import { createServiceClient, requireAdmin } from '../_shared/auth.ts'

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
    .select('id, email')
    .eq('id', invitationId)
    .maybeSingle()
  if (findError || !invitation) {
    return new Response('초대를 찾을 수 없습니다.', { status: 404, headers: corsHeaders })
  }

  // admin_audit_log에 먼저 기록 — 삭제 후에도 "누가 무슨 이메일 초대를 언제 취소했는지"는
  // detail.email로 남는다(target_id는 FK가 아닌 text라 행이 삭제돼도 값 자체는 유효하게 남음).
  await serviceClient.from('admin_audit_log').insert({
    actor_id: admin.id,
    action: 'master_invite_delete',
    target_type: 'master_invitation',
    target_id: invitationId,
    detail: { email: invitation.email },
  })

  const { error: deleteError } = await serviceClient
    .from('master_invitations')
    .delete()
    .eq('id', invitationId)
  if (deleteError) {
    return new Response(deleteError.message, { status: 500, headers: corsHeaders })
  }

  return new Response(JSON.stringify({ status: 'deleted' }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
