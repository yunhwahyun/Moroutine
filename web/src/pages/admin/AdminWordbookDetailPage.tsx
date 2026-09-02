import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getAdminPublicWordbook,
  getAdminPublicWords,
  updatePublicWordbook,
  createPublicWord,
  bulkCreatePublicWords,
} from '@/lib/publicWordbooks'
import { BackIcon } from '@/components/icons'
import Spinner from '@/components/ui/Spinner'
import type { PublicWordbookStatus } from '@/types'

const INPUT_CLASS = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-400'

// WordbookListPage.tsx의 추가 폼과 동일한 언어 옵션(2026-09-02).
const LANG_OPTIONS = [
  { value: '', label: '언어 선택 (선택사항)' },
  { value: 'en-ko', label: '영어' },
  { value: 'ja-ko', label: '일본어' },
  { value: 'zh-ko', label: '중국어' },
]

const STATUS_OPTIONS: { value: PublicWordbookStatus; label: string }[] = [
  { value: 'draft', label: '초안' },
  { value: 'default', label: '기본' },
  { value: 'published', label: '게시' },
  { value: 'archived', label: '보관' },
]

type ParsedWord = { term: string; definition: string; description: string }

// WordbookDetailPage.tsx의 parseWordsTxt와 동일한 규칙(탭 구분 .txt) — 개인 한도 관련 계산만 제외.
function parseWordsTxt(content: string): { parsed: ParsedWord[]; errorCount: number } {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0)
  const parsed: ParsedWord[] = []
  let errorCount = 0
  for (const line of lines) {
    const parts = line.split('\t')
    const term = parts[0]?.trim() ?? ''
    const definition = (parts[1]?.trim() ?? '').replace(/\\n/g, '\n')
    const description = (parts[2]?.trim() ?? '').replace(/\\n/g, '\n')
    if (term && definition) parsed.push({ term, definition, description })
    else errorCount++
  }
  return { parsed, errorCount }
}

export default function AdminWordbookDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [metaForm, setMetaForm] = useState<{ title: string; language: string } | null>(null)
  const [status, setStatus] = useState<PublicWordbookStatus | null>(null)

  const [newWord, setNewWord] = useState({ term: '', definition: '', description: '' })
  const [bulkPreview, setBulkPreview] = useState<{ parsed: ParsedWord[]; errorCount: number } | null>(null)
  const [bulkError, setBulkError] = useState('')
  const [isImporting, setIsImporting] = useState(false)

  const { data: wordbook, isLoading: isWordbookLoading } = useQuery({
    queryKey: ['admin', 'public-wordbook', id],
    queryFn: () => getAdminPublicWordbook(id!),
    enabled: !!id,
  })

  // TanStack Query v5는 useQuery의 onSuccess 콜백을 제거했으므로 데이터 도착 시 폼 초기값을
  // useEffect로 채운다. 이미 편집 중인 값을 덮어쓰지 않도록 최초 1회(!metaForm)만 반영한다.
  useEffect(() => {
    if (wordbook && !metaForm) {
      setMetaForm({ title: wordbook.title, language: wordbook.language })
      setStatus(wordbook.status)
    }
  }, [wordbook, metaForm])

  const { data: words = [], isLoading: isWordsLoading } = useQuery({
    queryKey: ['admin', 'public-words', id],
    queryFn: () => getAdminPublicWords(id!),
    enabled: !!id,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'public-wordbook', id] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'public-words', id] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'public-wordbooks'] })
  }

  const { mutate: saveMeta, isPending: isSavingMeta } = useMutation({
    mutationFn: () => {
      if (!id || !metaForm || !status) throw new Error('폼이 준비되지 않았습니다.')
      return updatePublicWordbook(id, {
        title: metaForm.title.trim(),
        language: metaForm.language,
        status,
      })
    },
    onSuccess: invalidate,
  })

  const { mutate: addWord, isPending: isAddingWord } = useMutation({
    mutationFn: () =>
      createPublicWord(id!, {
        term: newWord.term.trim(),
        definition: newWord.definition.trim(),
        description: newWord.description.trim() || null,
      }),
    onSuccess: () => {
      invalidate()
      setNewWord({ term: '', definition: '', description: '' })
    },
  })

  const handleBulkImportClick = () => {
    setBulkError('')
    setBulkPreview(null)
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const content = await file.text()
      const result = parseWordsTxt(content)
      if (result.parsed.length === 0) {
        setBulkError('등록할 단어가 없습니다. 형식을 확인해주세요.')
        return
      }
      setBulkPreview(result)
    } catch (err) {
      setBulkError((err as { message?: string })?.message ?? '파일을 읽는 중 오류가 발생했습니다.')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleConfirmBulkImport = async () => {
    if (!bulkPreview || !id) return
    setIsImporting(true)
    try {
      await bulkCreatePublicWords(
        id,
        bulkPreview.parsed.map((w) => ({ term: w.term, definition: w.definition, description: w.description || null })),
      )
      invalidate()
      setBulkPreview(null)
    } catch (err) {
      setBulkError((err as { message?: string })?.message ?? '일괄등록에 실패했습니다.')
    } finally {
      setIsImporting(false)
    }
  }

  if (isWordbookLoading || !metaForm || status === null) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="flex flex-col bg-gray-50">
      {/* 헤더 — WordbookDetailPage.tsx와 동일 톤 */}
      <div className="sticky top-0 z-10 bg-white flex items-center justify-between px-4 pt-3 pb-3 border-b border-gray-100">
        <button onClick={() => navigate('/admin/wordbooks')} className="p-1 -ml-1 text-gray-600" aria-label="뒤로">
          <BackIcon />
        </button>
        <h1 className="text-base font-semibold text-gray-900 truncate max-w-[160px]">
          {wordbook?.title ?? '단어장 상세'}
        </h1>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleBulkImportClick}
            className="text-xs text-gray-500 px-2.5 py-1.5 rounded-md border border-gray-200"
          >
            .txt 일괄등록
          </button>
        </div>
        <input ref={fileInputRef} type="file" accept=".txt" className="hidden" onChange={handleFileChange} />
      </div>

      <div className="flex-1 px-4 py-4 flex flex-col gap-3 pb-6">
        <div className="flex flex-col gap-2 bg-white rounded-2xl shadow-sm p-4">
          <input
            value={metaForm.title}
            onChange={(e) => setMetaForm({ ...metaForm, title: e.target.value })}
            placeholder="단어장 이름"
            className={`${INPUT_CLASS} font-medium`}
          />
          <select
            value={metaForm.language}
            onChange={(e) => setMetaForm({ ...metaForm, language: e.target.value })}
            className={`${INPUT_CLASS} bg-white text-gray-700`}
          >
            {LANG_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as PublicWordbookStatus)}
            className={`${INPUT_CLASS} bg-white text-gray-700`}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => saveMeta()}
            disabled={!metaForm.title.trim() || isSavingMeta}
            className="w-full py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
          >
            {isSavingMeta ? '저장 중...' : '저장'}
          </button>
        </div>

        <h2 className="text-sm font-bold text-gray-900 px-0.5">단어 목록</h2>

        {bulkError && <p className="text-xs text-red-500">{bulkError}</p>}

        {bulkPreview && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-2">
            <p className="text-sm font-semibold text-gray-900">일괄등록 미리보기</p>
            <p className="text-xs text-gray-600">
              등록 예정 {bulkPreview.parsed.length}개 · 오류 행 {bulkPreview.errorCount}개
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleConfirmBulkImport}
                disabled={isImporting}
                className="flex-1 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
              >
                {isImporting ? '등록 중...' : `${bulkPreview.parsed.length}개 등록`}
              </button>
              <button
                onClick={() => setBulkPreview(null)}
                className="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm"
              >
                취소
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 bg-white rounded-2xl shadow-sm p-4">
          <input
            value={newWord.term}
            onChange={(e) => setNewWord({ ...newWord, term: e.target.value })}
            placeholder="단어"
            className={INPUT_CLASS}
          />
          <textarea
            value={newWord.definition}
            onChange={(e) => setNewWord({ ...newWord, definition: e.target.value })}
            placeholder="뜻"
            rows={2}
            className={`${INPUT_CLASS} resize-none`}
          />
          <textarea
            value={newWord.description}
            onChange={(e) => setNewWord({ ...newWord, description: e.target.value })}
            placeholder="설명 (선택)"
            rows={2}
            className={`${INPUT_CLASS} resize-none`}
          />
          <button
            onClick={() => addWord()}
            disabled={!newWord.term.trim() || !newWord.definition.trim() || isAddingWord}
            className="w-full py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
          >
            {isAddingWord ? '추가 중...' : '단어 추가'}
          </button>
        </div>

        {isWordsLoading && (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}

        <div className="flex flex-col gap-3">
          {words.map((word) => (
            <div key={word.id} className="bg-white rounded-2xl shadow-sm p-4">
              <span className="text-sm font-semibold text-gray-900">{word.term}</span>
              <p className="text-xs text-gray-600 mt-1">{word.definition}</p>
              {word.description && <p className="text-xs text-gray-400 mt-1">{word.description}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
