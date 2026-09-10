import { useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePermissions } from '@/hooks/usePermissions'
import { getRepository } from '@/repositories/factory'
import { useAutoplayStore } from '@/stores/autoplayStore'
import { buildChapterAutoPlaySegments, buildChapterAutoPlayCaption } from '@/lib/bookAutoplaySegments'
import { BackIcon, EditIcon, PlayIcon } from '@/components/icons'
import Spinner from '@/components/ui/Spinner'
import type { Book, BookChapter } from '@/types'

const INPUT_CLASS = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-400'
const TEXTAREA_CLASS = `${INPUT_CLASS} resize-none`

type EditForm = { title: string; content: string }
const EMPTY_FORM: EditForm = { title: '', content: '' }

function FormFields({ form, onChange }: { form: EditForm; onChange: (f: EditForm) => void }) {
  return (
    <>
      <input
        type="text"
        value={form.title}
        onChange={(e) => onChange({ ...form, title: e.target.value })}
        placeholder="제목"
        className={`${INPUT_CLASS} font-medium`}
      />
      <textarea
        value={form.content}
        onChange={(e) => onChange({ ...form, content: e.target.value })}
        placeholder="내용"
        rows={6}
        className={TEXTAREA_CLASS}
      />
    </>
  )
}

type ParsedChapter = { title: string; content: string }

// AdminBookDetailPage.tsx와 동일한 규칙 — 단어장의 .txt 일괄등록(한 파일에 탭 구분 여러 줄)과
// 다르다. 여러 파일을 올리면 파일 하나 = 목차 1개, 제목은 파일명(확장자 제외), 파일명 순서
// (숫자 포함 자연 정렬)대로 등록한다.
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

// WordbookDetailPage.tsx와 동일한 톤 — 개인 책 하나의 목차를 관리한다. 학습/퀴즈/한도 검증이
// 없어 그쪽보다 단순하다(등급별 일괄등록 가능 여부만 canBulkImport로 게이트).
export default function BookDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { permissions } = usePermissions()
  const tier = permissions?.serviceTier ?? null
  const repository = tier && tier !== 'admin' ? getRepository(tier) : null
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm>(EMPTY_FORM)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newForm, setNewForm] = useState<EditForm>(EMPTY_FORM)
  const [bulkPreview, setBulkPreview] = useState<{ parsed: ParsedChapter[]; skippedCount: number } | null>(null)
  const [bulkError, setBulkError] = useState('')
  const [isImporting, setIsImporting] = useState(false)

  const { data: book } = useQuery<Book | null>({
    queryKey: ['book', id, tier],
    queryFn: () => repository!.getBook(id!),
    enabled: !!id && !!repository,
  })

  const { data: chapters = [], isLoading } = useQuery<BookChapter[]>({
    queryKey: ['book-chapters', id, tier],
    queryFn: () => repository!.getChapters(id!),
    enabled: !!id && !!repository,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['book-chapters', id] })
    queryClient.invalidateQueries({ queryKey: ['books'] })
    queryClient.invalidateQueries({ queryKey: ['book', id] })
  }

  const { mutate: addChapter, isPending: isAdding } = useMutation({
    mutationFn: () => repository!.createChapter({ bookId: id!, title: newForm.title.trim(), content: newForm.content.trim() }),
    onSuccess: () => {
      invalidate()
      setShowNewForm(false)
      setNewForm(EMPTY_FORM)
    },
  })

  const { mutate: updateChapter, isPending: isUpdating } = useMutation({
    mutationFn: ({ chapterId, form }: { chapterId: string; form: EditForm }) =>
      repository!.updateChapter(chapterId, { title: form.title.trim(), content: form.content.trim() }),
    onSuccess: () => {
      invalidate()
      setEditingId(null)
      setEditForm(EMPTY_FORM)
    },
  })

  const { mutate: deleteChapter, isPending: isDeleting } = useMutation({
    mutationFn: (chapterId: string) => repository!.deleteChapter(chapterId),
    onSuccess: () => {
      invalidate()
      setEditingId(null)
    },
  })

  // 2026-09-10 신설 — "비우기" — 책은 유지, 목차만 전부 삭제.
  const { mutate: clearChapters, isPending: isClearingChapters } = useMutation({
    mutationFn: async () => {
      await Promise.all(chapters.map((c) => repository!.deleteChapter(c.id)))
    },
    onSuccess: invalidate,
    onError: (err) => console.error('[book clear chapters error]', err),
  })

  const handleClearChapters = () => {
    if (chapters.length === 0) return
    if (!confirm(`이 책의 목차 ${chapters.length}개를 전부 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return
    clearChapters()
  }

  const handleEditStart = (chapter: BookChapter) => {
    setShowNewForm(false)
    setEditingId(chapter.id)
    setEditForm({ title: chapter.title, content: chapter.content })
  }

  const handleAddStart = () => {
    setEditingId(null)
    setShowNewForm(true)
    setNewForm(EMPTY_FORM)
  }

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
    if (!bulkPreview || !id || !repository) return
    setIsImporting(true)
    try {
      await repository.bulkCreateChapters({ bookId: id, chapters: bulkPreview.parsed })
      invalidate()
      setBulkPreview(null)
    } catch (err) {
      console.error('[book chapter bulk import error]', err)
      setBulkError((err as { message?: string })?.message ?? '일괄등록에 실패했습니다.')
    } finally {
      setIsImporting(false)
    }
  }

  const autoSupported = useAutoplayStore((s) => s.isSupported)
  const autoStart = useAutoplayStore((s) => s.start)

  const handleListen = (startIndex: number) => {
    if (chapters.length === 0) return
    autoStart(
      chapters.map((c) => ({
        term: c.title,
        caption: buildChapterAutoPlayCaption(c),
        segments: buildChapterAutoPlaySegments(c),
      })),
      { startIndex },
    )
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
          {book?.name ?? '책'}
        </h1>
        <div className="flex items-center gap-1.5 shrink-0">
          {permissions?.canBulkImport && (
            <button
              onClick={handleBulkImportClick}
              disabled={showNewForm || !!editingId || !!bulkPreview}
              className="text-xs text-gray-500 px-2.5 py-1.5 rounded-md border border-gray-200 disabled:opacity-40"
            >
              일괄등록
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
            onClick={handleClearChapters}
            disabled={chapters.length === 0 || isClearingChapters}
            className="text-xs text-red-500 px-2.5 py-1.5 rounded-md border border-red-200 disabled:opacity-40"
          >
            {isClearingChapters ? '비우는 중...' : '비우기'}
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

      {bulkError && (
        <div className="bg-red-50 px-4 py-2.5 flex items-center justify-between">
          <p className="text-red-500 text-xs">{bulkError}</p>
          <button onClick={() => setBulkError('')} className="text-red-400 text-xs ml-3 shrink-0">닫기</button>
        </div>
      )}

      {bulkPreview && (
        <div className="bg-white mx-4 mt-4 rounded-2xl border border-gray-200 p-4 flex flex-col gap-2">
          <p className="text-sm font-semibold text-gray-900">일괄등록 미리보기</p>
          <p className="text-xs text-gray-600">
            등록 예정 {bulkPreview.parsed.length}개
            {bulkPreview.skippedCount > 0 && ` · 빈 파일 ${bulkPreview.skippedCount}개 제외`}
          </p>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleConfirmBulkImport}
              disabled={isImporting}
              className="flex-1 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
            >
              {isImporting ? '등록 중...' : `${bulkPreview.parsed.length}개 등록`}
            </button>
            <button
              onClick={() => setBulkPreview(null)}
              disabled={isImporting}
              className="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm disabled:opacity-50"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 목차 목록 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 pb-6">
        {isLoading && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}

        {!isLoading && chapters.length === 0 && !showNewForm && (
          <div className="flex flex-col items-center justify-center py-16 gap-1">
            <p className="text-gray-400 text-sm">목차가 없습니다</p>
            <p className="text-gray-300 text-xs">추가 버튼으로 시작해보세요</p>
          </div>
        )}

        {chapters.map((chapter, i) =>
          editingId === chapter.id ? (
            <div key={chapter.id} className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-3">
              <FormFields form={editForm} onChange={setEditForm} />
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => updateChapter({ chapterId: chapter.id, form: editForm })}
                  disabled={!editForm.title.trim() || !editForm.content.trim() || isUpdating || isDeleting}
                  className="flex-1 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
                >
                  {isUpdating ? '저장 중...' : '수정완료'}
                </button>
                <button
                  onClick={() => deleteChapter(chapter.id)}
                  disabled={isUpdating || isDeleting}
                  className="px-4 py-2.5 rounded-lg border border-red-200 text-red-500 text-sm disabled:opacity-50"
                >
                  {isDeleting ? '삭제 중...' : '삭제'}
                </button>
                <button
                  onClick={() => { setEditingId(null); setEditForm(EMPTY_FORM) }}
                  disabled={isUpdating || isDeleting}
                  className="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm disabled:opacity-50"
                >
                  취소
                </button>
              </div>
            </div>
          ) : (
            <div key={chapter.id} className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-gray-300 mr-1.5">{i + 1}</span>
                  <span className="text-base font-bold text-gray-900">{chapter.title}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleListen(i)}
                    disabled={!autoSupported}
                    className="p-2 text-gray-400 hover:text-gray-700 disabled:opacity-40"
                    aria-label="듣기"
                  >
                    <PlayIcon size={15} />
                  </button>
                  <button onClick={() => handleEditStart(chapter)} className="p-2 text-gray-400 hover:text-gray-700" aria-label="수정">
                    <EditIcon />
                  </button>
                </div>
              </div>
              <p className="text-gray-600 text-sm mt-1.5 leading-relaxed whitespace-pre-wrap">{chapter.content}</p>
            </div>
          ),
        )}

        {showNewForm && (
          <div className="bg-white rounded-2xl p-4 shadow-sm flex flex-col gap-3 border border-blue-100">
            <FormFields form={newForm} onChange={setNewForm} />
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => addChapter()}
                disabled={!newForm.title.trim() || !newForm.content.trim() || isAdding}
                className="flex-1 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
              >
                {isAdding ? '저장 중...' : '추가'}
              </button>
              <button
                onClick={() => { setShowNewForm(false); setNewForm(EMPTY_FORM) }}
                className="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-600 text-sm"
              >
                취소
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
