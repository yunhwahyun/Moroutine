-- 14. subscription_plans — 요금제 설정 테이블 (Pro 한도 등을 하드코딩하지 않기 위함)
-- docs/PERMISSION_DESIGN.md §4-2 참고

CREATE TABLE subscription_plans (
  code                     text PRIMARY KEY,   -- 'pro' | 'premium'
  personal_word_limit      int,                -- NULL = 무제한
  sync_enabled             boolean NOT NULL DEFAULT true,
  public_wordbook_enabled  boolean NOT NULL DEFAULT true,
  bulk_import_enabled      boolean NOT NULL DEFAULT true,
  is_active                boolean NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- TODO: personal_word_limit 값 확정 전까지 NULL(무제한)로 시작. 값 미확정 상태로
-- 프로덕션 배포 시 Pro/Premium 구분이 무의미해지므로 배포 전 반드시 채울 것.
INSERT INTO subscription_plans (code, personal_word_limit, sync_enabled, public_wordbook_enabled, bulk_import_enabled)
VALUES
  ('pro',     NULL, true, true, true),
  ('premium', NULL, true, true, true);

ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

-- 모든 인증 사용자가 읽을 수 있어야 함(가격/한도 표시용). 쓰기는 Admin만.
CREATE POLICY "subscription_plans_select" ON subscription_plans
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "subscription_plans_admin_write" ON subscription_plans
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_plans TO authenticated;
