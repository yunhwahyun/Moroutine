// 이미 회원가입된 사용자를 이메일 발송 없이 즉시 Master로 추가.
// docs/MASTER_INVITATION_DESIGN.md 초대 플로우(master-invite)는 Supabase 기본 이메일 발송(SMTP 미설정)에
// 의존하는데, 발송 자체가 실패(rate limit 등)하면 초대가 불가능해진다. 그 대안으로,
// 이미 가입되어 있는 사용자에 한해 이메일 없이 special_access를 바로 부여한다.
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

  // supabase-js admin.listUsers()는 이메일 필터를 지원하지 않아 REST를 직접 호출한다.
  const usersRes = await fetch(
    `${Deno.env.get('SUPABASE_URL')}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
    {
      headers: {
        apikey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      },
    },
  )
  if (!usersRes.ok) {
    return new Response('사용자 조회에 실패했습니다.', { status: 500, headers: corsHeaders })
  }
  const usersBody = await usersRes.json()
  const matched = (usersBody.users ?? []).find((u: { email?: string }) => u.email?.toLowerCase() === email)
  if (!matched) {
    return new Response('가입된 사용자를 찾을 수 없습니다. 회원가입 후 다시 시도하세요.', {
      status: 404,
      headers: corsHeaders,
    })
  }

  const { error: profileError } = await serviceClient
    .from('profiles')
    .update({
      special_access: 'master',
      special_access_granted_at: new Date().toISOString(),
      special_access_granted_by: admin.id,
      special_access_revoked_at: null,
    })
    .eq('id', matched.id)
  if (profileError) {
    return new Response(profileError.message, { status: 500, headers: corsHeaders })
  }

  // docs/DATA_RETENTION_DESIGN.md §2 — 3개월 이내 Master 재지정 시 대기 중인 삭제 스케줄을 취소한다.
  await serviceClient
    .from('retention_schedules')
    .update({ status: 'canceled' })
    .eq('user_id', matched.id)
    .eq('status', 'active')

  await serviceClient.from('admin_audit_log').insert({
    actor_id: admin.id,
    action: 'master_added_direct',
    target_type: 'profile',
    target_id: matched.id,
    detail: { email },
  })

  return new Response(JSON.stringify({ success: true, user_id: matched.id }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
