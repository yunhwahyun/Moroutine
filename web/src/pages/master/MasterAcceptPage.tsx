import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

type Status = 'checking' | 'accepting' | 'success' | 'no-session' | 'error'

// docs/MASTER_INVITATION_DESIGN.md §4-3 편차(2026-07-18) — 자체 토큰 없이, 초대/매직 링크 클릭으로
// 이미 확립된 세션만으로 master-accept를 호출한다. 비밀번호 설정 단계는 없음(LoginPage의 매직 링크
// 로그인으로 항상 재로그인 가능하므로 비밀번호가 필수가 아님).
export default function MasterAcceptPage() {
  const { user, isLoading: isAuthLoading } = useAuthStore()
  const [status, setStatus] = useState<Status>('checking')
  const [errorMessage, setErrorMessage] = useState('')
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (isAuthLoading) return
    if (!user) {
      setStatus('no-session')
      return
    }

    let cancelled = false
    setStatus('accepting')
    supabase.functions.invoke('master-accept').then(({ data, error }) => {
      if (cancelled) return
      if (error || !data?.success) {
        setStatus('error')
        setErrorMessage(error?.message ?? '초대 수락에 실패했습니다.')
        return
      }
      queryClient.invalidateQueries({ queryKey: ['permissions', user.id] })
      setStatus('success')
      setTimeout(() => navigate('/', { replace: true }), 1500)
    })

    return () => {
      cancelled = true
    }
  }, [user, isAuthLoading, navigate, queryClient])

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-6 bg-white text-center">
      {(status === 'checking' || status === 'accepting') && (
        <>
          <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin mb-4" />
          <p className="text-sm text-gray-500">초대를 확인하고 있어요...</p>
        </>
      )}
      {status === 'no-session' && (
        <p className="text-sm text-gray-500 leading-relaxed">
          초대 링크가 유효하지 않습니다.
          <br />
          이메일의 링크를 다시 확인해주세요.
        </p>
      )}
      {status === 'success' && <p className="text-base font-bold text-gray-900">Master 권한이 부여되었습니다</p>}
      {status === 'error' && <p className="text-sm text-red-500 leading-relaxed">{errorMessage}</p>}
    </div>
  )
}
