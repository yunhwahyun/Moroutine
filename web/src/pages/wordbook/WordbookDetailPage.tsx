import { useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { renderLineBreaks } from '@/lib/text'
import { usePermissions } from '@/hooks/usePermissions'
import { getRepository } from '@/repositories/factory'
import { WordLimitExceededError } from '@/repositories/types'
import { parseWordsFile, type ParsedWord } from '@/lib/bulkWordsParse'
import { BackIcon, EditIcon } from '@/components/icons'
import Spinner from '@/components/ui/Spinner'
import type { Word, Wordbook } from '@/types'

type EditForm = { term: string; definition: string; example: string }
const EMPTY_FORM: EditForm = { term: '', definition: '', example: '' }

const INPUT_CLASS = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-400'
const TEXTAREA_CLASS = `${INPUT_CLASS} resize-none`

function FormFields({
  form,
  onChange,
  autoFocusTerm = false,
}: {
  form: EditForm
  onChange: (form: EditForm) => void
  autoFocusTerm?: boolean
}) {
  return (
    <>
      <input
        type="text"
        value={form.term}
        onChange={(e) => onChange({ ...form, term: e.target.value })}
        placeholder="단어"
        autoFocus={autoFocusTerm}
        className={`${INPUT_CLASS} font-medium`}
      />
      <textarea
        value={form.definition}
        onChange={(e) => onChange({ ...form, definition: e.target.value })}
        placeholder="뜻"
        rows={2}
        className={TEXTAREA_CLASS}
      />
      <textarea
        value={form.example}
        onChange={(e) => onChange({ ...form, example: e.target.value })}
        placeholder="예문 (선택사항)"
        rows={3}
        className={TEXTAREA_CLASS}
      />
    </>
  )
}

function FormActions({
  onSave,
  onCancel,
  isSaving,
  saveLabel,
  disabled,
}: {
  onSave: () => void
  onCancel: () => void
  isSaving: boolean
  saveLabel: string
  disabled: boolean
}) {
  return (
    <div className="flex gap-2 pt-1">
      <button
        onClick={onSave}
        disabled={disabled || isSaving}
        className="flex-1 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
      >
        {isSaving ? '저장 중...' : saveLabel}
      </button>
      <button onClick={onCancel} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm">
        취소
      </button>
    </div>
  )
}

type BulkPreview = {
  toRegister: ParsedWord[]
  currentTotal: number
  addCount: number
  duplicateCount: number
  errorCount: number
  limitValue: number | null
  expectedTotal: number
  canRegister: boolean
}

export default function WordbookDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { permissions } = usePermissions()
  const tier = permissions?.serviceTier ?? null
  const repository = tier && tier !== 'admin' ? getRepository(tier) : null
  const queryClient = useQueryClient()


  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_FORM)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newForm, setNewForm] = useState<EditForm>(EMPTY_FORM)
  const [newFormError, setNewFormError] = useState('')
  const [isCalculatingPreview, setIsCalculatingPreview] = useState(false)
  const [isRegisteringBulk, setIsRegisteringBulk] = useState(false)
  const [bulkPreview, setBulkPreview] = useState<BulkPreview | null>(null)
  const [bulkError, setBulkError] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: wordbook } = useQuery<Wordbook | null>({
    queryKey: ['wordbook', id, tier],
    queryFn: () => repository!.getWordbook(id!),
    enabled: !!id && !!repository,
  })

  const { data: words = [], isLoading } = useQuery<Word[]>({
    queryKey: ['words', id, tier],
    queryFn: () => repository!.getWords(id!),
    enabled: !!id && !!repository,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['words', id] })
    queryClient.invalidateQueries({ queryKey: ['wordbooks'] })
    queryClient.invalidateQueries({ queryKey: ['wordbook', id] })
    queryClient.invalidateQueries({ queryKey: ['personalWordCount'] })
  }

  // docs/SUBSCRIPTION_DESIGN.md §4 — canBulkImport 등급이 아니면 개별 등록만 허용(일괄등록 버튼은 아래에서 숨김).
  // 단건 등록도 Pro 한도 대상이라 create_words_checked RPC를 거치며, 초과 시 WordLimitExceededError가 던져진다.
  const { mutateAsync: createWord, isPending: isCreating } = useMutation({
    mutationFn: async (form: EditForm) => {
      await repository!.createWord({
        wordbookId: id!,
        term: form.term.trim(),
        definition: form.definition.trim(),
        example: form.example.trim() || null,
      })
    },
    onSuccess: () => {
      invalidate()
      setShowNewForm(false)
      setNewForm(EMPTY_FORM)
      setNewFormError('')
    },
    onError: (err) => {
      if (err instanceof WordLimitExceededError) {
        setNewFormError(`개인 단어 한도(${err.limitValue}개)에 도달했습니다. 현재 ${err.currentTotal}개.`)
      } else {
        console.error('[word create error]', err)
        setNewFormError((err as { message?: string })?.message ?? '등록에 실패했습니다.')
      }
    },
  })

  const { mutateAsync: updateWord, isPending: isUpdating } = useMutation({
    mutationFn: async ({ wordId, form }: { wordId: string; form: EditForm }) => {
      await repository!.updateWord(wordId, {
        term: form.term.trim(),
        definition: form.definition.trim(),
        example: form.example.trim() || null,
      })
    },
    onSuccess: () => {
      invalidate()
      setEditingId(null)
      setEditForm(EMPTY_FORM)
    },
  })

  // 2026-09-10 신설 — 단어 개별 삭제.
  const { mutate: removeWord, isPending: isRemovingWord } = useMutation({
    mutationFn: (wordId: string) => repository!.deleteWord(wordId),
    onSuccess: invalidate,
    onError: (err) => console.error('[word delete error]', err),
  })

  // "비우기" — 단어장은 유지, 단어만 전부 삭제.
  const { mutate: clearWords, isPending: isClearingWords } = useMutation({
    mutationFn: async () => {
      await Promise.all(words.map((w) => repository!.deleteWord(w.id)))
    },
    onSuccess: invalidate,
    onError: (err) => console.error('[wordbook clear words error]', err),
  })

  const handleClearWords = () => {
    if (words.length === 0) return
    if (!confirm(`이 단어장의 단어 ${words.length}개를 전부 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return
    clearWords()
  }

  const handleEditStart = (word: Word) => {
    setShowNewForm(false)
    setEditingId(word.id)
    setEditForm({ term: word.term, definition: word.definition, example: word.example ?? '' })
  }

  const handleAddStart = () => {
    setEditingId(null)
    setEditForm(EMPTY_FORM)
    setShowNewForm(true)
    setNewForm(EMPTY_FORM)
    setNewFormError('')
  }

  const handleBulkImport = () => {
    setBulkError('')
    setBulkPreview(null)
    fileInputRef.current?.click()
  }

  // docs/DESIGN.md §13 — 등록 전 미리보기: 현재 수/추가 예정/중복 제외/오류 행/등록 후 예상/한도/등록 가능 여부.
  // 최종 판정은 항상 서버(RPC)가 내리므로 여기서 계산한 canRegister는 UX 힌트일 뿐이다.
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsCalculatingPreview(true)
    setBulkError('')
    try {
      const content = await file.text()
      const { parsed, errorCount } = parseWordsFile(file.name, content)
      if (parsed.length === 0) {
        setBulkError('등록할 단어가 없습니다. 형식을 확인해주세요.')
        return
      }

      const existingKeys = new Set(words.map((w) => `${w.term} ${w.definition}`))
      const seen = new Set<string>()
      const toRegister: ParsedWord[] = []
      let duplicateCount = 0
      for (const w of parsed) {
        const key = `${w.term} ${w.definition}`
        if (existingKeys.has(key) || seen.has(key)) {
          duplicateCount++
          continue
        }
        seen.add(key)
        toRegister.push(w)
      }

      const currentTotal = await repository!.getPersonalWordCount()
      const limitValue = permissions?.personalWordLimit ?? null
      const expectedTotal = currentTotal + toRegister.length

      setBulkPreview({
        toRegister,
        currentTotal,
        addCount: toRegister.length,
        duplicateCount,
        errorCount,
        limitValue,
        expectedTotal,
        canRegister: toRegister.length > 0 && (limitValue === null || expectedTotal <= limitValue),
      })
    } catch (err) {
      console.error('[bulk preview error]', err)
      setBulkError((err as { message?: string })?.message ?? '파일을 읽는 중 오류가 발생했습니다.')
    } finally {
      setIsCalculatingPreview(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleCancelBulkPreview = () => {
    setBulkPreview(null)
    setBulkError('')
  }

  const handleConfirmBulkImport = async () => {
    if (!bulkPreview || !repository) return
    setIsRegisteringBulk(true)
    setBulkError('')
    try {
      const result = await repository.bulkCreateWords({
        wordbookId: id!,
        words: bulkPreview.toRegister.map((w) => ({
          term: w.term,
          definition: w.definition,
          example: w.example || null,
        })),
      })
      if (result.blocked) {
        // docs/SUBSCRIPTION_DESIGN.md §5-1 — Pro 한도 초과 시 신규 등록 차단. 클라이언트 사전 계산과
        // 서버 판정이 어긋날 수 있으므로(동시 등록 등) 서버 결과를 최종으로 신뢰한다.
        setBulkError(
          `개인 단어 한도(${result.limitValue}개)를 초과해 등록할 수 없습니다. 현재 ${result.currentTotal}개.`,
        )
        return
      }
      invalidate()
      setBulkPreview(null)
    } catch (err) {
      console.error('[bulk import error]', err)
      setBulkError((err as { message?: string })?.message ?? '일괄등록에 실패했습니다.')
    } finally {
      setIsRegisteringBulk(false)
    }
  }

  return (
    <div className="flex flex-col min-h-dvh bg-gray-50">
      {/* 헤더 */}
      <div
        className="sticky top-0 z-10 bg-white flex items-center justify-between px-4 pb-3 border-b border-gray-100"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <button onClick={() => navigate(-1)} className="p-1 -ml-1 text-gray-600" aria-label="뒤로">
          <BackIcon />
        </button>
        <h1 className="text-base font-semibold text-gray-900 truncate max-w-[160px]">
          {wordbook?.name ?? '단어장'}
        </h1>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* docs/DESIGN.md §13 — Guest에게는 일괄등록을 제공하지 않는다(Pro/Premium/Master만) */}
          {permissions?.canBulkImport && (
            <button
              onClick={handleBulkImport}
              disabled={isCalculatingPreview || showNewForm || !!editingId || !!bulkPreview}
              className="text-xs text-gray-500 px-2.5 py-1.5 rounded-md border border-gray-200 disabled:opacity-40"
            >
              {isCalculatingPreview ? '분석 중...' : '일괄등록'}
            </button>
          )}
          <button
            onClick={handleAddStart}
            disabled={showNewForm || !!editingId}
            className="text-xs text-gray-600 font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40"
          >
            + 추가
          </button>
          <button
            onClick={handleClearWords}
            disabled={words.length === 0 || isClearingWords}
            className="text-xs text-red-500 px-2.5 py-1.5 rounded-md border border-red-200 disabled:opacity-40"
          >
            {isClearingWords ? '비우는 중...' : '비우기'}
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={handleFileChange} />
      </div>

      {/* 일괄등록 에러 */}
      {bulkError && (
        <div className="bg-red-50 px-4 py-2.5 flex items-center justify-between">
          <p className="text-red-500 text-xs">{bulkError}</p>
          <button onClick={() => setBulkError('')} className="text-red-400 text-xs ml-3 shrink-0">닫기</button>
        </div>
      )}

      {/* 일괄등록 미리보기 — docs/DESIGN.md §13 요구 항목(현재 수/추가 예정/중복 제외/오류 행/등록 후 예상/한도/등록 가능 여부) */}
      {bulkPreview && (
        <div className="bg-white mx-4 mt-4 rounded-2xl border border-gray-200 p-4 flex flex-col gap-2">
          <p className="text-sm font-semibold text-gray-900 mb-1">일괄등록 미리보기</p>
          <div className="grid grid-cols-2 gap-y-1.5 text-xs text-gray-600">
            <span>현재 개인 단어 수</span><span className="text-right font-medium text-gray-900">{bulkPreview.currentTotal}개</span>
            <span>추가 예정</span><span className="text-right font-medium text-gray-900">{bulkPreview.addCount}개</span>
            <span>중복 제외</span><span className="text-right font-medium text-gray-900">{bulkPreview.duplicateCount}개</span>
            <span>오류 행</span><span className="text-right font-medium text-gray-900">{bulkPreview.errorCount}개</span>
            <span>등록 후 예상</span><span className="text-right font-medium text-gray-900">{bulkPreview.expectedTotal}개</span>
            <span>요금제 한도</span>
            <span className="text-right font-medium text-gray-900">{bulkPreview.limitValue === null ? '무제한' : `${bulkPreview.limitValue}개`}</span>
          </div>
          {!bulkPreview.canRegister && (
            <p className="text-red-500 text-xs mt-1">
              {bulkPreview.addCount === 0
                ? '새로 등록할 단어가 없습니다(전부 중복 또는 오류).'
                : `개인 단어 한도를 초과해 등록할 수 없습니다. Premium으로 업그레이드하면 무제한으로 등록할 수 있습니다.`}
            </p>
          )}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleConfirmBulkImport}
              disabled={!bulkPreview.canRegister || isRegisteringBulk}
              className="flex-1 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
            >
              {isRegisteringBulk ? '등록 중...' : `${bulkPreview.addCount}개 등록`}
            </button>
            <button
              onClick={handleCancelBulkPreview}
              disabled={isRegisteringBulk}
              className="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm disabled:opacity-50"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 단어 목록 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 pb-6">
        {isLoading && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}

        {!isLoading && words.length === 0 && !showNewForm && (
          <div className="flex flex-col items-center justify-center py-16 gap-1">
            <p className="text-gray-400 text-sm">단어가 없습니다</p>
            <p className="text-gray-300 text-xs">추가 버튼으로 시작해보세요</p>
          </div>
        )}

        {words.map((word, i) =>
          editingId === word.id ? (
            <div key={word.id} className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-3">
              <FormFields form={editForm} onChange={setEditForm} autoFocusTerm />
              <FormActions
                onSave={() => updateWord({ wordId: word.id, form: editForm })}
                onCancel={() => { setEditingId(null); setEditForm(EMPTY_FORM) }}
                isSaving={isUpdating}
                saveLabel="수정완료"
                disabled={!editForm.term.trim() || !editForm.definition.trim()}
              />
              <button
                onClick={() => {
                  if (!confirm(`"${word.term}" 단어를 삭제하시겠습니까?`)) return
                  removeWord(word.id)
                }}
                disabled={isRemovingWord}
                className="w-full py-2 rounded-lg border border-red-200 text-red-500 text-xs disabled:opacity-50"
              >
                {isRemovingWord ? '삭제 중...' : '이 단어 삭제'}
              </button>
            </div>
          ) : (
            <div key={word.id} className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-gray-300 mr-1.5">{i + 1}</span>
                  <span className="text-base font-bold text-gray-900">{word.term}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => handleEditStart(word)} className="p-2 text-gray-400 hover:text-gray-700" aria-label="수정">
                    <EditIcon />
                  </button>
                </div>
              </div>
              <p className="text-gray-600 text-sm mt-1.5 leading-relaxed">{renderLineBreaks(word.definition)}</p>
              {word.example && (
                <p className="text-gray-400 text-xs mt-1.5 leading-relaxed">
                  {renderLineBreaks(word.example)}
                </p>
              )}
            </div>
          )
        )}

        {showNewForm && (
          <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-3 border border-blue-100">
            <FormFields form={newForm} onChange={setNewForm} autoFocusTerm />
            {newFormError && <p className="text-red-500 text-xs">{newFormError}</p>}
            <FormActions
              onSave={() => createWord(newForm)}
              onCancel={() => { setShowNewForm(false); setNewForm(EMPTY_FORM); setNewFormError('') }}
              isSaving={isCreating}
              saveLabel="추가"
              disabled={!newForm.term.trim() || !newForm.definition.trim()}
            />
          </div>
        )}
      </div>
    </div>
  )
}
