import { supabase } from '@/lib/supabase'
import { refreshScheduleNotifications } from '@/lib/notificationScheduler'
import { remoteDataRepository } from '@/repositories/remote/RemoteDataRepository'
import { readLocalSnapshot } from './localSnapshot'
import type { LocalSnapshot, MigrationEntityType, MigrationProgress } from './types'

// docs/MIGRATION_DESIGN.md §3 — 청크 크기는 문서상 "임시값, 실측 후 조정" 대상(결정 필요).
const CHUNK_SIZE = 200
const MAX_RETRIES = 3

function chunksOf<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size))
  return chunks
}

async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = MAX_RETRIES): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt === maxRetries) break
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)))
    }
  }
  throw lastError
}

type IdMapRow = { local_id: string; server_id: string }

// docs/MIGRATION_DESIGN.md §3-1 — (migration_id, entity_type, local_id) 재실행 시 이미 매핑된
// 레코드는 RPC가 알아서 스킵하고 기존 매핑을 돌려주므로, 클라이언트는 매 청크를 그냥 재호출하면 된다.
async function migrateEntityChunked(
  rpcName: string,
  migrationId: string,
  entityType: MigrationEntityType,
  payloads: Record<string, unknown>[],
  paramKey: string,
  onProgress?: (p: MigrationProgress) => void,
  progressBase?: { processed: number; total: number },
): Promise<Map<string, string>> {
  const idMap = new Map<string, string>()
  const chunks = chunksOf(payloads, CHUNK_SIZE)

  for (const chunk of chunks) {
    const rows = await retryWithBackoff(async () => {
      const { data, error } = await supabase.rpc(rpcName, {
        p_migration_id: migrationId,
        [paramKey]: chunk,
      })
      if (error) throw error
      return (data ?? []) as IdMapRow[]
    })
    for (const row of rows) idMap.set(row.local_id, row.server_id)

    if (progressBase) {
      progressBase.processed += chunk.length
      onProgress?.({
        phase: 'in_progress',
        currentEntity: entityType,
        processedRecords: progressBase.processed,
        totalRecords: progressBase.total,
        errorMessage: null,
      })
      await updateMigrationJobProgress(migrationId, progressBase.processed)
    }
  }

  if (idMap.size < payloads.length) {
    // 부모 참조가 아직 매핑되지 않은 자식 행은 서버에서 자연스럽게 스킵된다(§3-2 원칙).
    // 부모가 먼저 이전되도록 호출 순서를 지켰다면 정상 케이스에서는 발생하지 않아야 하므로 경고만 남긴다.
    console.warn(
      `[migration] ${entityType}: ${payloads.length - idMap.size}건이 매핑되지 않았습니다(부모 미이전 등).`,
    )
  }

  return idMap
}

async function updateMigrationJobProgress(migrationId: string, processedRecords: number): Promise<void> {
  await supabase.from('migration_jobs').update({ processed_records: processedRecords }).eq('id', migrationId)
}

// 이미 in_progress 상태인 job이 있으면 이어서 사용(앱 재실행/네트워크 복구 시나리오),
// 없으면 새로 생성한다.
async function getOrCreateMigrationJob(totalRecords: number): Promise<string> {
  const { data: existing, error: findError } = await supabase
    .from('migration_jobs')
    .select('id')
    .eq('direction', 'local_to_remote')
    .eq('status', 'in_progress')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (findError) throw findError
  if (existing) return existing.id

  const { data, error } = await supabase
    .from('migration_jobs')
    .insert({ direction: 'local_to_remote', status: 'in_progress', total_records: totalRecords })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

function toWordbookPayload(wb: LocalSnapshot['wordbooks'][number]) {
  return { local_id: wb.id, name: wb.name, description: wb.description, language: wb.language }
}

function toWordPayload(w: LocalSnapshot['words'][number]) {
  return {
    local_id: w.id,
    wordbook_local_id: w.wordbook_id,
    term: w.term,
    definition: w.definition,
    description: w.description,
    example: w.example,
    memo: w.memo,
    status: w.status,
    review_step: w.review_step,
    first_passed_at: w.first_passed_at,
    next_review_at: w.next_review_at,
    wrong_count: w.wrong_count,
  }
}

function toSchedulePayload(s: LocalSnapshot['schedules'][number]) {
  return {
    local_id: s.id,
    parent_local_id: s.parent_schedule_id,
    title: s.title,
    location: s.location,
    starts_at: s.starts_at,
    ends_at: s.ends_at,
    is_all_day: s.is_all_day,
    repeat_type: s.repeat_type,
    repeat_unit: s.repeat_unit,
    repeat_value: s.repeat_value,
    repeat_end_type: s.repeat_end_type,
    repeat_until: s.repeat_until,
    repeat_count: s.repeat_count,
    alarm_minutes: s.alarm_minutes,
  }
}

function toScheduleExceptionPayload(e: LocalSnapshot['scheduleExceptions'][number]) {
  return {
    local_id: e.id,
    schedule_local_id: e.schedule_id,
    occurrence_date: e.occurrence_date,
    exception_type: e.exception_type,
    original_starts_at: e.original_starts_at,
    original_ends_at: e.original_ends_at,
    title: e.title,
    location: e.location,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    is_all_day: e.is_all_day,
    alarm_minutes: e.alarm_minutes,
  }
}

function toStudySessionPayload(s: LocalSnapshot['studySessions'][number]) {
  return {
    local_id: s.id,
    session_type: s.session_type,
    wordbook_local_ids: s.wordbook_ids ?? [],
    total_count: s.total_count,
    correct_count: s.correct_count,
    wrong_count: s.wrong_count,
    completed_at: s.completed_at,
    created_at: s.created_at,
  }
}

function toStudyResultPayload(r: LocalSnapshot['studyResults'][number]) {
  return {
    local_id: r.id,
    session_local_id: r.session_id,
    word_local_id: r.word_id,
    is_correct: r.is_correct,
    attempt_count: r.attempt_count,
    answered_at: r.answered_at,
  }
}

export type MigrationResult = { success: boolean; errorMessage?: string }

// docs/MIGRATION_DESIGN.md §2, §3-2 — wordbooks → words → schedules → schedule_exceptions →
// study_sessions → study_results 순서를 반드시 지킨다(자식이 부모의 매핑을 필요로 함).
// 성공 검증 전 로컬 데이터를 삭제하지 않는다 — 이 함수는 삭제를 하지 않고, 호출부(훅)가
// 검증 통과 후에만 로컬 삭제 여부를 사용자에게 물어본다.
export async function runGuestToRemoteMigration(
  onProgress?: (p: MigrationProgress) => void,
): Promise<MigrationResult> {
  const snapshot = await readLocalSnapshot()
  const totalRecords =
    snapshot.wordbooks.length +
    snapshot.words.length +
    snapshot.schedules.length +
    snapshot.scheduleExceptions.length +
    snapshot.studySessions.length +
    snapshot.studyResults.length

  let migrationId: string
  try {
    migrationId = await getOrCreateMigrationJob(totalRecords)
  } catch (err) {
    const message = (err as { message?: string })?.message ?? '이전 작업을 시작하지 못했습니다.'
    onProgress?.({ phase: 'failed', currentEntity: null, processedRecords: 0, totalRecords, errorMessage: message })
    return { success: false, errorMessage: message }
  }

  const progressBase = { processed: 0, total: totalRecords }
  onProgress?.({ phase: 'in_progress', currentEntity: null, processedRecords: 0, totalRecords, errorMessage: null })

  try {
    const wordbookMap = await migrateEntityChunked(
      'migrate_wordbooks', migrationId, 'wordbook',
      snapshot.wordbooks.map(toWordbookPayload), 'p_wordbooks', onProgress, progressBase,
    )
    await migrateEntityChunked(
      'migrate_words', migrationId, 'word',
      snapshot.words.map(toWordPayload), 'p_words', onProgress, progressBase,
    )
    const scheduleMap = await migrateEntityChunked(
      'migrate_schedules', migrationId, 'schedule',
      snapshot.schedules.map(toSchedulePayload), 'p_schedules', onProgress, progressBase,
    )
    await migrateEntityChunked(
      'migrate_schedule_exceptions', migrationId, 'schedule_exception',
      snapshot.scheduleExceptions.map(toScheduleExceptionPayload), 'p_exceptions', onProgress, progressBase,
    )
    const sessionMap = await migrateEntityChunked(
      'migrate_study_sessions', migrationId, 'study_session',
      snapshot.studySessions.map(toStudySessionPayload), 'p_sessions', onProgress, progressBase,
    )
    await migrateEntityChunked(
      'migrate_study_results', migrationId, 'study_result',
      snapshot.studyResults.map(toStudyResultPayload), 'p_results', onProgress, progressBase,
    )
    void sessionMap // 결과 매핑 자체는 후속 단계에서 쓰지 않지만 반환값 형태를 다른 엔티티와 통일해 둔다.

    onProgress?.({ phase: 'verifying', currentEntity: null, processedRecords: progressBase.processed, totalRecords, errorMessage: null })

    // docs/MIGRATION_DESIGN.md §5 — 로컬 레코드 수 vs 매핑 성공 수 비교(부모 누락으로 인한 스킵은 경고만).
    if (wordbookMap.size < snapshot.wordbooks.length) {
      console.warn('[migration] 일부 단어장이 이전되지 않았습니다.')
    }

    // 알림 재등록 — 로컬 notifications 원본은 이전하지 않고, alarm_minutes가 설정된 이전된 일정에
    // 대해서만 새로 예약한다(오래된 native_id를 그대로 복사하면 기기 상태와 어긋날 수 있음).
    for (const s of snapshot.schedules) {
      if (s.alarm_minutes === null) continue
      const serverId = scheduleMap.get(s.id)
      if (!serverId) continue
      try {
        const migrated = await remoteDataRepository.getSchedules()
        const found = migrated.find((m) => m.id === serverId)
        if (found) await refreshScheduleNotifications(remoteDataRepository, found)
      } catch (err) {
        console.error('[migration] 알림 재등록 실패', err)
      }
    }

    await supabase
      .from('migration_jobs')
      .update({ status: 'completed', completed_at: new Date().toISOString(), processed_records: progressBase.processed })
      .eq('id', migrationId)

    onProgress?.({ phase: 'completed', currentEntity: null, processedRecords: progressBase.processed, totalRecords, errorMessage: null })
    return { success: true }
  } catch (err) {
    const message = (err as { message?: string })?.message ?? '데이터 이전 중 오류가 발생했습니다.'
    await supabase
      .from('migration_jobs')
      .update({ status: 'failed', error_detail: { message } })
      .eq('id', migrationId)
    onProgress?.({
      phase: 'failed', currentEntity: null, processedRecords: progressBase.processed, totalRecords, errorMessage: message,
    })
    return { success: false, errorMessage: message }
  }
}
