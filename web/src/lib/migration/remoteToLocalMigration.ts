import { supabase } from '@/lib/supabase'
import { localDB, type LocalStudyResult, type LocalStudySession } from '@/repositories/local/schema'
import { getOrCreateDeviceId } from '@/lib/deviceId'
import type { NotificationRecord, Schedule, ScheduleException, Word, Wordbook } from '@/types'
import type { MigrationEntityType, MigrationProgress } from './types'

// docs/SUBSCRIPTION_DESIGN.md §6, docs/MIGRATION_DESIGN.md §6 — 구독 만료/해지로 Remote→Local
// 강제 전환할 때 쓰는 다운로드 엔진. guestToRemoteMigration.ts(Local→Remote)의 반대 방향이지만,
// 서버 UUID를 로컬 id로 그대로 사용하므로 RPC/migration_id_map 없이 직접 조회 + bulkPut으로 충분하다
// (로컬 ID 재매핑이 필요 없음 — 애초에 서버가 매긴 id를 그대로 쓰기 때문).

const ENTITY_TABLES = [
  'wordbooks', 'words', 'schedules', 'schedule_exceptions', 'study_sessions', 'study_results', 'notifications',
]

async function countRows(table: string): Promise<number> {
  const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true })
  if (error) throw error
  return count ?? 0
}

async function getOrCreateDowngradeJob(userId: string): Promise<{ id: string; totalRecords: number }> {
  const { data: existing, error: findError } = await supabase
    .from('migration_jobs')
    .select('id, total_records')
    .eq('direction', 'remote_to_local')
    .eq('status', 'in_progress')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (findError) throw findError
  if (existing) return { id: existing.id, totalRecords: existing.total_records ?? 0 }

  const counts = await Promise.all(ENTITY_TABLES.map(countRows))
  const totalRecords = counts.reduce((sum, n) => sum + n, 0)

  const { data, error } = await supabase
    .from('migration_jobs')
    .insert({ user_id: userId, direction: 'remote_to_local', status: 'in_progress', total_records: totalRecords })
    .select('id')
    .single()
  if (error) throw error
  return { id: data.id, totalRecords }
}

async function downloadEntity<T>(
  table: string,
  entity: MigrationEntityType,
  onProgress: ((p: MigrationProgress) => void) | undefined,
  progressBase: { processed: number; total: number },
): Promise<T[]> {
  const { data, error } = await supabase.from(table).select('*')
  if (error) throw error
  const rows = (data ?? []) as T[]
  progressBase.processed += rows.length
  onProgress?.({
    phase: 'in_progress',
    currentEntity: entity,
    processedRecords: progressBase.processed,
    totalRecords: progressBase.total,
    errorMessage: null,
  })
  return rows
}

export type DowngradeResult = { success: boolean; errorMessage?: string }

// docs/SUBSCRIPTION_DESIGN.md §6-3 — 로컬 이전 완료(검증까지) 전에는 서버 데이터 삭제·강제 로그아웃을
// 하지 않는다. 이 함수는 다운로드/검증/기록까지만 하고, 로그아웃은 호출부(훅)가 성공 후에만 수행한다.
export async function runRemoteToLocalMigration(
  userId: string,
  onProgress?: (p: MigrationProgress) => void,
): Promise<DowngradeResult> {
  let job: { id: string; totalRecords: number }
  try {
    job = await getOrCreateDowngradeJob(userId)
  } catch (err) {
    const message = (err as { message?: string })?.message ?? '다운로드 작업을 시작하지 못했습니다.'
    onProgress?.({ phase: 'failed', currentEntity: null, processedRecords: 0, totalRecords: 0, errorMessage: message })
    return { success: false, errorMessage: message }
  }

  const progressBase = { processed: 0, total: job.totalRecords }
  onProgress?.({
    phase: 'in_progress', currentEntity: null, processedRecords: 0, totalRecords: job.totalRecords, errorMessage: null,
  })

  try {
    const wordbooks = await downloadEntity<Wordbook>('wordbooks', 'wordbook', onProgress, progressBase)
    const words = await downloadEntity<Word>('words', 'word', onProgress, progressBase)
    const schedules = await downloadEntity<Schedule>('schedules', 'schedule', onProgress, progressBase)
    const scheduleExceptions = await downloadEntity<ScheduleException>(
      'schedule_exceptions', 'schedule_exception', onProgress, progressBase,
    )

    const rawSessions = await downloadEntity<Record<string, unknown>>(
      'study_sessions', 'study_session', onProgress, progressBase,
    )
    const studySessions: LocalStudySession[] = rawSessions.map((s) => ({
      id: s.id as string,
      session_type: s.session_type as LocalStudySession['session_type'],
      wordbook_ids: (s.wordbook_ids as string[] | null) ?? null,
      total_count: s.total_count as number,
      correct_count: s.correct_count as number,
      wrong_count: s.wrong_count as number,
      completed_at: (s.completed_at as string | null) ?? null,
      created_at: s.created_at as string,
    }))

    const rawResults = await downloadEntity<Record<string, unknown>>(
      'study_results', 'study_result', onProgress, progressBase,
    )
    const studyResults: LocalStudyResult[] = rawResults.map((r) => ({
      id: r.id as string,
      session_id: (r.session_id as string | null) ?? null,
      word_id: r.word_id as string,
      is_correct: r.is_correct as boolean,
      attempt_count: r.attempt_count as number,
      answered_at: r.answered_at as string,
    }))

    // 이 기기에서 이미 예약돼 있는 네이티브 알림(native_id)은 OS 레벨에서 계속 유효하므로
    // 업로드 방향(guestToRemoteMigration)과 달리 재예약 없이 레코드만 그대로 복사한다.
    const notifications = await downloadEntity<NotificationRecord>('notifications', 'notification', onProgress, progressBase)

    onProgress?.({
      phase: 'verifying', currentEntity: null, processedRecords: progressBase.processed,
      totalRecords: job.totalRecords, errorMessage: null,
    })

    // docs/MIGRATION_DESIGN.md §6 — 서버가 항상 최신본. 기기에 남아있던 Guest 로컬 데이터가 있어도
    // 삭제하지 않고 bulkPut(서버 UUID를 그대로 로컬 id로 사용)으로 병합한다 — 기존 로컬 전용 항목은 유지된다.
    await localDB.transaction(
      'rw',
      [
        localDB.wordbooks, localDB.words, localDB.schedules, localDB.scheduleExceptions,
        localDB.studySessions, localDB.studyResults, localDB.notifications,
      ],
      async () => {
        await Promise.all([
          localDB.wordbooks.bulkPut(wordbooks),
          localDB.words.bulkPut(words),
          localDB.schedules.bulkPut(schedules),
          localDB.scheduleExceptions.bulkPut(scheduleExceptions),
          localDB.studySessions.bulkPut(studySessions),
          localDB.studyResults.bulkPut(studyResults),
          localDB.notifications.bulkPut(notifications),
        ])
      },
    )

    const deviceId = getOrCreateDeviceId()
    const { error: deviceStatusError } = await supabase
      .from('device_migration_status')
      .upsert(
        {
          user_id: userId,
          device_id: deviceId,
          direction: 'remote_to_local',
          status: 'completed',
          completed_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,device_id,direction' },
      )
    if (deviceStatusError) throw deviceStatusError

    await supabase
      .from('migration_jobs')
      .update({ status: 'completed', completed_at: new Date().toISOString(), processed_records: progressBase.processed })
      .eq('id', job.id)

    onProgress?.({
      phase: 'completed', currentEntity: null, processedRecords: progressBase.processed,
      totalRecords: job.totalRecords, errorMessage: null,
    })
    return { success: true }
  } catch (err) {
    const message = (err as { message?: string })?.message ?? '데이터를 내려받는 중 오류가 발생했습니다.'
    await supabase.from('migration_jobs').update({ status: 'failed', error_detail: { message } }).eq('id', job.id)
    onProgress?.({
      phase: 'failed', currentEntity: null, processedRecords: progressBase.processed,
      totalRecords: job.totalRecords, errorMessage: message,
    })
    return { success: false, errorMessage: message }
  }
}
