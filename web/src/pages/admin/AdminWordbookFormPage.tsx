import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { createPublicWordbook } from '@/lib/publicWordbooks'
import type { PublicWordbookStatus } from '@/types'

const INPUT_CLASS = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-400'

// WordbookListPage.tsx의 추가 폼과 동일한 언어 옵션(2026-09-02, 사용자·관리자 필드 통일).
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

// docs/ADMIN_DESIGN.md §3-2(2026-09-02) — 사용자 WordbookListPage.tsx의 추가 폼과 동일하게
// 이름+언어만 받고, 여기에 상태(초안/기본/게시/보관) 선택을 더한다. 기존 설명/카테고리/난이도/
// 샘플 지정 체크박스는 제거(샘플 지정은 status='기본'으로 대체됨).
export default function AdminWordbookFormPage() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [language, setLanguage] = useState('')
  const [status, setStatus] = useState<PublicWordbookStatus>('draft')

  const { mutateAsync: create, isPending, error } = useMutation({
    mutationFn: () =>
      createPublicWordbook({
        title: title.trim(),
        language: language || 'en-ko',
        status,
      }),
    onSuccess: (wordbook) => navigate(`/admin/wordbooks/${wordbook.id}`),
  })

  return (
    <div className="min-h-dvh bg-gray-50 px-4 py-8">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">단어장 생성</h1>
          <Link to="/admin/wordbooks" className="text-sm text-gray-400">
            목록으로
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-col gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="단어장 이름"
            className={INPUT_CLASS}
          />
          <div className="flex gap-2">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
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
              onChange={(e) => setStatus(e.target.value as PublicWordbookStatus)}
              className={`${INPUT_CLASS} bg-white text-gray-700 flex-1`}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-xs text-red-500">{(error as { message?: string })?.message ?? '생성에 실패했습니다.'}</p>}

          <button
            onClick={() => create()}
            disabled={!title.trim() || isPending}
            className="w-full py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
          >
            {isPending ? '생성 중...' : '생성'}
          </button>
        </div>
      </div>
    </div>
  )
}
