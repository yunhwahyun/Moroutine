-- 32. service_role에 public 스키마 테이블 권한 부여 + list_masters() 타입 버그 수정
--
-- 발견 경위: master-invite/master-add-existing Edge Function이 전부 403을 반환하는 문제를 실사용자
-- 세션으로 직접 재현한 결과, service_role로 profiles를 SELECT하면 PostgREST가
-- "permission denied for table profiles"(42501)를 반환함을 확인. 조사 결과 01~31번 마이그레이션
-- 어디에서도 service_role에 GRANT를 준 적이 없어(01_profiles.sql 등은 전부 `TO authenticated`만 부여),
-- service_role은 TRIGGER/TRUNCATE/REFERENCES만 가진 채 SELECT/INSERT/UPDATE/DELETE가 전혀 없었다.
-- RLS BYPASSRLS 속성은 행 단위 필터만 우회할 뿐 테이블 단위 GRANT를 대신하지 않으므로,
-- service_role 클라이언트를 쓰는 모든 Edge Function(master-*, revenuecat-webhook, retention-cleanup)이
-- 배포 이후 한 번도 정상 동작한 적이 없었던 것으로 추정된다. docs/DECISION_LOG.md 2026-07-19 참고.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- 앞으로 추가되는 테이블/시퀀스에도 자동 적용(마이그레이션을 실행하는 접속 역할 기준)
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO service_role;

-- list_masters()가 매번 400(structure of query does not match function result type)을 반환하던 버그 수정.
-- auth.users.email은 character varying(255)인데 RETURNS TABLE에는 text로 선언되어 있어 타입 불일치.
CREATE OR REPLACE FUNCTION list_masters()
RETURNS TABLE(user_id uuid, email text, granted_at timestamptz, granted_by uuid)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  RETURN QUERY
    SELECT p.id, u.email::text, p.special_access_granted_at, p.special_access_granted_by
    FROM profiles p JOIN auth.users u ON u.id = p.id
    WHERE p.special_access = 'master';
END;
$$;
