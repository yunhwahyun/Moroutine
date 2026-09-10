import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { translateAuthError } from '@/lib/authErrors'

type Mode = 'login' | 'magic' | 'forgot'

export default function LoginPage() {
  const { user } = useAuthStore()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to="/" replace />

  // 2026-09-10 — 비밀번호 찾기. resetPasswordForEmail()(POST /auth/v1/recover) 자체는 계정 존재
  // 여부를 절대 노출하지 않도록 Supabase가 설계해뒀다(항상 성공 응답) — 회원 여부에 따라 다른
  // 안내를 보여주려면 별도 확인이 필요해, email_exists() RPC(마이그레이션 47)로 먼저 가입 여부를
  // 확인한 뒤에만 재설정 메일을 보낸다. 이 방식 자체가 이메일 가입 여부를 노출하는 선택이라는 점은
  // docs/DECISION_LOG.md에 트레이드오프로 기록해뒀다(사용자 결정, 초대 전용 서비스라 리스크 낮음).
  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    const { data: exists, error: checkError } = await supabase.rpc('email_exists', { p_email: email })
    if (checkError) {
      setLoading(false)
      setError('오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
      return
    }
    if (!exists) {
      setLoading(false)
      setError('가입되지 않은 이메일입니다. 메일 주소를 확인해주세요.')
      return
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (error) {
      setError(translateAuthError(error.message))
      return
    }
    setMessage('입력하신 이메일로 비밀번호 재설정 안내를 보냈습니다.')
  }

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
        //
        // shouldCreateUser: false — docs/launch/PHASE1_POLICY.md §1 P0(2026-09-10 QA 발견): 이 옵션 없이
        // signInWithOtp를 호출하면 미가입 이메일이어도 Supabase가 자동으로 새 계정을 만들어버려
        // "회원가입 탭 제거"만으로는 막히지 않는 self-signup 우회 경로가 된다. 기존 계정(Master/Admin)
        // 로그인만 허용하고, 미가입 이메일은 에러로 거부한다.
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
        })
        if (error) throw error
        setMessage('이메일을 확인하세요. 로그인 링크를 보냈습니다.')
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

        {/* Mode tabs — docs/launch/PHASE1_POLICY.md §1 P0: 일반 회원가입 차단, 회원가입 탭 제거.
            forgot은 탭이 아니라 "로그인" 탭 안의 링크로만 진입하므로 탭 목록엔 넣지 않는다. */}
        {mode !== 'forgot' && (
          <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
            {([['login', '로그인'], ['magic', '링크 로그인']] as [Mode, string][]).map(
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
        )}

        {mode === 'forgot' ? (
          /* 비밀번호 찾기 — 가입된 이메일에만 재설정 메일을 보내고, 아니면 에러를 보여준다(email_exists RPC). */
          <form onSubmit={handleForgotSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="이메일"
              required
              className="w-full border border-gray-200 rounded-lg px-4 py-3.5 text-sm outline-none focus:border-gray-400"
            />

            {error && <p className="text-red-500 text-xs px-1">{error}</p>}
            {message && <p className="text-green-600 text-xs px-1 whitespace-pre-line">{message}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-lg bg-gray-900 text-white text-sm font-medium mt-1 disabled:opacity-50"
            >
              {loading ? '처리 중...' : '재설정 메일 보내기'}
            </button>
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); setMessage('') }}
              className="text-xs text-gray-500 underline text-center mt-1"
            >
              로그인으로 돌아가기
            </button>
          </form>
        ) : (
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

            {mode === 'login' && (
              <button
                type="button"
                onClick={() => { setMode('forgot'); setError(''); setMessage('') }}
                className="text-xs text-gray-500 underline self-end -mt-1"
              >
                비밀번호를 잊으셨나요?
              </button>
            )}

            {error && <p className="text-red-500 text-xs px-1">{error}</p>}
            {message && <p className="text-green-600 text-xs px-1">{message}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 rounded-lg bg-gray-900 text-white text-sm font-medium mt-1 disabled:opacity-50"
            >
              {loading ? '처리 중...' : ({ login: '로그인', magic: '링크 보내기' } as const)[mode]}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
