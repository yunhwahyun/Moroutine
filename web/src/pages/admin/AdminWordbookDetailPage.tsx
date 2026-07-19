import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getAdminPublicWordbook,
  getAdminPublicWords,
  updatePublicWordbook,
  createPublicWord,
  bulkCreatePublicWords,
  archivePublicWord,
} from '@/lib/publicWordbooks'
import Spinner from '@/components/ui/Spinner'
import type { Difficulty, PublicWordbookStatus } from '@/types'

const INPUT_CLASS = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-400'

const DIFFICULTY_OPTIONS: { value: Difficulty; label: string }[] = [
  { value: 'beginner', label: '초급' },
  { value: 'intermediate', label: '중급' },
  { value: 'advanced', label: '고급' },
]

const STATUS_OPTIONS: { value: PublicWordbookStatus; label: string }[] = [
  { value: 'draft', label: '초안' },
  { value: 'published', label: '게시됨' },
  { value: 'hidden', label: '숨김' },
  { value: 'archived', label: '보관됨' },
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
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [metaForm, setMetaForm] = useState<{
    title: string
    description: string
    category: string
    difficulty: Difficulty
    language: string
  } | null>(null)
  const [status, setStatus] = useState<PublicWordbookStatus | null>(null)
  const [isSample, setIsSample] = useState(false)

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
      setMetaForm({
        title: wordbook.title,
        description: wordbook.description ?? '',
        category: wordbook.category ?? '',
        difficulty: wordbook.difficulty,
        language: wordbook.language,
      })
      setStatus(wordbook.status)
      setIsSample(wordbook.is_sample)
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
        description: metaForm.description.trim() || null,
        category: metaForm.category.trim() || null,
        difficulty: metaForm.difficulty,
        language: metaForm.language,
        status,
        is_sample: isSample,
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

  const { mutate: archiveWord } = useMutation({
    mutationFn: (wordId: string) => archivePublicWord(wordId),
    onSuccess: invalidate,
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
    <div className="min-h-dvh bg-white px-6 py-8">
      <div className="max-w-lg mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">단어장 상세</h1>
          <Link to="/admin/wordbooks" className="text-sm text-gray-400">
            목록으로
          </Link>
        </div>

        <div className="flex flex-col gap-2 border border-gray-100 rounded-lg p-4">
          <input
            value={metaForm.title}
            onChange={(e) => setMetaForm({ ...metaForm, title: e.target.value })}
            className={`${INPUT_CLASS} font-medium`}
          />
          <textarea
            value={metaForm.description}
            onChange={(e) => setMetaForm({ ...metaForm, description: e.target.value })}
            rows={2}
            placeholder="설명"
            className={`${INPUT_CLASS} resize-none`}
          />
          <input
            value={metaForm.category}
            onChange={(e) => setMetaForm({ ...metaForm, category: e.target.value })}
            placeholder="카테고리"
            className={INPUT_CLASS}
          />
          <div className="flex gap-2">
            <select
              value={metaForm.difficulty}
              onChange={(e) => setMetaForm({ ...metaForm, difficulty: e.target.value as Difficulty })}
              className={`${INPUT_CLASS} bg-white flex-1`}
            >
              {DIFFICULTY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as PublicWordbookStatus)}
              className={`${INPUT_CLASS} bg-white flex-1`}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={isSample} onChange={(e) => setIsSample(e.target.checked)} />
            샘플 단어장으로 지정 (게스트에게 기본 제공)
          </label>
          <button
            onClick={() => saveMeta()}
            disabled={!metaForm.title.trim() || isSavingMeta}
            className="w-full py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
          >
            {isSavingMeta ? '저장 중...' : '저장'}
          </button>
        </div>

        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-900">단어 목록</h2>
          <button
            onClick={handleBulkImportClick}
            className="text-xs text-gray-600 px-2.5 py-1.5 rounded-md border border-gray-200"
          >
            .txt 일괄등록
          </button>
          <input ref={fileInputRef} type="file" accept=".txt" className="hidden" onChange={handleFileChange} />
        </div>

        {bulkError && <p className="text-xs text-red-500">{bulkError}</p>}

        {bulkPreview && (
          <div className="border border-gray-200 rounded-lg p-4 flex flex-col gap-2">
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

        <div className="flex flex-col gap-2 border border-gray-100 rounded-lg p-4">
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
            <div key={word.id} className="border border-gray-100 rounded-lg p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold text-gray-900">{word.term}</span>
                {word.status === 'archived' ? (
                  <span className="text-xs text-gray-400 shrink-0">보관됨</span>
                ) : (
                  <button
                    onClick={() => archiveWord(word.id)}
                    className="text-xs text-red-500 shrink-0"
                  >
                    보관
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-600 mt-1">{word.definition}</p>
              {word.description && <p className="text-xs text-gray-400 mt-1">{word.description}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
