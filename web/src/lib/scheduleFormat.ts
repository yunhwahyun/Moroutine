// 일정 카드/날짜 그룹 헤더 표시 포맷 — ScheduleListPage.tsx/HomePage.tsx 양쪽에 똑같이
// 복붙돼 있던 걸 공용 유틸로 추출(docs/DECISION_LOG.md 2026-09-15, 여러 날짜에 걸친 일정
// 표시 개선 작업 중 정리).

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

// "YYYY-MM-DD" → "YY.MM.DD (요일)"
export function formatDateShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  return `${y.slice(2)}.${m}.${d} (${WEEKDAY[date.getDay()]})`
}

function hhmm(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export type ScheduleCardTimeInput = {
  starts_at: string
  ends_at: string | null
  is_all_day: boolean
  // 이 카드가 붙어 있는 날짜(occurrence의 display_date) — 여러 날짜에 걸친 일정이 지금 몇
  // 번째 날인지 구분해 시작일 카드와 이어지는 날 카드의 표기를 다르게 하는 데 쓴다.
  display_date: string
}

// 카드 내부 시간 표시(날짜는 그룹 헤더에 따로 있으므로 시간/범위만 담당). 여러 날짜에 걸친
// 일정(종일이든 시간 지정이든)은 지금 보고 있는 날짜가 시작일인지 아닌지에 따라 표기가 다르다
// — 시작일 카드는 전체 범위("YY.MM.DD (요일) ~ YY.MM.DD (요일) 종일")를, 그 이후 날짜의
// 카드는 "이어지는 중"이라는 뜻으로 "~ YY.MM.DD (요일) 종일"만 보여준다(사용자 확정,
// docs/DECISION_LOG.md 2026-09-15).
export function formatScheduleCardTime({ starts_at, ends_at, is_all_day, display_date }: ScheduleCardTimeInput): string {
  const startDate = toDateStr(new Date(starts_at))
  const endDate = ends_at ? toDateStr(new Date(ends_at)) : startDate
  const isMultiDay = endDate !== startDate
  const onStartDay = display_date === startDate

  if (is_all_day) {
    if (!isMultiDay) return '종일'
    if (onStartDay) return `${formatDateShort(startDate)} ~ ${formatDateShort(endDate)} 종일`
    return `~ ${formatDateShort(endDate)} 종일`
  }

  const startTime = hhmm(starts_at)
  if (!ends_at) return startTime
  const endTime = hhmm(ends_at)
  if (!isMultiDay) return `${startTime} ~ ${endTime}`
  if (onStartDay) return `${startTime} ~ ${formatDateShort(endDate)} ${endTime}`
  return `~ ${formatDateShort(endDate)} ${endTime}`
}
