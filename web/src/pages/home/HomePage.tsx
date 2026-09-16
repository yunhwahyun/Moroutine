import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTTS } from '@/hooks/useTTS'
import { useAutoplayStore } from '@/stores/autoplayStore'
import { useQuery } from '@tanstack/react-query'
import { getRepository } from '@/repositories/factory'
import type { DataRepository } from '@/repositories/types'
import { renderLineBreaks } from '@/lib/text'
import {
  expandScheduleOccurrences,
  applyScheduleExceptions,
  groupOccurrencesByDate,
} from '@/lib/scheduleRepeat'
import { formatDateShort, formatScheduleCardTime } from '@/lib/scheduleFormat'
import { useTodayStudyWords, buildQuizWords, applyQuestionOrder } from '@/hooks/useStudyWords'
import { useWordbooks } from '@/hooks/useWordbooks'
import { buildAutoPlaySegments, buildAutoPlayCaption } from '@/lib/autoplaySegments'
import { sourceTTSLang, sourceLangLabel } from '@/lib/ttsLang'
import { usePermissions } from '@/hooks/usePermissions'
import { useSettingsStore } from '@/stores/settingsStore'
import { SpeakerIcon, PlayIcon } from '@/components/icons'
import Spinner from '@/components/ui/Spinner'
import { STATUS_LABEL, STATUS_COLOR } from '@/lib/wordConstants'
import type { ScheduleOccurrence, Word } from '@/types'

// ─── helpers ────────────────────────────────────────────────────

function floorDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}



// ─── schedule query ──────────────────────────────────────────────

async function fetchHomeSchedules(repository: DataRepository): Promise<ScheduleOccurrence[]> {
  const today = floorDay(new Date())
  const rangeEnd = addDays(today, 30)

  const [schedules, exceptions] = await Promise.all([
    repository.getSchedules(),
    repository.getScheduleExceptions(),
  ])
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

// 언어별로 분기한 "오늘의 복습" 그룹 — 서로 다른 언어의 단어를 한 학습하기/퀴즈/자동재생
// 세션에 섞으면 어떤 언어를 기준으로 읽어야 할지 애매해진다(단어장 다중 선택은 애초에 같은
// 언어끼리만 고르게 막았지만, "오늘의 복습"은 사용자가 고를 수 없이 전체 단어장을 자동으로
// 모으므로 화면에서 언어별로 나눠 각자 학습하기/퀴즈/자동재생을 갖게 한다 — 사용자 확정,
// docs/DECISION_LOG.md 2026-09-16).
type ReviewGroup = { key: string; label: string; lang: string; words: Word[] }

function groupWordsByLanguage(words: Word[], wordbookRawLangMap: Map<string, string | null>): ReviewGroup[] {
  const groups = new Map<string, ReviewGroup>()
  for (const w of words) {
    const rawLang = wordbookRawLangMap.get(w.wordbook_id) ?? null
    const key = rawLang ?? ''
    let group = groups.get(key)
    if (!group) {
      group = { key, label: sourceLangLabel(rawLang), lang: sourceTTSLang(rawLang), words: [] }
      groups.set(key, group)
    }
    group.words.push(w)
  }
  return [...groups.values()]
}

// ─── ReviewWordPreview ────────────────────────────────────────────
// 예전엔 studyWords 전체를 가로 스와이프 슬라이드(scroll-snap)로 렌더링했는데, 오늘 복습할
// 단어가 많으면(100개 이상) 카드 100장 이상이 한 번에 DOM에 올라가 스크롤이 버벅이고 멈추는
// 문제가 있었다(실사용자 리포트) — 첫 단어 하나만 보여주고 나머지는 "+N" 카운트로만 표시한다.
// 학습하기/Quiz 시작/자동재생 시작은 이 미리보기와 무관하게 그룹(같은 언어) 전체 목록을 쓴다.
function ReviewWordPreview({ words, lang }: { words: Word[]; lang: string }) {
  const { speak, isSupported } = useTTS()
  if (words.length === 0) return null
  const word = words[0]
  const moreCount = words.length - 1

  return (
    <div className="bg-white border border-gray-100 rounded-2xl px-5 pt-5 pb-4 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <span className={`inline-block text-xs rounded-full px-2.5 py-0.5 ${STATUS_COLOR[word.status] ?? STATUS_COLOR.unseen}`}>
          {STATUS_LABEL[word.status] ?? '미학습'}
        </span>
        {isSupported && (
          <button onClick={() => speak(word.term, lang)} className="p-1 text-gray-400 hover:text-gray-700" aria-label="발음 듣기">
            <SpeakerIcon />
          </button>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900 mb-1">{word.term}</p>
      <p className="text-gray-500 text-sm mb-2">{word.definition}</p>
      {word.example && (
        <p className="text-gray-400 text-xs pt-1">{renderLineBreaks(word.example)}</p>
      )}
      {moreCount > 0 && (
        <p className="text-left text-xs text-gray-400 mt-4">+{moreCount}</p>
      )}
    </div>
  )
}

// 그룹(같은 언어) 하나의 미리보기 카드 + 학습하기/자동재생/Quiz 시작 버튼 묶음.
function ReviewGroupBlock({
  group, autoSupported, showLabel, onLearn, onQuiz, onAutoPlay,
}: {
  group: ReviewGroup
  autoSupported: boolean
  showLabel: boolean
  onLearn: (group: ReviewGroup) => void
  onQuiz: (group: ReviewGroup) => void
  onAutoPlay: (group: ReviewGroup) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      {showLabel && <p className="text-xs font-semibold text-gray-400 px-1">{group.label}</p>}
      <ReviewWordPreview words={group.words} lang={group.lang} />
      <div className="flex gap-2">
        <button
          onClick={() => onLearn(group)}
          className="flex-1 py-3 rounded-lg border border-gray-200 text-gray-900 text-sm font-medium"
        >
          학습하기
        </button>
        <button
          onClick={() => onAutoPlay(group)}
          disabled={!autoSupported}
          className="w-12 shrink-0 rounded-lg border border-gray-200 text-gray-900 flex items-center justify-center disabled:opacity-40"
          aria-label="자동재생 시작"
        >
          <PlayIcon size={20} />
        </button>
        <button
          onClick={() => onQuiz(group)}
          className="flex-1 py-3 rounded-lg bg-gray-900 text-white text-sm font-medium"
        >
          문제풀기
        </button>
      </div>
    </div>
  )
}

// ─── page ────────────────────────────────────────────────────────

export default function HomePage() {
  const navigate = useNavigate()
  const { settings } = useSettingsStore()
  const { permissions } = usePermissions()
  const tier = permissions?.serviceTier ?? null

  const { data: rawStudyWords = [], isLoading: wordsLoading } = useTodayStudyWords()
  // questionOrder가 'random'이면 매 호출마다 다시 섞이므로, 렌더될 때마다 새로 계산하면 자동재생이
  // 읽는 순서(시작 시점에 한 번 고정)와 화면에 보이는 순서가 어긋난다 — 입력이 바뀔 때만 재계산한다.
  const studyWords = useMemo(
    () => applyQuestionOrder(rawStudyWords, settings.questionOrder),
    [rawStudyWords, settings.questionOrder],
  )

  // "오늘의 복습"은 여러 단어장의 단어를 한데 섞으므로, 언어별로 묶어 각 그룹이 자기 언어로만
  // 학습하기/퀴즈/자동재생을 하게 나눈다(사용자 확정 — 중국어/일본어 단어장이 항상 영어 음성으로
  // 읽혔던 문제의 후속, docs/DECISION_LOG.md 2026-09-16). 단어장이 1개 언어뿐이면 그룹도
  // 하나라 예전과 동일하게 보인다.
  const { data: wordbooksForLang = [] } = useWordbooks()
  const wordbookRawLangMap = useMemo(
    () => new Map(wordbooksForLang.map((wb) => [wb.id, wb.language])),
    [wordbooksForLang],
  )
  const reviewGroups = useMemo(
    () => groupWordsByLanguage(studyWords, wordbookRawLangMap),
    [studyWords, wordbookRawLangMap],
  )

  const autoSupported = useAutoplayStore((s) => s.isSupported)
  const autoStart = useAutoplayStore((s) => s.start)

  // 이 버튼은 재생/일시정지를 토글하지 않는다 — 항상 첫 단어(설정의 "단어 순서" 기준)부터 새로
  // 재생 시작만 하고, 재생/일시정지 전환은 미니 플레이어(GlobalAutoPlayBar) 쪽 버튼에서만 한다.
  const handleAutoPlayStart = (group: ReviewGroup) => {
    if (group.words.length === 0) return
    autoStart(
      group.words.map((w) => ({ term: w.term, caption: buildAutoPlayCaption(w), segments: buildAutoPlaySegments(w, group.lang) })),
    )
  }

  const scheduleRepository = tier && tier !== 'admin' ? getRepository(tier) : null

  const { data: scheduleItems = [], isLoading: schedulesLoading } = useQuery({
    queryKey: ['home_schedules', tier],
    queryFn: () => fetchHomeSchedules(scheduleRepository!),
    enabled: !!scheduleRepository,
  })

  const handleLearnStart = (group: ReviewGroup) => {
    if (group.words.length === 0) return
    navigate('/learn', {
      state: { targets: [{ type: 'review' }], words: group.words },
    })
  }

  const handleQuizStart = (group: ReviewGroup) => {
    if (group.words.length === 0) return
    navigate('/quiz', {
      state: {
        targets: [{ type: 'review' }],
        words: buildQuizWords(group.words),
        wordData: group.words,
      },
    })
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* 학습영역 섹션 */}
      <div className="bg-white px-4 pt-8 pb-6 flex flex-col gap-6">
        {wordsLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : reviewGroups.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm text-center py-8">
            <p className="text-gray-400 text-sm">오늘 학습할 단어가 없습니다</p>
            <p className="text-gray-300 text-xs mt-1">단어장에서 단어를 추가해보세요</p>
          </div>
        ) : (
          reviewGroups.map((group) => (
            <ReviewGroupBlock
              key={group.key}
              group={group}
              autoSupported={autoSupported}
              showLabel={reviewGroups.length > 1}
              onLearn={handleLearnStart}
              onQuiz={handleQuizStart}
              onAutoPlay={handleAutoPlayStart}
            />
          ))
        )}
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
              <p className="text-xs font-semibold text-gray-500 px-1">{formatDateShort(date)}</p>
              {occurrences.map((occ) => (
                <div key={occ.occurrence_id} className="bg-white rounded-2xl px-4 py-3 flex items-start gap-3 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-orange-400 mt-1.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400">
                      {formatScheduleCardTime(occ)}
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
