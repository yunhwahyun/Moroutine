import type { Schedule, ScheduleException, ScheduleOccurrence } from '@/types'

// ─── date helpers ───────────────────────────────────────────

export function dateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function floorToDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d)
  r.setMonth(r.getMonth() + n)
  return r
}

function addYears(d: Date, n: number): Date {
  const r = new Date(d)
  r.setFullYear(r.getFullYear() + n)
  return r
}

function nextOccurrenceDate(schedule: Schedule, from: Date): Date {
  const { repeat_type, repeat_unit, repeat_value } = schedule
  const v = repeat_value ?? 1
  switch (repeat_type) {
    case 'daily':    return addDays(from, 1)
    case 'weekly':   return addDays(from, 7)
    case 'biweekly': return addDays(from, 14)
    case 'monthly':  return addMonths(from, 1)
    case 'yearly':   return addYears(from, 1)
    case 'custom':
      if (repeat_unit === 'day')   return addDays(from, v)
      if (repeat_unit === 'week')  return addDays(from, v * 7)
      if (repeat_unit === 'month') return addMonths(from, v)
      if (repeat_unit === 'year')  return addYears(from, v)
      return addDays(from, 1)
    default: return addDays(from, 1)
  }
}

function makeOccurrence(
  schedule: Schedule,
  occDay: Date,
  isRecurring: boolean,
): ScheduleOccurrence {
  const orig = new Date(schedule.starts_at)
  const startsAt = new Date(
    occDay.getFullYear(),
    occDay.getMonth(),
    occDay.getDate(),
    orig.getHours(),
    orig.getMinutes(),
    orig.getSeconds(),
  )

  let endsAt: string | null = null
  if (schedule.ends_at) {
    const duration = new Date(schedule.ends_at).getTime() - orig.getTime()
    endsAt = new Date(startsAt.getTime() + duration).toISOString()
  }

  const occDate = dateStr(occDay)
  return {
    occurrence_id: `${schedule.id}:${occDate}`,
    schedule_id: schedule.id,
    occurrence_date: occDate,
    title: schedule.title,
    location: schedule.location,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt,
    is_all_day: schedule.is_all_day,
    alarm_minutes: schedule.alarm_minutes,
    repeat_type: schedule.repeat_type,
    is_recurring: isRecurring,
    is_exception: false,
  }
}

// ─── core functions ────────────────────────────────────────

/**
 * 단일 schedule의 조회 기간 내 occurrence 목록을 반환합니다.
 * repeat_end_type='count'일 때는 시작일부터 N회를 먼저 계산 후 range로 필터합니다.
 */
export function expandScheduleOccurrences(
  schedule: Schedule,
  rangeStart: Date,
  rangeEnd: Date,
): ScheduleOccurrence[] {
  const result: ScheduleOccurrence[] = []
  const origStart = new Date(schedule.starts_at)
  const baseDay = floorToDay(origStart)

  if (schedule.repeat_type === 'none') {
    if (baseDay >= rangeStart && baseDay <= rangeEnd) {
      result.push(makeOccurrence(schedule, baseDay, false))
    }
    return result
  }

  // 반복 종료 조건
  let repeatUntilDay: Date | null = null
  if (schedule.repeat_end_type === 'until' && schedule.repeat_until) {
    repeatUntilDay = parseLocalDate(schedule.repeat_until)
  }
  const maxCount =
    schedule.repeat_end_type === 'count' ? (schedule.repeat_count ?? null) : null

  let current = new Date(baseDay)
  let totalCount = 0
  const MAX_ITER = 5000

  for (let i = 0; i < MAX_ITER; i++) {
    if (maxCount !== null && totalCount >= maxCount) break
    if (repeatUntilDay && current > repeatUntilDay) break
    if (current > rangeEnd) break

    if (current >= rangeStart) {
      result.push(makeOccurrence(schedule, current, true))
    }

    totalCount++
    current = nextOccurrenceDate(schedule, current)
  }

  return result
}

/**
 * occurrences에 exceptions를 적용합니다.
 * - cancelled: 해당 occurrence 제거
 * - modified: 해당 occurrence를 예외 데이터로 덮어씀
 */
export function applyScheduleExceptions(
  occurrences: ScheduleOccurrence[],
  exceptions: ScheduleException[],
): ScheduleOccurrence[] {
  const cancelledDates = new Set<string>()
  const modifiedMap = new Map<string, ScheduleException>()

  for (const ex of exceptions) {
    const key = `${ex.schedule_id}:${ex.occurrence_date}`
    if (ex.exception_type === 'cancelled') {
      cancelledDates.add(key)
    } else {
      modifiedMap.set(key, ex)
    }
  }

  return occurrences
    .filter((occ) => !cancelledDates.has(occ.occurrence_id))
    .map((occ) => {
      const ex = modifiedMap.get(occ.occurrence_id)
      if (!ex) return occ
      return {
        ...occ,
        title: ex.title ?? occ.title,
        location: ex.location !== undefined ? ex.location : occ.location,
        starts_at: ex.starts_at ?? occ.starts_at,
        ends_at: ex.ends_at ?? occ.ends_at,
        is_all_day: ex.is_all_day ?? occ.is_all_day,
        alarm_minutes: ex.alarm_minutes !== undefined ? ex.alarm_minutes : occ.alarm_minutes,
        is_exception: true,
        exception_id: ex.id,
      }
    })
}

/**
 * 여러 schedule의 occurrences를 날짜별로 그룹핑합니다.
 * 반환: { date: string; occurrences: ScheduleOccurrence[] }[] (날짜 오름차순)
 */
export function groupOccurrencesByDate(
  occurrences: ScheduleOccurrence[],
): { date: string; occurrences: ScheduleOccurrence[] }[] {
  const map = new Map<string, ScheduleOccurrence[]>()
  for (const occ of occurrences) {
    const list = map.get(occ.occurrence_date) ?? []
    list.push(occ)
    map.set(occ.occurrence_date, list)
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, occs]) => ({
      date,
      occurrences: occs.sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
    }))
}

/**
 * repeat_end_type='count'의 경우 n번째 이전까지 유효한 occurrence 날짜인지 확인합니다.
 * "이 일정부터 이후 모두" 분기 처리 시 원본 schedule의 끊을 날짜 계산에 활용합니다.
 */
export function getOccurrenceDateBefore(
  schedule: Schedule,
  targetDate: string,
): string | null {
  const target = parseLocalDate(targetDate)
  const orig = floorToDay(new Date(schedule.starts_at))
  let current = new Date(orig)
  let prev: Date | null = null
  const MAX_ITER = 5000

  for (let i = 0; i < MAX_ITER; i++) {
    if (current >= target) return prev ? dateStr(prev) : null
    prev = new Date(current)
    current = nextOccurrenceDate(schedule, current)
  }
  return null
}
