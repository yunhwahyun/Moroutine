-- 50. check_master_invitation RPC — Master 초대 자체 토큰 방식 복귀(2026-09-12)
-- docs/MASTER_INVITATION_DESIGN.md §2~§4, docs/DECISION_LOG.md 2026-09-12 참고.
--
-- MasterAcceptPage가 URL의 ?token=...을 실제로 계정을 만들기 전에 먼저 유효성만 가볍게
-- 확인하는 용도(폼을 다 채우고 제출한 뒤에야 "링크가 유효하지 않습니다"를 보여주지 않기 위함).
-- email_exists()(마이그레이션 47)와 동일한 패턴: anon도 호출 가능한 SECURITY DEFINER, boolean만
-- 반환(이메일 등 그 이상의 정보는 노출하지 않는다 — 실제 계정 생성은 master-accept Edge Function이
-- 토큰을 다시 한번 서버에서 검증한 뒤에만 진행한다, 이 RPC 결과를 그대로 신뢰하지 않는다).
CREATE OR REPLACE FUNCTION check_master_invitation(p_token text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM master_invitations
    WHERE token_hash = encode(extensions.digest(p_token::bytea, 'sha256'), 'hex')
      AND status = 'sent'
      AND expires_at > now()
  );
$$;

GRANT EXECUTE ON FUNCTION check_master_invitation(text) TO anon, authenticated;
