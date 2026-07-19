import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePermissions } from '@/hooks/usePermissions'
import { getRepository } from '@/repositories/factory'
import { useTodayStudyWords, buildQuizWords, applyQuestionOrder } from '@/hooks/useStudyWords'
import { useSettingsStore } from '@/stores/settingsStore'
import { EditIcon, ChevronRightIcon } from '@/components/icons'
import Spinner from '@/components/ui/Spinner'
import type { Wordbook, SelectionTarget, Word } from '@/types'

const LANG_LABEL: Record<string, string> = {
  'en-ko': '영어',
  'ja-ko': '일본어',
  'zh-ko': '중국어',
}

const LANG_OPTIONS = [
  { value: '', label: '언어 선택 (선택사항)' },
  { value: 'en-ko', label: '영어' },
  { value: 'ja-ko', label: '일본어' },
  { value: 'zh-ko', label: '중국어' },
]

function formatCount(n: number): string {
  if (n < 1000) return String(n)
  return `${Math.round(n / 100) / 10}k`
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <div
      className={`w-5 h-5 rounded border-2 flex-none flex items-center justify-center transition-colors ${
        checked ? 'bg-gray-900 border-gray-900' : 'border-gray-200'
      }`}
    >
      {checked && (
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path
            d="M1 4L3.5 6.5L9 1"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  )
}

type WordbookWithStats = Wordbook & { mastered_count: number }

export default function WordbookListPage() {
  const navigate = useNavigate()
  const { permissions } = usePermissions()
  const tier = permissions?.serviceTier ?? null
  // Admin은 docs/ADMIN_DESIGN.md §6 결정 전까지 개인 단어장 기능을 사용하지 않는다.
  const repository = tier && tier !== 'admin' ? getRepository(tier) : null
  const queryClient = useQueryClient()

  const { settings } = useSettingsStore()
  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [formLanguage, setFormLanguage] = useState('')
  const [isActionLoading, setIsActionLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editLanguage, setEditLanguage] = useState('')

  const { data: todayWords = [] } = useTodayStudyWords()

  // docs/SUBSCRIPTION_DESIGN.md §10 — Pro 한도 초과 상태 UI. personalWordLimit이 null(무제한)이면 조회 자체를 스킵한다.
  const { data: personalWordCount } = useQuery({
    queryKey: ['personalWordCount', tier],
    queryFn: () => repository!.getPersonalWordCount(),
    enabled: !!repository && permissions?.personalWordLimit !== null,
  })

  const { data: wordbooks = [], isLoading } = useQuery<WordbookWithStats[]>({
    queryKey: ['wordbooks', tier],
    queryFn: async () => {
      const wordbookList = await repository!.getWordbooks()
      const withStats = await Promise.all(
        wordbookList.map(async (wb) => {
          const words = await repository!.getWords(wb.id)
          const mastered_count = words.filter((w) => w.status === 'reviewing' || w.status === 'mastered').length
          return { ...wb, mastered_count }
        }),
      )
      return withStats
    },
    enabled: !!repository,
  })

  const { mutateAsync: createWordbook, isPending, error: createError, reset: resetError } = useMutation({
    mutationFn: async ({ name, language }: { name: string; language: string | null }) => {
      return repository!.createWordbook({ name, language })
    },
    onSuccess: (data) => {
      queryClient.setQueryData<WordbookWithStats[]>(['wordbooks', tier], (old = []) => [
        { ...data, mastered_count: 0 },
        ...old,
      ])
      handleCancelForm()
    },
    onError: (err) => console.error('[wordbook insert error]', err),
  })

  const { mutate: deleteWordbook, isPending: isDeleting } = useMutation({
    mutationFn: async (id: string) => {
      await repository!.deleteWordbook(id)
    },
    onSuccess: (_, id) => {
      queryClient.setQueryData<WordbookWithStats[]>(['wordbooks', tier], (old = []) =>
        old.filter((wb) => wb.id !== id),
      )
      setEditingId(null)
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next })
    },
    onError: (err) => console.error('[wordbook delete error]', err),
  })

  const { mutate: updateWordbook, isPending: isUpdating } = useMutation({
    mutationFn: async ({ id, name, language }: { id: string; name: string; language: string | null }) => {
      await repository!.updateWordbook(id, { name, language })
    },
    onSuccess: (_, { id, name, language }) => {
      queryClient.setQueryData<WordbookWithStats[]>(['wordbooks', tier], (old = []) =>
        old.map((wb) => (wb.id === id ? { ...wb, name, language } : wb)),
      )
      setEditingId(null)
    },
    onError: (err) => console.error('[wordbook update error]', err),
  })

  const handleCancelForm = () => {
    setShowForm(false)
    setFormName('')
    setFormLanguage('')
  }

  const handleCreate = async () => {
    if (!formName.trim()) return
    await createWordbook({ name: formName.trim(), language: formLanguage || null })
  }

  const handleEditStart = (wb: WordbookWithStats) => {
    setEditingId(wb.id)
    setEditName(wb.name)
    setEditLanguage(wb.language ?? '')
  }

  const handleEditSave = () => {
    if (!editName.trim() || !editingId) return
    updateWordbook({ id: editingId, name: editName.trim(), language: editLanguage || null })
  }

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const fetchSelectedWords = async (): Promise<Word[]> => {
    const wordsMap = new Map<string, Word>()
    if (selectedIds.has('review')) {
      todayWords.forEach((w) => wordsMap.set(w.id, w))
    }
    const wordbookIds = [...selectedIds].filter((id) => id !== 'review')
    if (wordbookIds.length > 0 && repository) {
      const wordLists = await Promise.all(wordbookIds.map((id) => repository.getWords(id)))
      wordLists.flat().forEach((w: Word) => wordsMap.set(w.id, w))
    }
    return applyQuestionOrder([...wordsMap.values()], settings.questionOrder)
  }

  const buildTargets = (): SelectionTarget[] => [
    ...(selectedIds.has('review') ? [{ type: 'review' as const }] : []),
    ...[...selectedIds]
      .filter((id) => id !== 'review')
      .map((id) => ({ type: 'wordbook' as const, id })),
  ]

  const handleMultiLearn = async () => {
    if (selectedIds.size === 0 || isActionLoading) return
    setIsActionLoading(true)
    try {
      const words = await fetchSelectedWords()
      if (words.length === 0) return
      navigate('/learn', { state: { targets: buildTargets(), words } })
    } catch (err) {
      console.error('[multi learn error]', err)
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleMultiQuiz = async () => {
    if (selectedIds.size === 0 || isActionLoading) return
    setIsActionLoading(true)
    try {
      const words = await fetchSelectedWords()
      if (words.length === 0) return
      navigate('/quiz', {
        state: { targets: buildTargets(), words: buildQuizWords(words), wordData: words },
      })
    } catch (err) {
      console.error('[multi quiz error]', err)
    } finally {
      setIsActionLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="bg-white flex items-center justify-between px-4 pt-6 pb-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold text-gray-900">단어장</h1>
          {selectedIds.size > 0 && (
            <span className="text-xs text-gray-400">{selectedIds.size}개 선택됨</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {permissions?.canUsePublicWordbooks && (
            <button
              onClick={() => navigate('/public-wordbooks')}
              className="text-sm text-gray-500 font-medium px-3 py-1.5 rounded-lg border border-gray-200"
            >
              공용 단어장
            </button>
          )}
          <button
            onClick={() => setShowForm(true)}
            disabled={showForm || !!editingId}
            className="text-sm text-gray-600 font-medium px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40"
          >
            + 추가
          </button>
        </div>
      </div>

      {/* Pro 개인 단어 한도 현황 — docs/SUBSCRIPTION_DESIGN.md §10 */}
      {tier === 'pro' && permissions?.personalWordLimit !== null && personalWordCount !== undefined && (
        <div
          className={`px-4 py-2.5 flex items-center justify-between text-xs ${
            personalWordCount >= (permissions?.personalWordLimit ?? Infinity)
              ? 'bg-red-50 text-red-600'
              : 'bg-gray-50 text-gray-500'
          }`}
        >
          <span>
            개인 단어 {personalWordCount}/{permissions?.personalWordLimit}개
            {personalWordCount >= (permissions?.personalWordLimit ?? Infinity) && ' · 한도 도달, 신규 등록 불가'}
          </span>
          {personalWordCount >= (permissions?.personalWordLimit ?? Infinity) && (
            <button onClick={() => navigate('/pricing')} className="text-red-600 font-medium underline shrink-0 ml-2">
              Premium 업그레이드
            </button>
          )}
        </div>
      )}

      {/* 리스트 */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {/* 새 단어장 추가 폼 */}
        {showForm && (
          <div className="bg-white border border-gray-200 rounded-2xl p-4 flex flex-col gap-3">
            {createError ? (
              <>
                <p className="text-red-500 text-sm text-center py-1">
                  {(createError as { message?: string })?.message ?? '추가에 실패했습니다.'}
                </p>
                <button
                  onClick={() => { resetError(); setFormName(''); setFormLanguage('') }}
                  className="w-full py-2.5 rounded-lg border border-gray-200 text-gray-700 text-sm"
                >
                  다시 시도
                </button>
                <button
                  onClick={() => navigate('/')}
                  className="w-full py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium"
                >
                  메인으로 이동
                </button>
              </>
            ) : (
              <>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="단어장 이름"
                  autoFocus
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-400"
                />
                <select
                  value={formLanguage}
                  onChange={(e) => setFormLanguage(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-400 bg-white text-gray-700"
                >
                  {LANG_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={handleCreate}
                    disabled={!formName.trim() || isPending}
                    className="flex-1 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
                  >
                    {isPending ? '추가 중...' : '추가'}
                  </button>
                  <button
                    onClick={handleCancelForm}
                    className="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-700 text-sm"
                  >
                    취소
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}

        {!isLoading && wordbooks.length === 0 && !showForm && (
          <div className="flex flex-col items-center justify-center py-16 gap-1">
            <p className="text-gray-400 text-sm">단어장이 없습니다</p>
            <p className="text-gray-300 text-xs">추가 버튼으로 만들어보세요</p>
          </div>
        )}

        {/* 복습 단어모음 (가상 컬렉션) */}
        {!isLoading && todayWords.length > 0 && (
          <div
            className={`bg-white rounded-2xl shadow-sm flex items-center gap-3 px-4 py-4 cursor-pointer transition-shadow ${
              selectedIds.has('review') ? 'ring-2 ring-gray-900 ring-inset' : ''
            }`}
            onClick={() => toggleId('review')}
          >
            <Checkbox checked={selectedIds.has('review')} />
            <div className="flex-1">
              <p className="text-xs text-gray-400 mb-0.5">오늘의 복습 · 신규</p>
              <p className="text-sm font-semibold text-gray-900">복습 단어모음</p>
            </div>
            <span className="text-xs text-gray-500 font-medium">{todayWords.length}개</span>
          </div>
        )}

        {/* 단어장 목록 */}
        {wordbooks.map((wb) => (
          <div
            key={wb.id}
            className={`bg-white rounded-2xl shadow-sm overflow-hidden ${
              selectedIds.has(wb.id) ? 'ring-2 ring-gray-900 ring-inset' : ''
            }`}
          >
            {editingId === wb.id ? (
              /* 수정 폼 */
              <div className="p-4 flex flex-col gap-3">
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-400"
                />
                <select
                  value={editLanguage}
                  onChange={(e) => setEditLanguage(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-400 bg-white text-gray-700"
                >
                  {LANG_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={handleEditSave}
                    disabled={!editName.trim() || isUpdating || isDeleting}
                    className="flex-1 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
                  >
                    {isUpdating ? '저장 중...' : '수정완료'}
                  </button>
                  <button
                    onClick={() => editingId && deleteWordbook(editingId)}
                    disabled={isUpdating || isDeleting}
                    className="px-4 py-2.5 rounded-lg border border-red-200 text-red-500 text-sm disabled:opacity-50"
                  >
                    {isDeleting ? '삭제 중...' : '삭제'}
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    disabled={isUpdating || isDeleting}
                    className="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm disabled:opacity-50"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="flex items-center gap-3 px-4 py-4 cursor-pointer"
                onClick={() => toggleId(wb.id)}
              >
                <Checkbox checked={selectedIds.has(wb.id)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {wb.language && (
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                        {LANG_LABEL[wb.language] ?? wb.language}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      {formatCount(wb.mastered_count)}/{formatCount(wb.word_count)}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 mt-0.5 truncate">{wb.name}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleEditStart(wb) }}
                  className="p-1.5 text-gray-300 hover:text-gray-600"
                  aria-label="단어장 수정"
                >
                  <EditIcon size={14} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); navigate(`/wordbooks/${wb.id}`) }}
                  className="p-1 text-gray-300"
                  aria-label="단어장 상세"
                >
                  <ChevronRightIcon />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 선택 시 하단 액션바 */}
      {selectedIds.size > 0 && (
        <div className="px-4 py-3 bg-white border-t border-gray-100 flex gap-2">
          <button
            onClick={handleMultiLearn}
            disabled={isActionLoading}
            className="flex-1 py-3 rounded-lg border border-gray-200 text-sm text-gray-700 font-medium disabled:opacity-50"
          >
            {isActionLoading ? '로딩 중...' : '학습하기'}
          </button>
          <button
            onClick={handleMultiQuiz}
            disabled={isActionLoading}
            className="flex-1 py-3 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
          >
            {isActionLoading ? '로딩 중...' : '문제풀기'}
          </button>
        </div>
      )}
    </div>
  )
}
