// Master 본인 회원탈퇴 — 권한 강등이 아니라 계정(Auth) 자체를 삭제한다.
// docs/launch/PHASE1_POLICY.md §3.5, §7 참고.
//
// 개인 데이터 테이블(profiles/wordbooks/words/schedules/notifications/study_sessions/study_results/
// books/book_chapters/subscriptions/migration_jobs/device_migration_status/retention_schedules/
// speaking_sentences/speaking_recordings/user_public_wordbook_enrollments/user_public_word_progress/
// user_policy_agreements)은 전부 user_id(또는 profiles.id)가 auth.users(id)를 ON DELETE CASCADE로
// 참조하므로, auth.admin.deleteUser() 한 번으로 전부 연쇄 삭제된다 — 같은 테이블을 애플리케이션
// 코드에서 중복 삭제하지 않는다.
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

  const serviceClient = createServiceClient()
  const caller = await getCallerUser(req)
  if (!caller) {
    return new Response('unauthorized', { status: 401, headers: corsHeaders })
  }

  const { data: profile, error: profileError } = await serviceClient
    .from('profiles')
    .select('role, special_access')
    .eq('id', caller.id)
    .single()
  if (profileError || !profile) {
    return new Response('profile not found', { status: 404, headers: corsHeaders })
  }

  // Admin 계정 보호 — 이 Flow는 Master 자진 탈퇴 전용이다(docs/launch/PHASE1_POLICY.md §3.5).
  if (profile.role === 'admin') {
    return new Response('admin 계정은 이 기능으로 탈퇴할 수 없습니다.', { status: 403, headers: corsHeaders })
  }
  if (profile.special_access !== 'master') {
    return new Response('master 계정만 이 기능을 사용할 수 있습니다.', { status: 403, headers: corsHeaders })
  }

  // 삭제 전에 감사 로그를 남긴다 — actor_id는 auth.users 삭제 시 SET NULL로 끊어지지만
  // (마이그레이션 45), detail.email로 행위자 식별 정보는 남는다.
  await serviceClient.from('admin_audit_log').insert({
    actor_id: caller.id,
    action: 'master_self_delete',
    target_type: 'profile',
    target_id: caller.id,
    detail: { email: caller.email },
  })

  const { error: deleteError } = await serviceClient.auth.admin.deleteUser(caller.id)
  if (deleteError) {
    return new Response(deleteError.message, { status: 500, headers: corsHeaders })
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
