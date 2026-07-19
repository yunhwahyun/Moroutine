-- 20. admin_audit_log — 관리자 작업(공용 콘텐츠 변경, Master 초대/해제, 권한 변경) 감사 로그
-- docs/ADMIN_DESIGN.md §4 참고
-- 조회는 Admin만. INSERT는 서버(RPC/Edge Function, SECURITY DEFINER)에서만 수행 — authenticated INSERT 정책 없음.
--
-- TODO(결정 필요, docs/DATA_RETENTION_DESIGN.md §4-2): retention-cleanup 등 시스템 작업이 이 로그를 남기려면
-- actor_id가 NOT NULL이라 시스템 전용 서비스 계정(auth.users 고정 UUID) 도입 또는 컬럼 nullable 완화가 필요하다.
-- 현재는 설계 문서 원안(NOT NULL)을 그대로 따른다.

CREATE TABLE admin_audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     uuid NOT NULL REFERENCES auth.users(id),
  action       text NOT NULL,
    -- 'public_wordbook_create' | 'public_wordbook_publish' | 'public_word_bulk_import'
    -- | 'master_invite' | 'master_invite_revoke' | 'master_revoke' | 'role_change' | ...
  target_type  text,     -- 'public_wordbook' | 'public_word' | 'user' | 'master_invitation'
  target_id    text,
  detail       jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_audit_log_actor ON admin_audit_log(actor_id, created_at DESC);
CREATE INDEX idx_admin_audit_log_action ON admin_audit_log(action, created_at DESC);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_audit_log_select" ON admin_audit_log
  FOR SELECT TO authenticated USING (is_admin(auth.uid()));

GRANT SELECT ON public.admin_audit_log TO authenticated;
