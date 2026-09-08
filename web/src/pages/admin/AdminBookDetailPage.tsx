import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getAdminPublicBook,
  getAdminPublicBookChapters,
  updatePublicBook,
  createPublicBookChapter,
  bulkCreatePublicBookChapters,
} from '@/lib/publicBooks'
import { BackIcon } from '@/components/icons'
import Spinner from '@/components/ui/Spinner'
import type { PublicBookStatus } from '@/types'

const INPUT_CLASS = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-400'

const LANG_OPTIONS = [
  { value: '', label: '언어 선택 (선택사항)' },
  { value: 'en-ko', label: '영어' },
  { value: 'ja-ko', label: '일본어' },
  { value: 'zh-ko', label: '중국어' },
]

const STATUS_OPTIONS: { value: PublicBookStatus; label: string }[] = [
  { value: 'draft', label: '초안' },
  { value: 'published', label: '게시' },
  { value: 'archived', label: '보관' },
]

type ParsedChapter = { title: string; content: string }

// 단어장의 .txt 일괄등록과 다르다 — 한 파일 안에 탭 구분 여러 줄이 아니라, 파일 하나 = 목차 1개다.
// 제목은 파일명(확장자 제외), 내용은 파일 전체 텍스트. 파일명 순서(숫자 포함 자연 정렬)대로 등록.
async function parseChapterFiles(files: FileList): Promise<{ parsed: ParsedChapter[]; skippedCount: number }> {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  const parsed: ParsedChapter[] = []
  let skippedCount = 0
  for (const file of sorted) {
    const content = (await file.text()).trim()
    const title = file.name.replace(/\.txt$/i, '')
    if (content) parsed.push({ title, content })
    else skippedCount++
  }
  return { parsed, skippedCount }
}

export default function AdminBookDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [metaForm, setMetaForm] = useState<{ title: string; language: string } | null>(null)
  const [status, setStatus] = useState<PublicBookStatus | null>(null)

  const [newChapter, setNewChapter] = useState({ title: '', content: '' })
  const [bulkPreview, setBulkPreview] = useState<{ parsed: ParsedChapter[]; skippedCount: number } | null>(null)
  const [bulkError, setBulkError] = useState('')
  const [isImporting, setIsImporting] = useState(false)

  const { data: book, isLoading: isBookLoading } = useQuery({
    queryKey: ['admin', 'public-book', id],
    queryFn: () => getAdminPublicBook(id!),
    enabled: !!id,
  })

  // TanStack Query v5는 useQuery의 onSuccess 콜백을 제거했으므로 데이터 도착 시 폼 초기값을
  // useEffect로 채운다. 이미 편집 중인 값을 덮어쓰지 않도록 최초 1회(!metaForm)만 반영한다.
  useEffect(() => {
    if (book && !metaForm) {
      setMetaForm({ title: book.title, language: book.language ?? '' })
      setStatus(book.status)
    }
  }, [book, metaForm])

  const { data: chapters = [], isLoading: isChaptersLoading } = useQuery({
    queryKey: ['admin', 'public-book-chapters', id],
    queryFn: () => getAdminPublicBookChapters(id!),
    enabled: !!id,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'public-book', id] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'public-book-chapters', id] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'public-books'] })
  }

  const { mutate: saveMeta, isPending: isSavingMeta } = useMutation({
    mutationFn: () => {
      if (!id || !metaForm || !status) throw new Error('폼이 준비되지 않았습니다.')
      return updatePublicBook(id, {
        title: metaForm.title.trim(),
        language: metaForm.language || null,
        status,
      })
    },
    onSuccess: invalidate,
  })

  const { mutate: addChapter, isPending: isAddingChapter } = useMutation({
    mutationFn: () =>
      createPublicBookChapter(id!, {
        title: newChapter.title.trim(),
        content: newChapter.content.trim(),
      }),
    onSuccess: () => {
      invalidate()
      setNewChapter({ title: '', content: '' })
    },
  })

  const handleBulkImportClick = () => {
    setBulkError('')
    setBulkPreview(null)
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    try {
      const result = await parseChapterFiles(files)
      if (result.parsed.length === 0) {
        setBulkError('등록할 목차가 없습니다. 파일 내용을 확인해주세요.')
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
      await bulkCreatePublicBookChapters(id, bulkPreview.parsed)
      invalidate()
      setBulkPreview(null)
    } catch (err) {
      setBulkError((err as { message?: string })?.message ?? '일괄등록에 실패했습니다.')
    } finally {
      setIsImporting(false)
    }
  }

  if (isBookLoading || !metaForm || status === null) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="flex flex-col bg-gray-50">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-white flex items-center justify-between px-4 pt-3 pb-3 border-b border-gray-100">
        <button onClick={() => navigate('/admin/books')} className="p-1 -ml-1 text-gray-600" aria-label="뒤로">
          <BackIcon />
        </button>
        <h1 className="text-base font-semibold text-gray-900 truncate max-w-[160px]">
          {book?.title ?? '책 상세'}
        </h1>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleBulkImportClick}
            className="text-xs text-gray-500 px-2.5 py-1.5 rounded-md border border-gray-200"
          >
            .txt 일괄등록
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      <div className="flex-1 px-4 py-4 flex flex-col gap-3 pb-6">
        <div className="flex flex-col gap-2 bg-white rounded-2xl shadow-sm p-4">
          <input
            value={metaForm.title}
            onChange={(e) => setMetaForm({ ...metaForm, title: e.target.value })}
            placeholder="책 이름"
            className={`${INPUT_CLASS} font-medium`}
          />
          <div className="flex gap-2">
            <select
              value={metaForm.language}
              onChange={(e) => setMetaForm({ ...metaForm, language: e.target.value })}
              className={`${INPUT_CLASS} bg-white text-gray-700 flex-1`}
            >
              {LANG_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as PublicBookStatus)}
              className={`${INPUT_CLASS} bg-white text-gray-700 flex-1`}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => saveMeta()}
            disabled={!metaForm.title.trim() || isSavingMeta}
            className="w-full py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
          >
            {isSavingMeta ? '저장 중...' : '저장'}
          </button>
        </div>

        <h2 className="text-sm font-bold text-gray-900 px-0.5">목차 목록</h2>

        {bulkError && <p className="text-xs text-red-500">{bulkError}</p>}

        {bulkPreview && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col gap-2">
            <p className="text-sm font-semibold text-gray-900">일괄등록 미리보기</p>
            <p className="text-xs text-gray-600">
              등록 예정 {bulkPreview.parsed.length}개
              {bulkPreview.skippedCount > 0 && ` · 빈 파일 ${bulkPreview.skippedCount}개 제외`}
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
            value={newChapter.title}
            onChange={(e) => setNewChapter({ ...newChapter, title: e.target.value })}
            placeholder="제목"
            className={INPUT_CLASS}
          />
          <textarea
            value={newChapter.content}
            onChange={(e) => setNewChapter({ ...newChapter, content: e.target.value })}
            placeholder="내용"
            rows={6}
            className={`${INPUT_CLASS} resize-none`}
          />
          <button
            onClick={() => addChapter()}
            disabled={!newChapter.title.trim() || !newChapter.content.trim() || isAddingChapter}
            className="w-full py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
          >
            {isAddingChapter ? '추가 중...' : '목차 추가'}
          </button>
        </div>

        {isChaptersLoading && (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}

        <div className="flex flex-col gap-3">
          {chapters.map((chapter, i) => (
            <div key={chapter.id} className="bg-white rounded-2xl shadow-sm p-4">
              <span className="text-sm font-semibold text-gray-900">
                {i + 1}. {chapter.title}
              </span>
              <p className="text-xs text-gray-600 mt-1 line-clamp-3 whitespace-pre-wrap">{chapter.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
