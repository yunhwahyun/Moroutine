import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { createPublicWordbook } from '@/lib/publicWordbooks'
import type { Difficulty } from '@/types'

const INPUT_CLASS = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-gray-400'

const DIFFICULTY_OPTIONS: { value: Difficulty; label: string }[] = [
  { value: 'beginner', label: '초급' },
  { value: 'intermediate', label: '중급' },
  { value: 'advanced', label: '고급' },
]

export default function AdminWordbookFormPage() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty>('beginner')
  const [language, setLanguage] = useState('en-US')

  const { mutateAsync: create, isPending, error } = useMutation({
    mutationFn: () =>
      createPublicWordbook({
        title: title.trim(),
        description: description.trim() || null,
        category: category.trim() || null,
        difficulty,
        language,
      }),
    onSuccess: (wordbook) => navigate(`/admin/wordbooks/${wordbook.id}`),
  })

  return (
    <div className="min-h-dvh bg-white px-6 py-8">
      <div className="max-w-lg mx-auto flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900">공용 단어장 생성</h1>
          <Link to="/admin/wordbooks" className="text-sm text-gray-400">
            목록으로
          </Link>
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목"
          className={INPUT_CLASS}
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="설명 (선택)"
          rows={3}
          className={`${INPUT_CLASS} resize-none`}
        />
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="카테고리 (선택)"
          className={INPUT_CLASS}
        />
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as Difficulty)}
          className={`${INPUT_CLASS} bg-white`}
        >
          {DIFFICULTY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <input
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          placeholder="언어 코드 (예: en-US)"
          className={INPUT_CLASS}
        />

        {error && <p className="text-xs text-red-500">{(error as { message?: string })?.message ?? '생성에 실패했습니다.'}</p>}

        <button
          onClick={() => create()}
          disabled={!title.trim() || isPending}
          className="w-full py-3 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
        >
          {isPending ? '생성 중...' : '생성'}
        </button>
      </div>
    </div>
  )
}
