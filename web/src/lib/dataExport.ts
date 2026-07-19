import { supabase } from '@/lib/supabase'
import { localDB, type LocalStudySession, type LocalStudyResult } from '@/repositories/local/schema'
import { readLocalSnapshot } from '@/lib/migration/localSnapshot'
import type { DataRepository } from '@/repositories/types'
import type { ServiceTier, Schedule, ScheduleException, UserSettings, Word, Wordbook } from '@/types'

// docs/DATA_STORAGE_DESIGN.md §13 — 데이터 내보내기/가져오기.
const SCHEMA_VERSION = 1 as const

export type BackupBundle = {
  schemaVersion: typeof SCHEMA_VERSION
  exportedAt: string
  wordbooks: Wordbook[]
  words: Word[]
  schedules: Schedule[]
  scheduleExceptions: ScheduleException[]
  // 문서 원안의 단일 studyHistory 배열 대신 studySessions/studyResults로 분리 — 복원 시 관계 보존을
  // 위한 편차(docs/DECISION_LOG.md 2026-07-19).
  studySessions: LocalStudySession[]
  studyResults: LocalStudyResult[]
  settings: UserSettings
}

function stripUserId<T>(rows: (T & { user_id?: unknown })[]): T[] {
  return rows.map((row) => {
    const clone = { ...row } as Record<string, unknown>
    delete clone.user_id
    return clone as T
  })
}

async function fetchAllRemote<T>(table: string): Promise<T[]> {
  const { data, error } = await supabase.from(table).select('*')
  if (error) throw error
  return (data ?? []) as T[]
}

// Guest는 이미 로컬 ID를 보존한 채로 전체를 읽어오는 readLocalSnapshot()(Phase 15)을 재사용하고,
// Remote는 RLS가 본인 것만 스코프하는 직접 조회로 동일하게 모은다 — 좁은 DataRepository CRUD로는
// 전체 스냅샷을 못 가져온다는 제약은 Phase 15/16의 이전 엔진에서 이미 같은 방식으로 우회했다.
export async function buildBackup(tier: ServiceTier, repository: DataRepository): Promise<BackupBundle> {
  const settings = await repository.getSettings()
  const exportedAt = new Date().toISOString()

  if (tier === 'guest') {
    const snapshot = await readLocalSnapshot()
    return {
      schemaVersion: SCHEMA_VERSION,
      exportedAt,
      wordbooks: snapshot.wordbooks,
      words: snapshot.words,
      schedules: snapshot.schedules,
      scheduleExceptions: snapshot.scheduleExceptions,
      studySessions: snapshot.studySessions,
      studyResults: snapshot.studyResults,
      settings,
    }
  }

  const [wordbooks, words, schedules, scheduleExceptions, rawSessions, rawResults] = await Promise.all([
    fetchAllRemote<Wordbook>('wordbooks'),
    fetchAllRemote<Word>('words'),
    fetchAllRemote<Schedule>('schedules'),
    fetchAllRemote<ScheduleException>('schedule_exceptions'),
    fetchAllRemote<LocalStudySession & { user_id: string }>('study_sessions'),
    fetchAllRemote<LocalStudyResult & { user_id: string }>('study_results'),
  ])

  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    wordbooks,
    words,
    schedules,
    scheduleExceptions,
    studySessions: stripUserId(rawSessions),
    studyResults: stripUserId(rawResults),
    settings,
  }
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadJson(bundle: BackupBundle): void {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' })
  triggerDownload(blob, `moroutine-backup-${bundle.exportedAt.slice(0, 10)}.json`)
}

function csvEscape(value: string | null | undefined): string {
  const v = value ?? ''
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export function downloadWordsCsv(wordbooks: Wordbook[], words: Word[]): void {
  const wordbookNameById = new Map(wordbooks.map((wb) => [wb.id, wb.name]))
  const header = ['단어장', '단어', '뜻', '설명', '예문', '메모']
  const rows = words.map((w) => [
    wordbookNameById.get(w.wordbook_id) ?? '',
    w.term,
    w.definition,
    w.description ?? '',
    w.example ?? '',
    w.memo ?? '',
  ])
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n')
  // BOM 추가 — Excel에서 UTF-8 한글이 깨지지 않도록(리터럴 문자 대신 이스케이프 시퀀스 사용).
  const BOM = String.fromCharCode(0xfeff)
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' })
  triggerDownload(blob, `moroutine-words-${new Date().toISOString().slice(0, 10)}.csv`)
}

// 손상 파일/버전 불일치 시 부분 파싱 없이 전체 거부(docs/DATA_STORAGE_DESIGN.md §13-2 "손상 파일 처리").
export async function parseBackupFile(file: File): Promise<BackupBundle> {
  let text: string
  try {
    text = await file.text()
  } catch {
    throw new Error('파일을 읽을 수 없습니다.')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('올바른 백업 파일이 아닙니다(JSON 파싱 실패).')
  }

  const bundle = parsed as Partial<BackupBundle>
  if (bundle.schemaVersion !== SCHEMA_VERSION) {
    // 현재는 v1만 존재 — 향후 새 스키마 버전이 생기면 여기서 마이그레이션 체인을 적용해야 한다.
    throw new Error('지원하지 않는 백업 파일 버전입니다.')
  }
  return bundle as BackupBundle
}

export type ImportSummary = {
  wordbookCount: number
  wordCount: number
  scheduleCount: number
}

export function summarizeBackup(bundle: BackupBundle): ImportSummary {
  return {
    wordbookCount: bundle.wordbooks.length,
    wordCount: bundle.words.length,
    scheduleCount: bundle.schedules.length,
  }
}

// Guest 전용 — 원본 ID를 그대로 bulkPut해 존재하면 덮어쓰고 없으면 추가한다. 사용자가 직접 skip/
// 덮어쓰기를 고르는 UI는 만들지 않고 "덮어쓰기"로 고정했다(docs/DECISION_LOG.md 2026-07-19 — 백업
// 복원이라는 용도상 최신 백업으로 되돌리는 것이 자연스러운 기본 동작이라고 판단).
export async function importBackupToLocal(bundle: BackupBundle): Promise<void> {
  await localDB.transaction(
    'rw',
    [
      localDB.wordbooks, localDB.words, localDB.schedules, localDB.scheduleExceptions,
      localDB.studySessions, localDB.studyResults, localDB.settings,
    ],
    async () => {
      await Promise.all([
        localDB.wordbooks.bulkPut(bundle.wordbooks),
        localDB.words.bulkPut(bundle.words),
        localDB.schedules.bulkPut(bundle.schedules),
        localDB.scheduleExceptions.bulkPut(bundle.scheduleExceptions),
        localDB.studySessions.bulkPut(bundle.studySessions),
        localDB.studyResults.bulkPut(bundle.studyResults),
        localDB.settings.put({ ...bundle.settings, id: 'local' }),
      ])
    },
  )
}

// 위험 동작 — Guest 로컬 데이터 전체 삭제(단어장/단어/일정/학습기록/설정). 알림(notifications)
// 스토어는 그대로 둔다 — 이미 예약된 OS 레벨 알림이 이 초기화로 갑자기 끊기지 않도록.
export async function clearAllLocalData(): Promise<void> {
  await localDB.transaction(
    'rw',
    [
      localDB.wordbooks, localDB.words, localDB.schedules, localDB.scheduleExceptions,
      localDB.studySessions, localDB.studyResults, localDB.settings,
    ],
    async () => {
      await Promise.all([
        localDB.wordbooks.clear(),
        localDB.words.clear(),
        localDB.schedules.clear(),
        localDB.scheduleExceptions.clear(),
        localDB.studySessions.clear(),
        localDB.studyResults.clear(),
        localDB.settings.clear(),
      ])
    },
  )
}
