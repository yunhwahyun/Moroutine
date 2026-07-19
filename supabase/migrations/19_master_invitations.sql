-- 19. master_invitations — Master 초대 관리
-- docs/MASTER_INVITATION_DESIGN.md §2, §3 참고
-- 클라이언트 직접 접근 전면 차단(조회는 Admin만). 초대 생성/수락/철회는 전부 service_role Edge Function 경유.
-- 초대 토큰 원문은 저장하지 않는다(token_hash만 저장).

CREATE TABLE master_invitations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             text NOT NULL,
  token_hash        text NOT NULL,      -- 원문 토큰은 저장하지 않음 (sha256)
  status            text NOT NULL DEFAULT 'pending',
    -- 'pending' | 'sent' | 'accepted' | 'expired' | 'revoked'
  invited_by        uuid NOT NULL REFERENCES auth.users(id),
  expires_at        timestamptz NOT NULL,
  accepted_at       timestamptz,
  accepted_user_id  uuid REFERENCES auth.users(id),
  revoked_at        timestamptz,
  revoked_by        uuid REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 동일 이메일 중복 초대 방지: "처리 중"(pending/sent) 상태는 이메일당 최대 1건
CREATE UNIQUE INDEX idx_master_invitations_active_email
  ON master_invitations(email) WHERE status IN ('pending', 'sent');
CREATE INDEX idx_master_invitations_token ON master_invitations(token_hash);
CREATE INDEX idx_master_invitations_email ON master_invitations(email);

ALTER TABLE master_invitations ENABLE ROW LEVEL SECURITY;
-- 클라이언트 직접 접근 전면 차단 — 모든 처리는 service_role Edge Function 경유
CREATE POLICY "master_invitations_admin_select" ON master_invitations
  FOR SELECT TO authenticated USING (is_admin(auth.uid()));
-- INSERT/UPDATE/DELETE 정책 없음 = Edge Function(service_role)만 가능

GRANT SELECT ON public.master_invitations TO authenticated;
