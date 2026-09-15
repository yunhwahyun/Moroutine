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

// instanceStartDay: 이 occurrence(반복이면 해당 회차)가 실제로 시작하는 날. displayDay: 이
// 카드를 어느 날짜 헤더 아래 보여줄지(여러 날짜에 걸친 일정은 겹치는 기간 내 날짜마다 한 장씩
// 카드를 만든다 — 기본값은 instanceStartDay와 동일, 즉 기존 동작 그대로).
function makeOccurrence(
  schedule: Schedule,
  instanceStartDay: Date,
  isRecurring: boolean,
  displayDay: Date = instanceStartDay,
): ScheduleOccurrence {
  const orig = new Date(schedule.starts_at)
  const startsAt = new Date(
    instanceStartDay.getFullYear(),
    instanceStartDay.getMonth(),
    instanceStartDay.getDate(),
    orig.getHours(),
    orig.getMinutes(),
    orig.getSeconds(),
  )

  let endsAt: string | null = null
  if (schedule.ends_at) {
    const duration = new Date(schedule.ends_at).getTime() - orig.getTime()
    endsAt = new Date(startsAt.getTime() + duration).toISOString()
  }

  const occDate = dateStr(displayDay)
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
 *
 * 여러 날짜에 걸친 일정(예: 종일 2박 3일, 자정을 넘기는 시간 일정)은 "시작일에만 occurrence가
 * 붙고 그 시작일이 조회 범위 밖이면 통째로 안 보인다"는 버그가 있었다 — 예를 들어 9/14~9/15
 * 종일 일정을 만들고 "오늘"(9/15)만 조회하면 시작일(9/14)이 범위 밖이라 아예 안 뜬다(실사용자
 * 리포트, docs/DECISION_LOG.md 2026-09-15).
 *
 * **반복 없는 일정**은 일정이 걸치는 기간과 조회 범위가 겹치는 날짜마다 카드를 하나씩 만든다
 * (겹치는 날이 여러 개면 그 날짜 헤더 밑에 각각 나타남) — 실제 starts_at/ends_at 값은 그대로
 * 유지하고 occurrence_date(카드가 붙는 날짜)만 날짜별로 바뀐다.
 *
 * **반복 일정**은 회차별로 occurrence를 하나만 만들되(예전과 동일, occurrence_date=그 회차의
 * 실제 시작일), 그 회차가 걸치는 기간이 조회 범위와 겹치기만 하면 포함시키도록 필터만 고쳤다 —
 * 반복 간격이 일정이 걸치는 기간보다 짧으면(예: 2일짜리 종일 일정을 매일 반복) 회차끼리 기간이
 * 겹치더라도 각 회차는 서로 다른 실제 시작일을 갖기 때문에(반복은 항상 앞으로만 진행) 뒤 문단의
 * "반복 없는 일정" 방식처럼 날짜별로 여러 장을 만들면 서로 다른 회차가 같은 표시 날짜를 공유해
 * occurrence_id가 충돌한다(React key 충돌 → 삭제/수정이 엉뚱한 카드에 적용되는 버그로 이어짐,
 * 실사용자 리포트로 발견 — docs/DECISION_LOG.md 2026-09-15). 그래서 반복 일정은 일부러 회차당
 * 카드 1장만 만들어 이 충돌 자체를 피한다 — 대가로, 시작일이 조회 범위보다 앞선 회차는 그
 * 시작일(범위 밖 날짜) 헤더 밑에 뜬다(occurrence_date는 여전히 exceptions/분할 수정의 자연키라
 * 바꿀 수 없음).
 */
export function expandScheduleOccurrences(
  schedule: Schedule,
  rangeStart: Date,
  rangeEnd: Date,
): ScheduleOccurrence[] {
  const result: ScheduleOccurrence[] = []
  const origStart = new Date(schedule.starts_at)
  const baseDay = floorToDay(origStart)
  const baseEndDay = schedule.ends_at ? floorToDay(new Date(schedule.ends_at)) : baseDay
  // 일정이 걸치는 일수(당일이면 0) — 반복 회차마다 시작일이 밀려도 걸치는 일수는 동일하다고 가정.
  const spanDays = Math.max(0, Math.round((baseEndDay.getTime() - baseDay.getTime()) / 86400000))

  if (schedule.repeat_type === 'none') {
    const instanceEndDay = addDays(baseDay, spanDays)
    const visibleStart = baseDay > rangeStart ? baseDay : rangeStart
    const visibleEnd = instanceEndDay < rangeEnd ? instanceEndDay : rangeEnd
    for (let d = new Date(visibleStart); d <= visibleEnd; d = addDays(d, 1)) {
      result.push(makeOccurrence(schedule, baseDay, false, d))
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

    if (addDays(current, spanDays) >= rangeStart) {
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
