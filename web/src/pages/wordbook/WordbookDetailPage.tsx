import { useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { renderLineBreaks } from '@/lib/text'
import { useAuthStore } from '@/stores/authStore'
import { BackIcon, EditIcon } from '@/components/icons'
import Spinner from '@/components/ui/Spinner'
import type { Word, Wordbook } from '@/types'

type EditForm = { term: string; definition: string; description: string }
const EMPTY_FORM: EditForm = { term: '', definition: '', description: '' }

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
        value={form.description}
        onChange={(e) => onChange({ ...form, description: e.target.value })}
        placeholder="설명 (선택사항)"
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

function parseWordsTxt(content: string): Array<{ term: string; definition: string; description: string }> {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split('\t')
      const term = parts[0]?.trim() ?? ''
      const definition = (parts[1]?.trim() ?? '').replace(/\\n/g, '\n')
      const description = (parts[2]?.trim() ?? '').replace(/\\n/g, '\n')
      return { term, definition, description }
    })
    .filter((w) => w.term && w.definition)
}

export default function WordbookDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const queryClient = useQueryClient()


  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_FORM)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newForm, setNewForm] = useState<EditForm>(EMPTY_FORM)
  const [isBulkImporting, setIsBulkImporting] = useState(false)
  const [bulkError, setBulkError] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: wordbook } = useQuery<Wordbook>({
    queryKey: ['wordbook', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('wordbooks').select('*').eq('id', id!).single()
      if (error) throw error
      return data
    },
    enabled: !!id,
  })

  const { data: words = [], isLoading } = useQuery<Word[]>({
    queryKey: ['words', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('words')
        .select('*')
        .eq('wordbook_id', id!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
    enabled: !!id,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['words', id] })
    queryClient.invalidateQueries({ queryKey: ['wordbooks'] })
    queryClient.invalidateQueries({ queryKey: ['wordbook', id] })
  }

  const { mutateAsync: createWord, isPending: isCreating } = useMutation({
    mutationFn: async (form: EditForm) => {
      const { error } = await supabase.from('words').insert({
        wordbook_id: id!,
        user_id: user!.id,
        term: form.term.trim(),
        definition: form.definition.trim(),
        description: form.description.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      setShowNewForm(false)
      setNewForm(EMPTY_FORM)
    },
  })

  const { mutateAsync: updateWord, isPending: isUpdating } = useMutation({
    mutationFn: async ({ wordId, form }: { wordId: string; form: EditForm }) => {
      const { error } = await supabase
        .from('words')
        .update({
          term: form.term.trim(),
          definition: form.definition.trim(),
          description: form.description.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', wordId)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      setEditingId(null)
      setEditForm(EMPTY_FORM)
    },
  })

  const handleEditStart = (word: Word) => {
    setShowNewForm(false)
    setEditingId(word.id)
    setEditForm({ term: word.term, definition: word.definition, description: word.description ?? '' })
  }

  const handleAddStart = () => {
    setEditingId(null)
    setEditForm(EMPTY_FORM)
    setShowNewForm(true)
    setNewForm(EMPTY_FORM)
  }

  const handleBulkImport = () => {
    setBulkError('')
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsBulkImporting(true)
    setBulkError('')
    try {
      const content = await file.text()
      const parsed = parseWordsTxt(content)
      if (parsed.length === 0) {
        setBulkError('등록할 단어가 없습니다. 형식을 확인해주세요.')
        return
      }
      const { error } = await supabase.from('words').insert(
        parsed.map((w) => ({
          wordbook_id: id!,
          user_id: user!.id,
          term: w.term,
          definition: w.definition,
          description: w.description || null,
        }))
      )
      if (error) throw error
      invalidate()
    } catch (err) {
      console.error('[bulk import error]', err)
      setBulkError((err as { message?: string })?.message ?? '일괄등록에 실패했습니다.')
    } finally {
      setIsBulkImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col min-h-dvh bg-gray-50">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-white flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button onClick={() => navigate(-1)} className="p-1 -ml-1 text-gray-600" aria-label="뒤로">
          <BackIcon />
        </button>
        <h1 className="text-base font-semibold text-gray-900 truncate max-w-[160px]">
          {wordbook?.name ?? '단어장'}
        </h1>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleBulkImport}
            disabled={isBulkImporting || showNewForm || !!editingId}
            className="text-xs text-gray-500 px-2.5 py-1.5 rounded-md border border-gray-200 disabled:opacity-40"
          >
            {isBulkImporting ? '등록 중...' : '일괄등록'}
          </button>
          <button
            onClick={handleAddStart}
            disabled={showNewForm || !!editingId}
            className="text-xs text-gray-600 font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40"
          >
            + 추가
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept=".txt" className="hidden" onChange={handleFileChange} />
      </div>

      {/* 일괄등록 에러 */}
      {bulkError && (
        <div className="bg-red-50 px-4 py-2.5 flex items-center justify-between">
          <p className="text-red-500 text-xs">{bulkError}</p>
          <button onClick={() => setBulkError('')} className="text-red-400 text-xs ml-3 shrink-0">닫기</button>
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
              {word.description && (
                <p className="text-gray-400 text-xs mt-1.5 leading-relaxed">
                  {renderLineBreaks(word.description)}
                </p>
              )}
            </div>
          )
        )}

        {showNewForm && (
          <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-3 border border-blue-100">
            <FormFields form={newForm} onChange={setNewForm} autoFocusTerm />
            <FormActions
              onSave={() => createWord(newForm)}
              onCancel={() => { setShowNewForm(false); setNewForm(EMPTY_FORM) }}
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
