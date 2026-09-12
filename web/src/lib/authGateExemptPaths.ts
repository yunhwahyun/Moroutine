// DowngradeGate/GuestMigrationGate처럼 "인증 상태 + serviceTier"만 보고 전역으로 뜨는 모달들이
// 공통으로 피해야 하는 라우트 목록. docs/DECISION_LOG.md 2026-09-10/2026-09-11 참고 —
// Master 동의 폼(/master/accept), 약관/방침/라이선스 열람, 비밀번호 재설정(recovery 세션) 전부
// "인증됨 + tier가 아직 확정 전이거나 guest"인 상태가 정상적으로 지속되는 화면이라, 여기서 이런
// 모달이 끼어들면 화면을 가리거나(2026-09-10 QA 발견) 사용자가 정작 처리해야 할 화면을 못 보게 된다
// (2026-09-12 QA 발견 — GuestMigrationGate가 /reset-password에서도 뜸).
export const AUTH_GATE_EXEMPT_PATHS = ['/master/accept', '/terms', '/privacy', '/licenses', '/reset-password']

export function isAuthGateExemptPath(pathname: string): boolean {
  return AUTH_GATE_EXEMPT_PATHS.includes(pathname)
}
