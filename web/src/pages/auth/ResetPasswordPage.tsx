import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { translateAuthError } from '@/lib/authErrors'

type Status = 'checking' | 'denied' | 'form' | 'submitting' | 'success'

// 2026-09-10 — LoginPage의 "비밀번호를 잊으셨나요?" → resetPasswordForEmail() → 이 페이지로 도착.
// MasterAcceptPage와 동일하게 세션 확립은 클라이언트가 자동으로 처리한다(이 프로젝트는 flowType 기본값인
// implicit — URL 해시의 access_token을 자동 파싱). 다만 단순히 "세션이 있다"만 보고 폼을 열어주면,
// 이미 로그인된 사용자가 주소창에 이 URL을 직접 입력해도 통과하게 된다 — App.tsx의 AuthProvider가
// onAuthStateChange의 'PASSWORD_RECOVERY' 이벤트를 감지해 authStore.isPasswordRecovery로 남겨두므로,
// 그 값이 true일 때만("진짜 재설정 메일 링크로 들어온 경우") 폼을 연다.
export default function ResetPasswordPage() {
  const { user, isLoading: isAuthLoading, isPasswordRecovery, setPasswordRecovery } = useAuthStore()
  const [status, setStatus] = useState<Status>('checking')
  const [errorMessage, setErrorMessage] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    if (isAuthLoading) return
    setStatus(user && isPasswordRecovery ? 'form' : 'denied')
  }, [user, isAuthLoading, isPasswordRecovery])

  const handleSubmit = async () => {
    setErrorMessage('')
    if (password.length < 6) {
      setErrorMessage('비밀번호는 6자 이상이어야 합니다.')
      return
    }
    if (password !== confirmPassword) {
      setErrorMessage('비밀번호가 일치하지 않습니다.')
      return
    }

    setStatus('submitting')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setStatus('form')
      setErrorMessage(translateAuthError(error.message))
      return
    }
    setPasswordRecovery(false)
    setStatus('success')
    setTimeout(() => navigate('/', { replace: true }), 1500)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-6 bg-white text-center">
      {status === 'checking' && (
        <>
          <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin mb-4" />
          <p className="text-sm text-gray-500">확인하고 있어요...</p>
        </>
      )}

      {status === 'denied' && (
        <>
          <p className="text-sm text-gray-500 leading-relaxed mb-4">
            비밀번호 재설정 링크가 유효하지 않습니다.
            <br />
            이메일의 링크를 다시 확인해주세요.
          </p>
          <button onClick={() => navigate('/login')} className="text-sm text-gray-600 underline">
            로그인으로
          </button>
        </>
      )}

      {(status === 'form' || status === 'submitting') && (
        <div className="w-full max-w-sm text-left">
          <p className="text-base font-bold text-gray-900 mb-6 text-center">새 비밀번호 설정</p>

          <div className="flex flex-col gap-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="새 비밀번호 (6자 이상)"
              disabled={status === 'submitting'}
              className="w-full border border-gray-200 rounded-lg px-4 py-3.5 text-sm outline-none focus:border-gray-400"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="새 비밀번호 확인"
              disabled={status === 'submitting'}
              className="w-full border border-gray-200 rounded-lg px-4 py-3.5 text-sm outline-none focus:border-gray-400"
            />
          </div>

          {errorMessage && <p className="text-red-500 text-xs mt-3">{errorMessage}</p>}

          <button
            onClick={handleSubmit}
            disabled={!password || !confirmPassword || status === 'submitting'}
            className="w-full py-4 rounded-lg bg-gray-900 text-white text-sm font-medium mt-6 disabled:opacity-50"
          >
            {status === 'submitting' ? '처리 중...' : '비밀번호 변경하기'}
          </button>
        </div>
      )}

      {status === 'success' && <p className="text-base font-bold text-gray-900">비밀번호가 변경되었습니다</p>}
    </div>
  )
}
