-- 47. email_exists() — 비밀번호 찾기 화면에서 가입 여부를 확인하기 위한 RPC
--
-- docs/DECISION_LOG.md 2026-09-10 — resetPasswordForEmail()(POST /auth/v1/recover)은 계정 존재
-- 여부를 노출하지 않도록 Supabase가 의도적으로 설계한 엔드포인트라 항상 성공 응답만 준다. 회원
-- 여부에 따라 다른 안내(가입된 이메일만 메일 발송, 비회원은 에러 표시)를 하려면 별도 확인이
-- 필요하다는 사용자 결정에 따라 신설 — Edge Function 대신 기존 is_admin()/list_masters() 등과
-- 같은 SQL RPC 패턴을 재사용한다.
--
-- 주의: 이 함수는 정의상 이메일 가입 여부를 외부에 노출한다(account enumeration). 사용자가 이미
-- 인지하고 선택한 트레이드오프(docs/DECISION_LOG.md 참고, 초대 전용 서비스라 리스크 낮다고 판단).
CREATE OR REPLACE FUNCTION email_exists(p_email text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS(SELECT 1 FROM auth.users WHERE lower(email) = lower(p_email));
$$;

-- 비로그인(Guest) 상태의 "비밀번호를 잊으셨나요?" 화면에서도 호출해야 하므로 anon도 포함한다.
GRANT EXECUTE ON FUNCTION email_exists(text) TO anon, authenticated;
