import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

type Status = 'checking' | 'form' | 'submitting' | 'success' | 'no-session'

// docs/launch/PHASE1_POLICY.md §5 — Master 가입 시 필요한 것은 ① 이용약관 동의(체크박스) ② 만 14세
// 이상 확인(체크박스, "동의"가 아니라 자격요건 확인) ③ 개인정보처리방침 안내+열람 링크(체크박스
// 아님) 세 가지뿐이다. "개인정보 수집·이용 동의" 체크박스는 만들지 않는다(§5 법적 근거 참고).
//
// policy_version은 실제 게시 시행일이 정해지기 전까지 쓰는 기술적 버전 태그다 — docs/legal/*_PHASE1.md
// 의 시행일 [확인 필요]가 채워지면 이 값도 함께 갱신해야 한다(Edge Function master-accept의
// POLICY_VERSION_FALLBACK과 반드시 같은 값으로 맞출 것).
const POLICY_VERSION = 'phase1-v1'

// docs/MASTER_INVITATION_DESIGN.md §4-3 편차(2026-07-18) — 자체 토큰 없이, 초대/매직 링크 클릭으로
// 이미 확립된 세션만으로 master-accept를 호출한다. 비밀번호 설정 단계는 없음(LoginPage의 매직 링크
// 로그인으로 항상 재로그인 가능하므로 비밀번호가 필수가 아님). P0(2026-09-10)부터는 세션이 확인되면
// 바로 호출하지 않고, 이용약관 동의 + 만 14세 이상 확인 체크박스를 통과해야 호출한다.
export default function MasterAcceptPage() {
  const { user, isLoading: isAuthLoading } = useAuthStore()
  const [status, setStatus] = useState<Status>('checking')
  const [errorMessage, setErrorMessage] = useState('')
  const [agreedTerms, setAgreedTerms] = useState(false)
  const [agreedAge, setAgreedAge] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (isAuthLoading) return
    setStatus(user ? 'form' : 'no-session')
  }, [user, isAuthLoading])

  const handleSubmit = async () => {
    if (!user || !agreedTerms || !agreedAge) return
    setErrorMessage('')
    setStatus('submitting')
    const { data, error } = await supabase.functions.invoke('master-accept', {
      body: { agreedTerms: true, agreedAge: true, policyVersion: POLICY_VERSION },
    })
    if (error || !data?.success) {
      // 실패해도 폼으로 되돌아가 인라인 에러만 보여준다 — 체크박스를 다시 채우게 만들지 않는다.
      setStatus('form')
      setErrorMessage(error?.message ?? '초대 수락에 실패했습니다.')
      return
    }
    queryClient.invalidateQueries({ queryKey: ['permissions', user.id] })
    setStatus('success')
    setTimeout(() => navigate('/', { replace: true }), 1500)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh px-6 bg-white text-center">
      {status === 'checking' && (
        <>
          <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin mb-4" />
          <p className="text-sm text-gray-500">초대를 확인하고 있어요...</p>
        </>
      )}

      {status === 'no-session' && (
        <>
          <p className="text-sm text-gray-500 leading-relaxed mb-4">
            초대 링크가 유효하지 않습니다.
            <br />
            이메일의 링크를 다시 확인해주세요.
          </p>
          <button onClick={() => navigate('/')} className="text-sm text-gray-600 underline">
            홈으로
          </button>
        </>
      )}

      {(status === 'form' || status === 'submitting') && (
        <div className="w-full max-w-sm text-left">
          <p className="text-base font-bold text-gray-900 mb-6 text-center">Master 가입 안내</p>

          <label className="flex items-start gap-2.5 py-3 border-b border-gray-100 cursor-pointer">
            <input
              type="checkbox"
              checked={agreedTerms}
              onChange={(e) => setAgreedTerms(e.target.checked)}
              disabled={status === 'submitting'}
              className="mt-0.5 w-4 h-4 shrink-0"
            />
            <span className="text-sm text-gray-800">
              <span className="text-red-500 mr-1">[필수]</span>
              <a href="/terms" target="_blank" rel="noreferrer" className="underline">
                이용약관
              </a>
              에 동의합니다
            </span>
          </label>

          <label className="flex items-start gap-2.5 py-3 border-b border-gray-100 cursor-pointer">
            <input
              type="checkbox"
              checked={agreedAge}
              onChange={(e) => setAgreedAge(e.target.checked)}
              disabled={status === 'submitting'}
              className="mt-0.5 w-4 h-4 shrink-0"
            />
            <span className="text-sm text-gray-800">
              <span className="text-red-500 mr-1">[필수]</span>
              만 14세 이상입니다
            </span>
          </label>

          <p className="text-xs text-gray-400 leading-relaxed mt-4">
            수집하는 개인정보 항목·목적·보유기간은{' '}
            <a href="/privacy" target="_blank" rel="noreferrer" className="underline text-gray-500">
              개인정보처리방침
            </a>
            에서 확인할 수 있습니다.
          </p>

          {errorMessage && <p className="text-red-500 text-xs mt-3">{errorMessage}</p>}

          <button
            onClick={handleSubmit}
            disabled={!agreedTerms || !agreedAge || status === 'submitting'}
            className="w-full py-4 rounded-lg bg-gray-900 text-white text-sm font-medium mt-6 disabled:opacity-50"
          >
            {status === 'submitting' ? '처리 중...' : '동의하고 계속하기'}
          </button>
        </div>
      )}

      {status === 'success' && <p className="text-base font-bold text-gray-900">Master 권한이 부여되었습니다</p>}
    </div>
  )
}
