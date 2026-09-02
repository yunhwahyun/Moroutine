import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePermissions } from '@/hooks/usePermissions'
import { useAuthStore } from '@/stores/authStore'
import { getRepository } from '@/repositories/factory'
import {
  getPublishedPublicWordbooks,
  getEnrolledWordbookIds,
  enrollPublicWordbook,
  getPublicWords,
} from '@/lib/publicWordbooks'
import { BackIcon } from '@/components/icons'
import Spinner from '@/components/ui/Spinner'
import type { PublicWordbook } from '@/types'

// WordbookListPage.tsx의 LANG_OPTIONS와 동일한 값 집합. 이보다 예전에 관리자가 'en-US' 같은 구 방식
// 코드로 만들어 둔 공용 단어장을 복사할 때, 그 값을 그대로 넘기면 사용자 화면에서 "en-US"가 그대로
// 노출된다(LANG_LABEL에 매핑이 없어 원본 문자열로 폴백) — 알 수 없는 값이면 비워서 복사한다.
const VALID_LANGUAGES = new Set(['en-ko', 'ja-ko', 'zh-ko'])

// docs/ADMIN_DESIGN.md §3 — Pro/Premium/Master 전용, Guest는 애초에 접근 불가.
// docs/DECISION_LOG.md 2026-09-02 — "담기"는 열람 등록(enrollment) 토글이 아니라, 공용 단어장을
// 사용자의 개인 wordbooks/words로 실제 복사하는 동작이다. 복사된 뒤에는 원본과 완전히 분리된
// 개인 단어장이 되어(자유롭게 수정/삭제/추가), 원본이 나중에 수정돼도 더 이상 반영되지 않는다.
// 버튼은 항상 눌러서 다시 담을 수 있다(실수로 삭제했거나 다시 받고 싶은 경우) — 이미 담은 적이
// 있으면 제목 옆에 체크 배지만 표시하고 user_public_wordbook_enrollments에는 중복 삽입하지 않는다.
export default function PublicWordbookListPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { permissions } = usePermissions()
  const tier = permissions?.serviceTier ?? null
  const repository = tier && tier !== 'admin' ? getRepository(tier) : null
  const queryClient = useQueryClient()

  const canUse = permissions?.canUsePublicWordbooks ?? false
  const [addError, setAddError] = useState('')

  const { data: wordbooks = [], isLoading } = useQuery({
    queryKey: ['public-wordbooks'],
    queryFn: getPublishedPublicWordbooks,
    enabled: canUse,
  })

  const { data: enrolledIds } = useQuery({
    queryKey: ['public-wordbook-enrollments', user?.id],
    queryFn: () => getEnrolledWordbookIds(user!.id),
    enabled: canUse && !!user,
  })

  const { mutate: addToMyWordbooks, isPending: isAdding, variables: addingWordbook } = useMutation({
    mutationFn: async (wb: PublicWordbook) => {
      if (!repository || !user) throw new Error('사용할 수 없습니다.')
      const publicWords = await getPublicWords(wb.id)
      const language = VALID_LANGUAGES.has(wb.language) ? wb.language : null
      const newWordbook = await repository.createWordbook({ name: wb.title, language })

      if (publicWords.length > 0) {
        const result = await repository.bulkCreateWords({
          wordbookId: newWordbook.id,
          words: publicWords.map((w) => ({ term: w.term, definition: w.definition, description: w.description })),
        })
        if (result.blocked) {
          await repository.deleteWordbook(newWordbook.id)
          throw new Error(
            `개인 단어 한도(${result.limitValue}개)를 초과해 추가할 수 없습니다. 현재 ${result.currentTotal}개.`,
          )
        }
      }

      if (!enrolledIds?.has(wb.id)) {
        await enrollPublicWordbook(user.id, wb.id)
      }
      return newWordbook
    },
    onSuccess: (newWordbook) => {
      queryClient.invalidateQueries({ queryKey: ['public-wordbook-enrollments', user?.id] })
      queryClient.invalidateQueries({ queryKey: ['wordbooks'] })
      navigate(`/wordbooks/${newWordbook.id}`)
    },
    onError: (err) => {
      console.error('[public wordbook add error]', err)
      setAddError((err as { message?: string })?.message ?? '추가에 실패했습니다.')
    },
  })

  if (!canUse) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-6 gap-3 text-center">
        <p className="text-sm font-semibold text-gray-900">Pro/Premium/Master 전용 기능입니다</p>
        <p className="text-xs text-gray-400">공용 단어장은 요금제를 업그레이드하면 이용할 수 있어요.</p>
        <button
          onClick={() => navigate('/pricing')}
          className="mt-2 px-4 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium"
        >
          요금제 보기
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white px-4 pt-6 pb-4 border-b border-gray-100 flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="p-1 -ml-1 text-gray-600" aria-label="뒤로">
          <BackIcon />
        </button>
        <h1 className="text-lg font-bold text-gray-900">공용 단어장</h1>
      </div>

      {addError && (
        <div className="bg-red-50 px-4 py-2.5 flex items-center justify-between">
          <p className="text-red-500 text-xs">{addError}</p>
          <button onClick={() => setAddError('')} className="text-red-400 text-xs ml-3 shrink-0">닫기</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {isLoading && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}

        {!isLoading && wordbooks.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-16">공개된 공용 단어장이 없습니다</p>
        )}

        {wordbooks.map((wb) => {
          const isAdded = enrolledIds?.has(wb.id) ?? false
          const isAddingThis = isAdding && addingWordbook?.id === wb.id
          return (
            <div key={wb.id} className="bg-white rounded-2xl shadow-sm p-4">
              <button className="text-left w-full" onClick={() => navigate(`/public-wordbooks/${wb.id}`)}>
                <span className="text-xs text-gray-400">단어 {wb.word_count}개</span>
                <p className="text-sm font-semibold text-gray-900 mt-1 flex items-center gap-1.5">
                  {wb.title}
                  {isAdded && (
                    <span
                      className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-900 shrink-0"
                      aria-label="추가됨"
                    >
                      <svg width="8" height="6" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  )}
                </p>
              </button>
              <button
                onClick={() => addToMyWordbooks(wb)}
                disabled={isAdding}
                className="mt-3 w-full py-2 rounded-lg text-xs font-medium bg-gray-900 text-white disabled:opacity-50"
              >
                {isAddingThis ? '추가 중...' : '내 단어장에 추가'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
