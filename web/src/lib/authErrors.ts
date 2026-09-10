// Supabase Auth(GoTrue)가 돌려주는 영문 에러 메시지를 한국어로 옮긴다. 여기 없는 메시지는 원문을
// 그대로 보여준다(완전히 새로운 문구를 오역해서 보여주는 것보다, 못 알아보는 원문이 낫다는 판단).
// LoginPage.tsx/MasterAcceptPage.tsx가 공유한다(2026-09-10 — 비밀번호 설정이 MasterAcceptPage에도
// 생기면서 동일한 에러 문구 매핑이 두 곳에 필요해짐).
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'Invalid login credentials': '이메일 또는 비밀번호가 올바르지 않습니다.',
  'Email not confirmed': '이메일 인증이 완료되지 않았습니다. 받은 메일함을 확인해주세요.',
  'User already registered': '이미 가입된 이메일입니다. 로그인해주세요.',
  'Password should be at least 6 characters': '비밀번호는 6자 이상이어야 합니다.',
  'Unable to validate email address: invalid format': '이메일 형식이 올바르지 않습니다.',
  'Signup requires a valid password': '올바른 비밀번호를 입력해주세요.',
  'Email rate limit exceeded': '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
  'Database error saving new user': '회원가입 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
  'Signups not allowed for otp': '가입되지 않은 이메일입니다. 메일 주소를 확인해주세요.',
}

export function translateAuthError(message: string): string {
  return AUTH_ERROR_MESSAGES[message] ?? message
}
