import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTTS } from '@/hooks/useTTS'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { renderLineBreaks } from '@/lib/text'
import {
  expandScheduleOccurrences,
  applyScheduleExceptions,
  groupOccurrencesByDate,
  dateStr,
} from '@/lib/scheduleRepeat'
import { useTodayStudyWords, buildQuizWords, applyQuestionOrder } from '@/hooks/useStudyWords'
import { useSettingsStore } from '@/stores/settingsStore'
import { SpeakerIcon } from '@/components/icons'
import Spinner from '@/components/ui/Spinner'
import { STATUS_LABEL, STATUS_COLOR } from '@/lib/wordConstants'
import type { Schedule, ScheduleException, ScheduleOccurrence, Word } from '@/types'

// ─── helpers ────────────────────────────────────────────────────

function floorDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
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

function formatCardTime(startsAt: string, endsAt: string | null, isAllDay: boolean, occDate: string) {
  if (isAllDay) return '종일'
  const start = hhmm(startsAt)
  if (!endsAt) return start
  const endD = new Date(endsAt)
  const endDateStr = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`
  const end = hhmm(endsAt)
  if (endDateStr === occDate) return `${start} ~ ${end}`
  const ey = String(endD.getFullYear()).slice(2)
  const em = String(endD.getMonth() + 1).padStart(2, '0')
  const ed = String(endD.getDate()).padStart(2, '0')
  const ew = ['일', '월', '화', '수', '목', '금', '토'][endD.getDay()]
  return `${start} ~ ${ey}.${em}.${ed} (${ew}) ${end}`
}


// ─── schedule query ──────────────────────────────────────────────

async function fetchHomeSchedules(): Promise<ScheduleOccurrence[]> {
  const today = floorDay(new Date())
  const todayStr = dateStr(today)
  const rangeEnd = addDays(today, 30)
  const rangeEndStr = dateStr(rangeEnd)

  const [schedulesRes, exceptionsRes] = await Promise.all([
    supabase.from('schedules').select('*').lte('starts_at', rangeEnd.toISOString()),
    supabase.from('schedule_exceptions').select('*')
      .gte('occurrence_date', todayStr)
      .lte('occurrence_date', rangeEndStr),
  ])

  const schedules: Schedule[] = schedulesRes.data ?? []
  const exceptions: ScheduleException[] = exceptionsRes.data ?? []
  const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)

  const todayOccs: ScheduleOccurrence[] = []
  for (const s of schedules) {
    const occs = expandScheduleOccurrences(s, today, todayEnd)
    const exc = exceptions.filter((e) => e.schedule_id === s.id)
    todayOccs.push(...applyScheduleExceptions(occs, exc))
  }
  todayOccs.sort((a, b) => a.starts_at.localeCompare(b.starts_at))

  if (todayOccs.length >= 3) return todayOccs

  const tomorrowStart = addDays(today, 1)
  const futureOccs: ScheduleOccurrence[] = []
  for (const s of schedules) {
    const occs = expandScheduleOccurrences(s, tomorrowStart, rangeEnd)
    const exc = exceptions.filter((e) => e.schedule_id === s.id)
    futureOccs.push(...applyScheduleExceptions(occs, exc))
  }
  futureOccs.sort((a, b) => a.starts_at.localeCompare(b.starts_at))

  const needed = 3 - todayOccs.length
  return [...todayOccs, ...futureOccs.slice(0, needed)]
}

// ─── SwipeableWordCards ──────────────────────────────────────────

function SwipeableWordCards({ words }: { words: Word[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState(0)
  const { speak, isSupported } = useTTS()

  const handleScroll = () => {
    if (!scrollRef.current) return
    const idx = Math.round(scrollRef.current.scrollLeft / scrollRef.current.offsetWidth)
    setCurrent(idx)
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl px-5 pt-5 pb-4 shadow-sm">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
      >
        {words.map((word) => (
          <div key={word.id} className="flex-none w-full snap-start px-0.5">
            <div className="flex items-start justify-between mb-3">
              <span className={`inline-block text-xs rounded-full px-2.5 py-0.5 ${STATUS_COLOR[word.status] ?? STATUS_COLOR.unseen}`}>
                {STATUS_LABEL[word.status] ?? '미학습'}
              </span>
              {isSupported && (
                <button onClick={() => speak(word.term)} className="p-1 text-gray-400 hover:text-gray-700" aria-label="발음 듣기">
                  <SpeakerIcon />
                </button>
              )}
            </div>
            <p className="text-2xl font-bold text-gray-900 mb-1">{word.term}</p>
            <p className="text-gray-500 text-sm mb-2">{word.definition}</p>
            {word.description && (
              <p className="text-gray-400 text-xs pt-1">{renderLineBreaks(word.description)}</p>
            )}
          </div>
        ))}
      </div>
      {words.length > 1 && (
        <p className="text-center text-xs text-gray-400 mt-4">
          {current + 1}/{words.length}
        </p>
      )}
    </div>
  )
}

// ─── page ────────────────────────────────────────────────────────

export default function HomePage() {
  const navigate = useNavigate()
  const { settings } = useSettingsStore()

  const { data: rawStudyWords = [], isLoading: wordsLoading } = useTodayStudyWords()
  const studyWords = applyQuestionOrder(rawStudyWords, settings.questionOrder)

  const { data: scheduleItems = [], isLoading: schedulesLoading } = useQuery({
    queryKey: ['home_schedules'],
    queryFn: fetchHomeSchedules,
  })

  const handleLearnStart = () => {
    if (studyWords.length === 0) return
    navigate('/learn', {
      state: { targets: [{ type: 'review' }], words: studyWords },
    })
  }

  const handleQuizStart = () => {
    if (studyWords.length === 0) return
    navigate('/quiz', {
      state: {
        targets: [{ type: 'review' }],
        words: buildQuizWords(studyWords),
        wordData: studyWords,
      },
    })
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* 학습영역 섹션 */}
      <div className="bg-white px-4 pt-8 pb-6 flex flex-col gap-4">
        {wordsLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : studyWords.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm text-center py-8">
            <p className="text-gray-400 text-sm">오늘 학습할 단어가 없습니다</p>
            <p className="text-gray-300 text-xs mt-1">단어장에서 단어를 추가해보세요</p>
          </div>
        ) : (
          <SwipeableWordCards words={studyWords} />
        )}

        <button
          onClick={handleLearnStart}
          disabled={studyWords.length === 0}
          className="w-full py-3 rounded-lg border border-gray-200 text-gray-900 text-sm font-medium disabled:opacity-40"
        >
          학습하기
        </button>
        <button
          onClick={handleQuizStart}
          disabled={studyWords.length === 0}
          className="w-full py-3.5 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-40"
        >
          Quiz 시작하기
        </button>
      </div>

      {/* 일정 섹션 */}
      <div className="flex-1 bg-gray-50 px-4 pt-6 pb-4">
        {schedulesLoading && (
          <div className="flex justify-center py-6">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
          </div>
        )}
        <div className="flex flex-col gap-4">
          {groupOccurrencesByDate(scheduleItems).map(({ date, occurrences }) => (
            <div key={date} className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-gray-500 px-1">{formatDateHeader(date)}</p>
              {occurrences.map((occ) => (
                <div key={occ.occurrence_id} className="bg-white rounded-2xl px-4 py-3 flex items-start gap-3 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-orange-400 mt-1.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400">
                      {formatCardTime(occ.starts_at, occ.ends_at, occ.is_all_day, occ.occurrence_date)}
                    </p>
                    <p className="text-sm font-medium text-gray-900 mt-0.5">{occ.title}</p>
                  </div>
                </div>
              ))}
            </div>
          ))}
          {!schedulesLoading && scheduleItems.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">등록된 일정이 없습니다</p>
          )}
        </div>
      </div>
    </div>
  )
}
