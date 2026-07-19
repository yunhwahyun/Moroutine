import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePermissions } from '@/hooks/usePermissions'
import { useAuthStore } from '@/stores/authStore'
import {
  getPublishedPublicWordbooks,
  getEnrolledWordbookIds,
  enrollPublicWordbook,
  unenrollPublicWordbook,
} from '@/lib/publicWordbooks'
import Spinner from '@/components/ui/Spinner'

// docs/ADMIN_DESIGN.md §3 — Pro/Premium/Master 전용, Guest는 애초에 접근 불가.
// docs/UI_FLOW.md "공용 단어장" — 원안은 단어장 화면 내 탭이지만 이번 세션은 별도 화면 + 링크로 단순화.
export default function PublicWordbookListPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { permissions } = usePermissions()
  const queryClient = useQueryClient()

  const canUse = permissions?.canUsePublicWordbooks ?? false

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

  const invalidateEnrollments = () => {
    queryClient.invalidateQueries({ queryKey: ['public-wordbook-enrollments', user?.id] })
  }

  const { mutate: enroll, isPending: isEnrolling } = useMutation({
    mutationFn: (wordbookId: string) => enrollPublicWordbook(user!.id, wordbookId),
    onSuccess: invalidateEnrollments,
  })

  const { mutate: unenroll, isPending: isUnenrolling } = useMutation({
    mutationFn: (wordbookId: string) => unenrollPublicWordbook(user!.id, wordbookId),
    onSuccess: invalidateEnrollments,
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
      <div className="bg-white px-4 pt-6 pb-4 border-b border-gray-100">
        <h1 className="text-lg font-bold text-gray-900">공용 단어장</h1>
      </div>

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
          const isEnrolled = enrolledIds?.has(wb.id) ?? false
          return (
            <div key={wb.id} className="bg-white rounded-2xl shadow-sm p-4">
              <button className="text-left w-full" onClick={() => navigate(`/public-wordbooks/${wb.id}`)}>
                <div className="flex items-center gap-2">
                  {wb.category && (
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{wb.category}</span>
                  )}
                  <span className="text-xs text-gray-400">단어 {wb.word_count}개</span>
                </div>
                <p className="text-sm font-semibold text-gray-900 mt-1">{wb.title}</p>
                {wb.description && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{wb.description}</p>}
              </button>
              <button
                onClick={() => (isEnrolled ? unenroll(wb.id) : enroll(wb.id))}
                disabled={isEnrolling || isUnenrolling}
                className={`mt-3 w-full py-2 rounded-lg text-xs font-medium disabled:opacity-50 ${
                  isEnrolled ? 'border border-gray-200 text-gray-600' : 'bg-gray-900 text-white'
                }`}
              >
                {isEnrolled ? '담기 해제' : '내 단어장에 담기'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
