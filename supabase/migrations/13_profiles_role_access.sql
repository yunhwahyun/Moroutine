-- 13. profiles 역할/특별권한 컬럼 + is_admin() + 자기 자신 권한 상승 방지 트리거
-- docs/PERMISSION_DESIGN.md §4-1, §4-4(is_admin), §7-1(트리거) 참고

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role                       text NOT NULL DEFAULT 'user',
    -- 'user' | 'admin'
  ADD COLUMN IF NOT EXISTS special_access             text NOT NULL DEFAULT 'none',
    -- 'none' | 'master'
  ADD COLUMN IF NOT EXISTS special_access_granted_at  timestamptz,
  ADD COLUMN IF NOT EXISTS special_access_granted_by  uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS special_access_revoked_at  timestamptz;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('user', 'admin')),
  ADD CONSTRAINT profiles_special_access_check CHECK (special_access IN ('none', 'master'));

CREATE INDEX idx_profiles_role ON profiles(role) WHERE role = 'admin';
CREATE INDEX idx_profiles_special_access ON profiles(special_access) WHERE special_access = 'master';

-- role='admin' 판정 (RLS 및 서버 로직 공용)
CREATE OR REPLACE FUNCTION is_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE((SELECT role = 'admin' FROM profiles WHERE id = p_user_id), false);
$$;

-- 사용자 본인이 role/special_access*를 수정하지 못하도록 강제 (Admin만 통과)
CREATE OR REPLACE FUNCTION prevent_self_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    NEW.role = OLD.role;
    NEW.special_access = OLD.special_access;
    NEW.special_access_granted_at = OLD.special_access_granted_at;
    NEW.special_access_granted_by = OLD.special_access_granted_by;
    NEW.special_access_revoked_at = OLD.special_access_revoked_at;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_self_privilege_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE PROCEDURE prevent_self_privilege_escalation();
