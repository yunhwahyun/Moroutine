// Admin이 기존 Master 권한 해제. 스펙: docs/MASTER_INVITATION_DESIGN.md §5, §5-1
import { corsHeaders, handleCorsPreflight } from '../_shared/cors.ts'
import { createServiceClient, requireAdmin } from '../_shared/auth.ts'

const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'grace_period', 'billing_retry']
const RETENTION_MONTHS = 3

function addMonths(base: Date, months: number): string {
  const d = new Date(base)
  d.setMonth(d.getMonth() + months)
  return d.toISOString()
}

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

  let body: { userId?: string }
  try {
    body = await req.json()
  } catch {
    return new Response('invalid json', { status: 400, headers: corsHeaders })
  }

  const userId = body.userId
  if (!userId) {
    return new Response('userId is required', { status: 400, headers: corsHeaders })
  }

  const { data: profile, error: profileFindError } = await serviceClient
    .from('profiles')
    .select('special_access')
    .eq('id', userId)
    .maybeSingle()
  if (profileFindError || !profile) {
    return new Response('사용자를 찾을 수 없습니다.', { status: 404, headers: corsHeaders })
  }
  if (profile.special_access !== 'master') {
    return new Response('Master 권한이 없는 사용자입니다.', { status: 400, headers: corsHeaders })
  }

  // docs/MASTER_INVITATION_DESIGN.md §5-1 — 유효 구독이 있으면 get_service_tier()가 자동으로 Premium/Pro를
  // 반환하므로 별도 처리 없이 special_access만 해제한다. 구독이 없으면 클라이언트의 DowngradeGate가
  // 다음 permissions 조회 시 serviceTier==='guest'를 감지해 로컬 전환 절차를 자동으로 시작한다.
  const { data: activeSubscription } = await serviceClient
    .from('subscriptions')
    .select('plan_code')
    .eq('user_id', userId)
    .in('status', ACTIVE_SUBSCRIPTION_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error: updateError } = await serviceClient
    .from('profiles')
    .update({ special_access: 'none', special_access_revoked_at: new Date().toISOString() })
    .eq('id', userId)
  if (updateError) {
    return new Response(updateError.message, { status: 500, headers: corsHeaders })
  }

  const resultingTier = activeSubscription?.plan_code ?? 'guest'

  // docs/DATA_RETENTION_DESIGN.md §2 — 유효 구독이 없어 실제로 Guest 전환이 필요한 경우에만 삭제
  // 스케줄을 만든다. 유효 구독이 있으면(§5-1) 데이터 손실 위험이 없으므로 생략.
  if (!activeSubscription) {
    const { error: retentionError } = await serviceClient.from('retention_schedules').insert({
      user_id: userId,
      source: 'master_revoked',
      retention_expires_at: addMonths(new Date(), RETENTION_MONTHS),
    })
    if (retentionError) {
      return new Response(retentionError.message, { status: 500, headers: corsHeaders })
    }
  }

  await serviceClient.from('admin_audit_log').insert({
    actor_id: admin.id,
    action: 'master_revoke',
    target_type: 'user',
    target_id: userId,
    detail: { resulting_tier: resultingTier, had_active_subscription: !!activeSubscription },
  })

  return new Response(JSON.stringify({ success: true, resultingTier }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
