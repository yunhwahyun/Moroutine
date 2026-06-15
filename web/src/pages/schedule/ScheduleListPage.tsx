import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { refreshScheduleNotifications, cancelScheduleNotifications } from '@/lib/notificationScheduler'
import { EditIcon } from '@/components/icons'
import Spinner from '@/components/ui/Spinner'
import {
  expandScheduleOccurrences,
  applyScheduleExceptions,
  groupOccurrencesByDate,
  getOccurrenceDateBefore,
} from '@/lib/scheduleRepeat'
import type {
  Schedule,
  ScheduleException,
  ScheduleOccurrence,
  RepeatType,
  RepeatEndType,
} from '@/types'

// ─── helpers ───────────────────────────────────────────────

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0]
}

function addDays(base: string, days: number) {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return toDateStr(d)
}

function hhmm(iso: string) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatDateHeader(occDate: string) {
  const [y, m, d] = occDate.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const yy = String(y).slice(2)
  const mm = String(m).padStart(2, '0')
  const dd = String(d).padStart(2, '0')
  const day = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()]
  return `${yy}.${mm}.${dd} (${day})`
}

// 카드 내부 시간 표시 (날짜는 그룹 헤더에 있으므로 시간만)
function formatCardTime(
  startsAt: string,
  endsAt: string | null,
  isAllDay: boolean,
  occDate: string,
) {
  if (isAllDay) return '종일'
  const startTime = hhmm(startsAt)
  if (!endsAt) return startTime

  const endD = new Date(endsAt)
  const endDate = toDateStr(endD)
  const endTime = hhmm(endsAt)

  if (endDate === occDate) {
    return `${startTime} ~ ${endTime}`
  }
  // 종료일이 다른 날짜
  const ey = endD.getFullYear()
  const emm = String(endD.getMonth() + 1).padStart(2, '0')
  const edd = String(endD.getDate()).padStart(2, '0')
  const eday = ['일', '월', '화', '수', '목', '금', '토'][endD.getDay()]
  return `${startTime} ~ ${String(ey).slice(2)}.${emm}.${edd} (${eday}) ${endTime}`
}

function formatAlarm(min: number | null) {
  if (min === null) return null
  if (min === 0) return '정시'
  if (min < 60) return `${min}분 전`
  return `${min / 60}시간 전`
}

function toDatePart(dt: Date) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
function toTimePart(dt: Date) {
  return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
}

// occurrence의 실제 시간 데이터 + 원본 schedule의 반복 설정으로 폼 구성
function occurrenceToForm(occ: ScheduleOccurrence, s: Schedule): ScheduleForm {
  const d = new Date(occ.starts_at)
  const endDt = occ.ends_at ? new Date(occ.ends_at) : null
  return {
    title: occ.title,
    date: toDatePart(d),
    time: toTimePart(d),
    endDate: endDt ? toDatePart(endDt) : toDatePart(d),
    endTime: endDt ? toTimePart(endDt) : '',
    isAllDay: occ.is_all_day,
    location: occ.location ?? '',
    repeatType: s.repeat_type,
    repeatEndType: s.repeat_end_type,
    repeatUntil: s.repeat_until ?? '',
    repeatCount: s.repeat_count !== null ? String(s.repeat_count) : '',
    repeatUnit: s.repeat_unit ?? 'day',
    repeatValue: s.repeat_value !== null ? String(s.repeat_value) : '1',
    alarmMinutes: occ.alarm_minutes !== null ? String(occ.alarm_minutes) : '',
  }
}

// ─── constants ────────────────────────────────────────────

const REPEAT_LABEL: Record<string, string> = {
  daily: '매일', weekly: '매주', biweekly: '2주마다',
  monthly: '매월', yearly: '매년', custom: '사용자 정의',
}

const REPEAT_OPTIONS = [
  { value: 'none', label: '반복 없음' },
  { value: 'daily', label: '매일' },
  { value: 'weekly', label: '매주' },
  { value: 'biweekly', label: '2주마다' },
  { value: 'monthly', label: '매월' },
  { value: 'yearly', label: '매년' },
  { value: 'custom', label: '사용자 정의' },
]

const REPEAT_END_OPTIONS = [
  { value: 'none', label: '종료 없음' },
  { value: 'until', label: '날짜까지' },
  { value: 'count', label: '횟수 반복' },
]

const REPEAT_UNIT_OPTIONS = [
  { value: 'day', label: '일' },
  { value: 'week', label: '주' },
  { value: 'month', label: '개월' },
  { value: 'year', label: '년' },
]

const ALARM_OPTIONS = [
  { value: '', label: '알림 없음' },
  { value: '0', label: '정시' },
  { value: '5', label: '5분 전' },
  { value: '10', label: '10분 전' },
  { value: '30', label: '30분 전' },
  { value: '60', label: '1시간 전' },
]

// ─── types ────────────────────────────────────────────────

type ScheduleForm = {
  title: string
  date: string
  time: string
  endDate: string
  endTime: string
  isAllDay: boolean
  location: string
  repeatType: RepeatType
  repeatEndType: RepeatEndType
  repeatUntil: string
  repeatCount: string
  repeatUnit: string
  repeatValue: string
  alarmMinutes: string
}

type RepeatEditScope = 'this' | 'future' | 'all'

function defaultForm(): ScheduleForm {
  const now = new Date()
  const date = toDateStr(now)
  const h = String(now.getHours()).padStart(2, '0')
  const rawMin = now.getMinutes()
  const roundedMin = Math.ceil(rawMin / 15) * 15
  const minStr = String(roundedMin >= 60 ? 0 : roundedMin).padStart(2, '0')
  const time = `${h}:${minStr}`
  return {
    title: '', date, time, endDate: date, endTime: '',
    isAllDay: false, location: '',
    repeatType: 'none', repeatEndType: 'none',
    repeatUntil: '', repeatCount: '', repeatUnit: 'day', repeatValue: '1',
    alarmMinutes: '',
  }
}

function buildStartsAt(form: ScheduleForm) {
  return new Date(`${form.date}T${form.isAllDay ? '00:00' : form.time}:00`).toISOString()
}

function buildEndsAt(form: ScheduleForm): string | null {
  if (form.isAllDay) return null
  if (!form.endTime) return null
  return new Date(`${form.endDate || form.date}T${form.endTime}:00`).toISOString()
}

function formToInsert(form: ScheduleForm, userId: string, parentId?: string) {
  return {
    user_id: userId,
    title: form.title.trim(),
    starts_at: buildStartsAt(form),
    ends_at: buildEndsAt(form),
    is_all_day: form.isAllDay,
    location: form.location.trim() || null,
    repeat_type: form.repeatType,
    repeat_unit: form.repeatType === 'custom' ? form.repeatUnit : null,
    repeat_value: form.repeatType === 'custom' ? Number(form.repeatValue) || 1 : null,
    repeat_end_type: form.repeatType === 'none' ? 'none' : form.repeatEndType,
    repeat_until: form.repeatEndType === 'until' ? form.repeatUntil || null : null,
    repeat_count: form.repeatEndType === 'count' ? Number(form.repeatCount) || null : null,
    parent_schedule_id: parentId ?? null,
    alarm_minutes: form.alarmMinutes !== '' ? Number(form.alarmMinutes) : null,
  }
}

// ─── sub-components ───────────────────────────────────────

const INPUT = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-400 bg-white'
const SELECT = `${INPUT} text-gray-700`

function ScheduleFormPanel({
  form, onChange, onSave, onCancel, onDelete,
  isSaving, isDeleting, isEditing, error,
}: {
  form: ScheduleForm
  onChange: (f: ScheduleForm) => void
  onSave: () => void
  onCancel: () => void
  onDelete?: () => void
  isSaving: boolean
  isDeleting: boolean
  isEditing: boolean
  error: string
}) {
  const isRepeat = form.repeatType !== 'none'
  const DIVIDER = <div className="border-t border-gray-100" />
  const LABEL = 'text-xs text-gray-400 w-8 shrink-0 pt-3'

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-3">
      <input
        type="text" value={form.title} autoFocus
        onChange={(e) => onChange({ ...form, title: e.target.value })}
        placeholder="일정 제목" className={INPUT}
      />

      {/* 그룹 1: 날짜/시간 */}
      {DIVIDER}
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2 overflow-hidden">
          <span className={LABEL}>시작</span>
          <div className="flex gap-2 flex-1 overflow-hidden">
            <input
              type="date" value={form.date}
              onChange={(e) => onChange({ ...form, date: e.target.value })}
              className={`${INPUT} flex-[3] min-w-0`}
            />
            {!form.isAllDay && (
              <input
                type="time" value={form.time}
                onChange={(e) => onChange({ ...form, time: e.target.value })}
                className={`${INPUT} flex-[2] min-w-0`}
              />
            )}
          </div>
        </div>
        {!form.isAllDay && (
          <div className="flex items-start gap-2 overflow-hidden">
            <span className={LABEL}>종료</span>
            <div className="flex gap-2 flex-1 overflow-hidden">
              <input
                type="date" value={form.endDate}
                onChange={(e) => onChange({ ...form, endDate: e.target.value })}
                className={`${INPUT} flex-[3] min-w-0`}
              />
              <input
                type="time" value={form.endTime}
                onChange={(e) => onChange({ ...form, endTime: e.target.value })}
                className={`${INPUT} flex-[2] min-w-0`}
              />
            </div>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none pl-10">
          <input
            type="checkbox" checked={form.isAllDay}
            onChange={(e) => onChange({ ...form, isAllDay: e.target.checked })}
            className="w-4 h-4 accent-gray-800"
          />
          종일
        </label>
      </div>

      {/* 그룹 2: 반복 */}
      {DIVIDER}
      <div className="flex flex-col gap-2">
        <select
          value={form.repeatType}
          onChange={(e) => onChange({ ...form, repeatType: e.target.value as RepeatType, repeatEndType: 'none' })}
          className={SELECT}
        >
          {REPEAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {form.repeatType === 'custom' && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 shrink-0">매</span>
            <input
              type="number" min="1" value={form.repeatValue}
              onChange={(e) => onChange({ ...form, repeatValue: e.target.value })}
              className={`${INPUT} w-20 shrink-0`}
            />
            <select
              value={form.repeatUnit}
              onChange={(e) => onChange({ ...form, repeatUnit: e.target.value })}
              className={SELECT}
            >
              {REPEAT_UNIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}
        {isRepeat && (
          <>
            <select
              value={form.repeatEndType}
              onChange={(e) => onChange({ ...form, repeatEndType: e.target.value as RepeatEndType })}
              className={SELECT}
            >
              {REPEAT_END_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {form.repeatEndType === 'until' && (
              <input
                type="date" value={form.repeatUntil}
                onChange={(e) => onChange({ ...form, repeatUntil: e.target.value })}
                className={INPUT}
              />
            )}
            {form.repeatEndType === 'count' && (
              <div className="flex items-center gap-2">
                <input
                  type="number" min="1" value={form.repeatCount}
                  onChange={(e) => onChange({ ...form, repeatCount: e.target.value })}
                  className={`${INPUT} flex-1`}
                  placeholder="횟수"
                />
                <span className="text-sm text-gray-500 shrink-0">회</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* 그룹 3: 알림 */}
      {DIVIDER}
      <select
        value={form.alarmMinutes}
        onChange={(e) => onChange({ ...form, alarmMinutes: e.target.value })}
        className={SELECT}
      >
        {ALARM_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {/* 그룹 4: 메모 */}
      {DIVIDER}
      <input
        type="text" value={form.location}
        onChange={(e) => onChange({ ...form, location: e.target.value })}
        placeholder="메모 (선택사항)" className={INPUT}
      />

      {error && <p className="text-red-500 text-xs">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onSave}
          disabled={!form.title.trim() || !form.date || isSaving || isDeleting}
          className="flex-1 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
        >
          {isSaving ? '저장 중...' : isEditing ? '수정완료' : '추가'}
        </button>
        {isEditing && onDelete && (
          <button
            onClick={onDelete}
            disabled={isSaving || isDeleting}
            className="px-4 py-2.5 rounded-lg border border-red-200 text-red-500 text-sm disabled:opacity-50"
          >
            {isDeleting ? '삭제 중...' : '삭제'}
          </button>
        )}
        <button
          onClick={onCancel}
          disabled={isSaving || isDeleting}
          className="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm disabled:opacity-50"
        >
          취소
        </button>
      </div>
    </div>
  )
}

function OccurrenceCard({
  occ, onEdit,
}: {
  occ: ScheduleOccurrence
  onEdit: (occ: ScheduleOccurrence) => void
}) {
  const alarm = formatAlarm(occ.alarm_minutes)
  const repeatLabel = occ.is_recurring ? REPEAT_LABEL[occ.repeat_type] : null

  return (
    <div className="bg-white rounded-2xl px-4 py-3.5 shadow-sm flex items-start gap-3">
      <span className="w-2 h-2 rounded-full bg-orange-400 mt-1.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400 mb-0.5">
          {formatCardTime(occ.starts_at, occ.ends_at, occ.is_all_day, occ.occurrence_date)}
          {occ.is_exception && (
            <span className="ml-1.5 text-blue-400">수정됨</span>
          )}
        </p>
        <p className="text-sm font-medium text-gray-900">{occ.title}</p>
        <div className="flex flex-wrap gap-2 mt-1">
          {occ.location && <span className="text-xs text-gray-400">📍 {occ.location}</span>}
          {alarm && <span className="text-xs text-gray-400">🔔 {alarm}</span>}
          {repeatLabel && (
            <span className="text-xs text-blue-400 bg-blue-50 px-2 py-0.5 rounded-full">{repeatLabel}</span>
          )}
        </div>
      </div>
      <button
        onClick={() => onEdit(occ)}
        className="p-1.5 text-gray-300 hover:text-gray-600 shrink-0"
        aria-label="수정"
      >
        <EditIcon />
      </button>
    </div>
  )
}

// 반복 일정 수정/삭제 범위 선택 모달
function RepeatScopeModal({
  mode,
  onSelect,
  onCancel,
}: {
  mode: 'edit' | 'delete'
  onSelect: (scope: RepeatEditScope) => void
  onCancel: () => void
}) {
  const title = mode === 'edit' ? '이 반복 일정을 어떻게 수정할까요?' : '이 반복 일정을 어떻게 삭제할까요?'
  const options: { scope: RepeatEditScope; label: string }[] = [
    { scope: 'this', label: mode === 'edit' ? '이 일정만 수정' : '이 일정만 삭제' },
    { scope: 'future', label: mode === 'edit' ? '이 일정부터 이후 모두 수정' : '이 일정부터 이후 모두 삭제' },
    { scope: 'all', label: mode === 'edit' ? '전체 반복 일정 수정' : '전체 반복 일정 삭제' },
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative w-full max-w-sm bg-white rounded-t-2xl p-5 flex flex-col gap-3">
        <p className="text-sm font-semibold text-gray-900 text-center mb-1">{title}</p>
        {options.map(({ scope, label }) => (
          <button
            key={scope}
            onClick={() => onSelect(scope)}
            className="w-full py-3 rounded-lg border border-gray-200 text-sm text-gray-700 text-left px-4"
          >
            {label}
          </button>
        ))}
        <button
          onClick={onCancel}
          className="w-full py-3 rounded-lg bg-gray-100 text-sm text-gray-500 mt-1"
        >
          취소
        </button>
      </div>
    </div>
  )
}

// ─── page ─────────────────────────────────────────────────

export default function ScheduleListPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()

  const today = toDateStr(new Date())
  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate] = useState(today)
  const [activePreset, setActivePreset] = useState<'today' | 'week' | 'month' | null>('today')

  const applyPreset = (preset: 'today' | 'week' | 'month') => {
    const to = preset === 'today' ? today : preset === 'week' ? addDays(today, 7) : addDays(today, 30)
    setFromDate(today); setToDate(to); setActivePreset(preset)
  }

  type FormMode = 'none' | 'add' | 'edit'
  const [formMode, setFormMode] = useState<FormMode>('none')
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null)
  const [editingOccurrence, setEditingOccurrence] = useState<ScheduleOccurrence | null>(null)
  const [form, setForm] = useState<ScheduleForm>(defaultForm)
  const [formError, setFormError] = useState('')

  // 반복 일정 범위 선택 모달
  const [repeatModal, setRepeatModal] = useState<{ mode: 'edit' | 'delete' } | null>(null)

  // ─── queries ────────────────────────────────────────────

  const rangeStart = new Date(fromDate + 'T00:00:00')
  const rangeEnd = new Date(toDate + 'T23:59:59')

  // 기간 내 원본 schedules 조회 (반복 일정은 시작일이 기간 이전일 수 있으므로 넓게)
  // repeat 있는 것도 포함하기 위해 starts_at <= rangeEnd 조건만 사용
  const { data: schedules = [], isLoading: loadingSchedules } = useQuery<Schedule[]>({
    queryKey: ['schedules', fromDate, toDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schedules')
        .select('*')
        .lte('starts_at', `${toDate}T23:59:59`)
        .order('starts_at', { ascending: true })
      if (error) throw error
      return data
    },
  })

  const { data: exceptions = [] } = useQuery<ScheduleException[]>({
    queryKey: ['schedule_exceptions', fromDate, toDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schedule_exceptions')
        .select('*')
        .gte('occurrence_date', fromDate)
        .lte('occurrence_date', toDate)
      if (error) throw error
      return data
    },
  })

  // occurrence 계산 (클라이언트)
  const groups = (() => {
    const allOccs: ScheduleOccurrence[] = []
    for (const s of schedules) {
      const occs = expandScheduleOccurrences(s, rangeStart, rangeEnd)
      const exc = exceptions.filter((e) => e.schedule_id === s.id)
      allOccs.push(...applyScheduleExceptions(occs, exc))
    }
    return groupOccurrencesByDate(allOccs)
  })()

  const isLoading = loadingSchedules

  // ─── mutations ───────────────────────────────────────────

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['schedules'] })
    queryClient.invalidateQueries({ queryKey: ['schedule_exceptions'] })
  }

  const closeForm = () => {
    setFormMode('none'); setEditingScheduleId(null); setEditingOccurrence(null)
    setForm(defaultForm()); setFormError(''); setRepeatModal(null)
  }

  const { mutate: createSchedule, isPending: isCreating } = useMutation({
    mutationFn: async (f: ScheduleForm) => {
      const { data, error } = await supabase
        .from('schedules')
        .insert(formToInsert(f, user!.id))
        .select()
        .single()
      if (error) throw error
      return data as Schedule
    },
    onSuccess: (data) => {
      invalidate()
      closeForm()
      refreshScheduleNotifications(data).catch(console.error)
    },
    onError: (err) => {
      console.error('[schedule insert error]', err)
      setFormError((err as { message?: string })?.message ?? '추가에 실패했습니다.')
    },
  })

  const { mutate: updateScheduleAll, isPending: isUpdatingAll } = useMutation({
    mutationFn: async (f: ScheduleForm) => {
      const { data, error } = await supabase.from('schedules').update({
        title: f.title.trim(),
        starts_at: buildStartsAt(f),
        ends_at: buildEndsAt(f),
        is_all_day: f.isAllDay,
        location: f.location.trim() || null,
        repeat_type: f.repeatType,
        repeat_unit: f.repeatType === 'custom' ? f.repeatUnit : null,
        repeat_value: f.repeatType === 'custom' ? Number(f.repeatValue) || 1 : null,
        repeat_end_type: f.repeatType === 'none' ? 'none' : f.repeatEndType,
        repeat_until: f.repeatEndType === 'until' ? f.repeatUntil || null : null,
        repeat_count: f.repeatEndType === 'count' ? Number(f.repeatCount) || null : null,
        alarm_minutes: f.alarmMinutes !== '' ? Number(f.alarmMinutes) : null,
        updated_at: new Date().toISOString(),
      }).eq('id', editingScheduleId!).select().single()
      if (error) throw error
      return data as Schedule
    },
    onSuccess: (data) => {
      invalidate()
      closeForm()
      refreshScheduleNotifications(data).catch(console.error)
    },
    onError: (err) => {
      console.error('[schedule update error]', err)
      setFormError((err as { message?: string })?.message ?? '수정에 실패했습니다.')
    },
  })

  const { mutate: upsertException, isPending: isUpserting } = useMutation({
    mutationFn: async ({ f, occ }: { f: ScheduleForm; occ: ScheduleOccurrence }) => {
      const modifiedFields = {
        title: f.title.trim(),
        location: f.location.trim() || null,
        starts_at: buildStartsAt(f),
        ends_at: buildEndsAt(f),
        is_all_day: f.isAllDay,
        alarm_minutes: f.alarmMinutes !== '' ? Number(f.alarmMinutes) : null,
        updated_at: new Date().toISOString(),
      }
      if (occ.is_exception) {
        // 이미 exception 행이 있으면 UPDATE — original_starts_at/ends_at은 건드리지 않음
        const { error } = await supabase
          .from('schedule_exceptions')
          .update(modifiedFields)
          .eq('schedule_id', occ.schedule_id)
          .eq('occurrence_date', occ.occurrence_date)
        if (error) throw error
      } else {
        // 새 exception 행 INSERT
        const { error } = await supabase
          .from('schedule_exceptions')
          .insert({
            user_id: user!.id,
            schedule_id: occ.schedule_id,
            occurrence_date: occ.occurrence_date,
            exception_type: 'modified',
            original_starts_at: occ.starts_at,
            original_ends_at: occ.ends_at,
            ...modifiedFields,
          })
        if (error) throw error
      }
    },
    onSuccess: (_data, { occ }) => {
      invalidate()
      closeForm()
      // 이 일정만 수정: 원본 알림 취소 후 재등록은 생략 (exceptions 미반영 MVP 제한)
      cancelScheduleNotifications(occ.schedule_id).catch(console.error)
    },
    onError: (err) => {
      console.error('[exception upsert error]', err)
      setFormError((err as { message?: string })?.message ?? '수정에 실패했습니다.')
    },
  })

  const { mutate: splitAndUpdate, isPending: isSplitting } = useMutation({
    mutationFn: async ({ f, occ, origSchedule }: { f: ScheduleForm; occ: ScheduleOccurrence; origSchedule: Schedule }) => {
      const cutDate = getOccurrenceDateBefore(origSchedule, occ.occurrence_date)
      if (cutDate) {
        // 선택 occurrence 이전 날짜까지만 원본을 남김
        const { error: e1 } = await supabase.from('schedules').update({
          repeat_end_type: 'until',
          repeat_until: cutDate,
          repeat_count: null,
          updated_at: new Date().toISOString(),
        }).eq('id', origSchedule.id)
        if (e1) throw e1
      } else {
        // 선택 occurrence가 원본의 첫 번째 → 원본 삭제
        const { error: e1 } = await supabase.from('schedules').delete().eq('id', origSchedule.id)
        if (e1) throw e1
      }
      // 선택 occurrence부터 새 schedule 생성
      // 원본이 삭제된 경우(cutDate=null) parent_schedule_id는 null — 삭제된 행 참조 불가
      const { error: e2 } = await supabase.from('schedules').insert(
        formToInsert({ ...f, date: occ.occurrence_date, endDate: occ.occurrence_date }, user!.id, cutDate ? origSchedule.id : undefined)
      )
      if (e2) throw e2
    },
    onSuccess: (_data, { origSchedule }) => {
      invalidate()
      closeForm()
      // 원본 알림 취소 (새 schedule 알림은 invalidate 후 refetch 시 자동 처리되지 않으므로 생략)
      cancelScheduleNotifications(origSchedule.id).catch(console.error)
    },
    onError: (err) => {
      console.error('[schedule split error]', err)
      setFormError((err as { message?: string })?.message ?? '수정에 실패했습니다.')
    },
  })

  const { mutate: deleteScheduleFull, isPending: isDeletingFull } = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('schedules').delete().eq('id', editingScheduleId!)
      if (error) throw error
    },
    onSuccess: () => {
      const id = editingScheduleId
      invalidate()
      closeForm()
      if (id) cancelScheduleNotifications(id).catch(console.error)
    },
    onError: (err) => {
      console.error('[schedule delete error]', err)
      setFormError((err as { message?: string })?.message ?? '삭제에 실패했습니다.')
    },
  })

  const { mutate: cancelOccurrence, isPending: isCancelling } = useMutation({
    mutationFn: async (occ: ScheduleOccurrence) => {
      const payload = {
        user_id: user!.id,
        schedule_id: occ.schedule_id,
        occurrence_date: occ.occurrence_date,
        exception_type: 'cancelled' as const,
        original_starts_at: occ.starts_at,
        original_ends_at: occ.ends_at,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase
        .from('schedule_exceptions')
        .upsert(payload, { onConflict: 'schedule_id,occurrence_date' })
      if (error) throw error
    },
    onSuccess: () => { invalidate(); closeForm() },
    onError: (err) => {
      console.error('[cancel occurrence error]', err)
      setFormError((err as { message?: string })?.message ?? '삭제에 실패했습니다.')
    },
  })

  const { mutate: truncateFuture, isPending: isTruncating } = useMutation({
    mutationFn: async ({ scheduleId, occDate }: { scheduleId: string; occDate: string }) => {
      const origSchedule = schedules.find((s) => s.id === scheduleId)!
      const cutDate = getOccurrenceDateBefore(origSchedule, occDate)
      if (cutDate) {
        // 선택 occurrence 이전 날짜까지만 남김
        const { error } = await supabase.from('schedules').update({
          repeat_end_type: 'until',
          repeat_until: cutDate,
          repeat_count: null,
          updated_at: new Date().toISOString(),
        }).eq('id', scheduleId)
        if (error) throw error
      } else {
        // 선택 occurrence가 첫 번째 → schedule 전체 삭제
        const { error } = await supabase.from('schedules').delete().eq('id', scheduleId)
        if (error) throw error
      }
    },
    onSuccess: (_data, { scheduleId }) => {
      invalidate()
      closeForm()
      cancelScheduleNotifications(scheduleId).catch(console.error)
    },
    onError: (err) => {
      console.error('[truncate future error]', err)
      setFormError((err as { message?: string })?.message ?? '삭제에 실패했습니다.')
    },
  })

  const isSaving = isCreating || isUpdatingAll || isUpserting || isSplitting
  const isDeleting = isDeletingFull || isCancelling || isTruncating

  // ─── handlers ────────────────────────────────────────────

  const handleEditStart = (occ: ScheduleOccurrence) => {
    const orig = schedules.find((s) => s.id === occ.schedule_id)
    if (!orig) return
    setEditingScheduleId(occ.schedule_id)
    setEditingOccurrence(occ)
    // occurrence 데이터(수정된 시간 포함)로 폼을 채우고, 반복 설정은 원본에서 가져옴
    setForm(occurrenceToForm(occ, orig))
    setFormError('')
    setFormMode('edit')
  }

  const handleSave = () => {
    if (formMode === 'add') { createSchedule(form); return }
    const occ = editingOccurrence!
    if (!occ.is_recurring) { updateScheduleAll(form); return }
    setRepeatModal({ mode: 'edit' })
  }

  const handleDeleteRequest = () => {
    const occ = editingOccurrence!
    if (!occ.is_recurring) { deleteScheduleFull(); return }
    setRepeatModal({ mode: 'delete' })
  }

  const handleRepeatEditScope = (scope: RepeatEditScope) => {
    const occ = editingOccurrence!
    const origSchedule = schedules.find((s) => s.id === occ.schedule_id)!
    setRepeatModal(null)
    if (scope === 'all') {
      updateScheduleAll(form)
    } else if (scope === 'this') {
      upsertException({ f: form, occ })
    } else {
      splitAndUpdate({ f: form, occ, origSchedule })
    }
  }

  const handleRepeatDeleteScope = (scope: RepeatEditScope) => {
    const occ = editingOccurrence!
    setRepeatModal(null)
    if (scope === 'all') {
      deleteScheduleFull()
    } else if (scope === 'this') {
      cancelOccurrence(occ)
    } else {
      truncateFuture({ scheduleId: occ.schedule_id, occDate: occ.occurrence_date })
    }
  }

  // ─── render ───────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-x-hidden">
      {/* 반복 범위 선택 모달 */}
      {repeatModal && (
        <RepeatScopeModal
          mode={repeatModal.mode}
          onSelect={repeatModal.mode === 'edit' ? handleRepeatEditScope : handleRepeatDeleteScope}
          onCancel={() => setRepeatModal(null)}
        />
      )}

      {/* 헤더 */}
      <div className="bg-white flex items-center justify-between px-4 pt-6 pb-4 border-b border-gray-100">
        <h1 className="text-lg font-bold text-gray-900">일정</h1>
        <button
          onClick={() => { setForm(defaultForm()); setFormMode('add') }}
          disabled={formMode !== 'none'}
          className="text-sm text-gray-600 font-medium px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40"
        >
          + 추가
        </button>
      </div>

      {/* 날짜 범위 필터 */}
      <div className="bg-white border-b border-gray-100 p-4 flex flex-col gap-3">
        <div className="flex gap-2">
          {([['today', '오늘'], ['week', '일주'], ['month', '한달']] as const).map(([preset, label]) => (
            <button
              key={preset}
              onClick={() => applyPreset(preset)}
              className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                activePreset === preset
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-500 border-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 overflow-hidden">
          <input type="date" value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setActivePreset(null) }}
            className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400"
          />
          <span className="text-gray-400 text-sm shrink-0">~</span>
          <input type="date" value={toDate}
            onChange={(e) => { setToDate(e.target.value); setActivePreset(null) }}
            className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400"
          />
        </div>
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {formMode === 'add' && (
          <ScheduleFormPanel
            form={form} onChange={setForm}
            onSave={handleSave} onCancel={closeForm}
            isSaving={isSaving} isDeleting={isDeleting}
            isEditing={false} error={formError}
          />
        )}

        {isLoading && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}

        {!isLoading && groups.length === 0 && formMode === 'none' && (
          <div className="flex flex-col items-center justify-center py-16 gap-1">
            <p className="text-gray-400 text-sm">일정이 없습니다</p>
            <p className="text-gray-300 text-xs">해당 기간에 등록된 일정이 없어요</p>
          </div>
        )}

        {groups.map(({ date, occurrences }) => (
          <div key={date} className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-gray-500 px-1 pt-1">
              {formatDateHeader(date)}
            </p>
            {occurrences.map((occ) =>
              formMode === 'edit' && editingOccurrence?.occurrence_id === occ.occurrence_id ? (
                <ScheduleFormPanel
                  key={occ.occurrence_id}
                  form={form} onChange={setForm}
                  onSave={handleSave} onCancel={closeForm}
                  onDelete={handleDeleteRequest}
                  isSaving={isSaving} isDeleting={isDeleting}
                  isEditing error={formError}
                />
              ) : (
                <OccurrenceCard key={occ.occurrence_id} occ={occ} onEdit={handleEditStart} />
              )
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
