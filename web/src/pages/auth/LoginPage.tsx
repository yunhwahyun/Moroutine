import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { markSignupPending } from '@/lib/signupFlow'

type Mode = 'login' | 'signup' | 'magic'

// Supabase Auth(GoTrue)가 돌려주는 영문 에러 메시지를 한국어로 옮긴다. 여기 없는 메시지는 원문을
// 그대로 보여준다(완전히 새로운 문구를 오역해서 보여주는 것보다, 못 알아보는 원문이 낫다는 판단).
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'Invalid login credentials': '이메일 또는 비밀번호가 올바르지 않습니다.',
  'Email not confirmed': '이메일 인증이 완료되지 않았습니다. 받은 메일함을 확인해주세요.',
  'User already registered': '이미 가입된 이메일입니다. 로그인해주세요.',
  'Password should be at least 6 characters': '비밀번호는 6자 이상이어야 합니다.',
  'Unable to validate email address: invalid format': '이메일 형식이 올바르지 않습니다.',
  'Signup requires a valid password': '올바른 비밀번호를 입력해주세요.',
  'Email rate limit exceeded': '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
  'Database error saving new user': '회원가입 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
}

function translateAuthError(message: string): string {
  return AUTH_ERROR_MESSAGES[message] ?? message
}

export default function LoginPage() {
  const { user } = useAuthStore()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to="/" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      if (mode === 'magic') {
        // emailRedirectTo를 명시하지 않으면 Supabase Dashboard의 Site URL(기본값이 localhost일 수
        // 있음)로 보내버린다 — 항상 지금 접속 중인 실제 주소로 돌아오도록 명시한다. 단, Dashboard의
        // Authentication → URL Configuration → Redirect URLs 허용 목록에 이 주소가 등록돼 있어야
        // Supabase가 실제로 받아준다(안 그러면 여전히 Site URL로 폴백됨).
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin },
        })
        if (error) throw error
        setMessage('이메일을 확인하세요. 로그인 링크를 보냈습니다.')
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        })
        if (error) throw error
        // 이미 가입(인증 완료)된 이메일로 회원가입을 시도하면 Supabase는 계정 존재 여부를 노출하지
        // 않기 위해 에러 없이 "가짜 성공" 응답을 준다 — 이때 identities가 빈 배열로 온다. 이 경우
        // 실제로는 메일이 발송되지 않으므로, "인증 링크를 보냈습니다"라고 잘못 안내하지 않는다.
        if (data.user && data.user.identities?.length === 0) {
          setError('이미 가입된 이메일입니다. 로그인해주세요.')
          return
        }
        markSignupPending()
        setMessage('이메일을 확인하세요. 인증 링크를 보냈습니다.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? translateAuthError(err.message) : '오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-6 bg-white">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <img src="/logo.svg" alt="Moroutine" className="h-14 w-auto" />
          {/* <p className="text-gray-400 text-sm mt-3">루틴으로 만드는 어휘 학습</p> */}
        </div>

        {/* Mode tabs */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
          {([['login', '로그인'], ['signup', '회원가입'], ['magic', '링크 로그인']] as [Mode, string][]).map(
            ([m, label]) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); setMessage('') }}
                className={`flex-1 min-h-[38px] py-2 text-xs font-medium rounded-lg transition-all ${
                  mode === m ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}
              >
                {label}
              </button>
            ),
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {/* 인풋 영역 — 탭에 따라 1~2개로 바뀌어도 높이 고정 */}
          <div className="flex flex-col gap-3 min-h-[112px]">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일"
              required
              className="w-full border border-gray-200 rounded-lg px-4 py-3.5 text-sm outline-none focus:border-gray-400"
            />
            {mode !== 'magic' && (
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호"
                required
                className="w-full border border-gray-200 rounded-lg px-4 py-3.5 text-sm outline-none focus:border-gray-400"
              />
            )}
          </div>

          {error && <p className="text-red-500 text-xs px-1">{error}</p>}
          {message && <p className="text-green-600 text-xs px-1">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-lg bg-gray-900 text-white text-sm font-medium mt-1 disabled:opacity-50"
          >
            {loading ? '처리 중...' : ({ login: '로그인', signup: '회원가입', magic: '링크 보내기' } as const)[mode]}
          </button>
        </form>
      </div>
    </div>
  )
}
