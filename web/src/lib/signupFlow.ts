const STORAGE_KEY = 'moroutine_signup_pending_plan_selection'

// docs/TODO.md Phase 16 후속 — 회원가입 완료 직후 /pricing 강제 라우팅 여부 판단용 플래그.
// LoginPage의 signUp() 성공 시점에 표시하고, SignupPricingGate/PricingPage/DowngradeGate가 소비한다.
// 세션이 아니라 localStorage를 쓰는 이유: 이메일 인증 링크가 원래 탭이 아닌 새 브라우저 컨텍스트에서
// 열려도(모바일 메일 앱 등) 같은 기기·브라우저라면 플래그가 살아있어야 하기 때문.
export function markSignupPending() {
  localStorage.setItem(STORAGE_KEY, '1')
}

export function isSignupPending(): boolean {
  return localStorage.getItem(STORAGE_KEY) === '1'
}

export function clearSignupPending() {
  localStorage.removeItem(STORAGE_KEY)
}
