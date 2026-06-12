import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

type Mode = 'login' | 'signup' | 'magic'

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
        const { error } = await supabase.auth.signInWithOtp({ email })
        if (error) throw error
        setMessage('이메일을 확인하세요. 로그인 링크를 보냈습니다.')
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMessage('이메일을 확인하세요. 인증 링크를 보냈습니다.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-6 bg-white">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold text-gray-900">Moroutine</h1>
          <p className="text-gray-400 text-sm mt-1">루틴으로 만드는 어휘 학습</p>
        </div>

        {/* Mode tabs */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
          {([['login', '로그인'], ['signup', '회원가입'], ['magic', '링크 로그인']] as [Mode, string][]).map(
            ([m, label]) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); setMessage('') }}
                className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
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
