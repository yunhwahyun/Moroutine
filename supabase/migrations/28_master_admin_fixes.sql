-- 28. master_admin_fixes — Phase 17(Master 초대/해제) 구현 중 발견한 두 가지 선행 수정 +
-- 관리자 화면용 최소 조회 RPC + Master 상태변경 realtime 지원
-- docs/MASTER_INVITATION_DESIGN.md, docs/DECISION_LOG.md 2026-07-18 참고

-- (a) 마이그레이션 13의 트리거가 service_role의 정당한 special_access/role 갱신까지 되돌리던 버그 수정.
-- service_role 연결은 auth.uid()가 NULL이라(서비스 롤 JWT에 sub 클레임이 없음) is_admin(NULL)이 항상
-- false를 반환해 트리거가 매번 되돌렸다. RLS는 service_role이 우회하지만 트리거는 우회하지 않는다.
CREATE OR REPLACE FUNCTION prevent_self_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT is_admin(auth.uid()) AND auth.role() <> 'service_role' THEN
    NEW.role = OLD.role;
    NEW.special_access = OLD.special_access;
    NEW.special_access_granted_at = OLD.special_access_granted_at;
    NEW.special_access_granted_by = OLD.special_access_granted_by;
    NEW.special_access_revoked_at = OLD.special_access_revoked_at;
  END IF;
  RETURN NEW;
END;
$$;

-- (b) 초대 검증 방식을 자체 토큰 대신 Supabase 세션 인증(inviteUserByEmail/signInWithOtp)으로 단순화했으므로
-- token_hash를 더 이상 채우지 않는다.
ALTER TABLE master_invitations ALTER COLUMN token_hash DROP NOT NULL;

-- (c) 관리자 화면의 "현재 Master 목록" 조회 전용 — profiles 테이블 자체를 admin에게 열어주면
-- docs/ADMIN_DESIGN.md의 "관리자는 사용자 개인 데이터에 접근하지 않는다" 원칙을 깨므로,
-- 필요한 컬럼만 반환하는 SECURITY DEFINER RPC로 제한한다.
CREATE OR REPLACE FUNCTION list_masters()
RETURNS TABLE(user_id uuid, email text, granted_at timestamptz, granted_by uuid)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  RETURN QUERY
    SELECT p.id, u.email, p.special_access_granted_at, p.special_access_granted_by
    FROM profiles p JOIN auth.users u ON u.id = p.id
    WHERE p.special_access = 'master';
END;
$$;

-- (d) Master 부여/해제(profiles.special_access 변경)를 클라이언트가 실시간으로 감지할 수 있도록 추가.
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
