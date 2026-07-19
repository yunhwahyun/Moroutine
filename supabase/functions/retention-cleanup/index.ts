// 구독 만료/Master 해제 후 3개월 경과한 사용자 개인 데이터를 삭제하는 Scheduled Edge Function.
// 스펙: docs/DATA_RETENTION_DESIGN.md §4-2. pg_cron이 매일 호출(사용자 요청 경로 아님).
//
// 필요한 환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY(런타임 기본 제공).
// pg_cron이 net.http_post로 호출할 때 Authorization: Bearer {service_role_key}를 그대로 사용한다
// (docs/DATA_RETENTION_DESIGN.md §4-2 cron.schedule 원문과 동일).
//
// 부모 테이블만 삭제하면 기존 FK(words→wordbooks, schedule_exceptions/notifications→schedules,
// study_results→words/study_sessions, speaking_recordings→speaking_sentences)가 전부
// ON DELETE CASCADE라 자식 테이블은 자동으로 함께 삭제된다. DELETE는 멱등이라 실패 후 재시도해도
// 이미 지워진 테이블은 0건 삭제로 넘어가므로 별도 트랜잭션 관리가 필요 없다.
//
// Storage(speaking-recordings/{user_id}/**) 삭제는 이번엔 생략 — 스피킹 기능(Phase 23)이 아직
// 미착수라 실제 버킷/파일이 존재하지 않는다. Phase 23 구현 후 이 함수에 추가해야 한다.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const CLEANUP_TABLES = [
  'wordbooks',
  'schedules',
  'study_sessions',
  'user_public_wordbook_enrollments',
  'user_public_word_progress',
  'speaking_sentences',
]

async function deleteUserData(supabase: SupabaseClient, userId: string): Promise<void> {
  for (const table of CLEANUP_TABLES) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId)
    if (error) throw new Error(`${table}: ${error.message}`)
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authHeader = req.headers.get('authorization') ?? ''
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response('unauthorized', { status: 401 })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey)

  const { data: dueSchedules, error: findError } = await supabase
    .from('retention_schedules')
    .select('id, user_id, source')
    .eq('status', 'active')
    .lt('retention_expires_at', new Date().toISOString())
  if (findError) {
    console.error('retention-cleanup: failed to query retention_schedules', findError)
    return new Response('internal error', { status: 500 })
  }

  let deleted = 0
  let failed = 0

  for (const schedule of dueSchedules ?? []) {
    try {
      await deleteUserData(supabase, schedule.user_id)

      const { error: updateError } = await supabase
        .from('retention_schedules')
        .update({ status: 'deleted', updated_at: new Date().toISOString() })
        .eq('id', schedule.id)
      if (updateError) throw updateError

      await supabase.from('admin_audit_log').insert({
        actor_id: null,
        action: 'retention_delete',
        target_type: 'user',
        target_id: schedule.user_id,
        detail: { source: schedule.source, tables_deleted: CLEANUP_TABLES },
      })

      deleted++
    } catch (err) {
      // 실패한 건은 status='active'로 남겨 다음 cron 주기에 재시도한다.
      console.error(`retention-cleanup: failed for user ${schedule.user_id}`, err)
      failed++
    }
  }

  return new Response(JSON.stringify({ processed: dueSchedules?.length ?? 0, deleted, failed }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
