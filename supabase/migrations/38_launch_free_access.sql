-- 38. 무료 출시 기간 스위치 — 사업자 등록 전 결제 없이 회원가입만으로 Pro 기능 전체 제공
-- docs/SUBSCRIPTION_DESIGN.md §11, docs/DECISION_LOG.md 2026-09-02 참고
--
-- app_config는 앱 전체에 대한 단일 스위치(사용자별 타이머가 아님)다. payments_enabled=false인 동안
-- get_service_tier()는 admin/master/실제 pro 구독이 아닌 모든 "인증된" 사용자를 'pro'로 취급한다 —
-- 단어 한도(create_words_checked)/공용 단어장 RLS가 전부 get_service_tier() IN ('pro','master')로
-- 판정하므로 이 한 곳만 바꾸면 Pro 기능 전체가 자동으로 열린다. 결제를 붙일 때는
-- `UPDATE app_config SET payments_enabled = true;` 한 줄이면 되고, 이미 있는
-- SignupPricingGate/DowngradeGate가 코드 변경 없이 "유료 전환" 안내를 자동으로 다시 담당한다.

CREATE TABLE app_config (
  id                boolean PRIMARY KEY DEFAULT true,
  payments_enabled  boolean NOT NULL DEFAULT false,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_config_singleton CHECK (id)
);
INSERT INTO app_config (payments_enabled) VALUES (false);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- Guest(anon)도 /pricing에서 이 값을 읽어야 하므로 anon까지 SELECT 허용, 쓰기는 Admin만.
CREATE POLICY "app_config_select" ON app_config
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "app_config_admin_write" ON app_config
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

GRANT SELECT ON public.app_config TO anon;
GRANT SELECT, UPDATE ON public.app_config TO authenticated;

-- get_service_tier() 교체 — admin/master/실제 pro 구독 판정 다음, guest로 떨어지기 직전에
-- "결제 미활성 시 로그인 사용자는 Pro" 분기를 추가한다(마이그레이션 37 버전에 분기 하나만 추가).
CREATE OR REPLACE FUNCTION get_service_tier(p_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT CASE
    WHEN (SELECT role FROM profiles WHERE id = p_user_id) = 'admin' THEN 'admin'
    WHEN (SELECT special_access FROM profiles WHERE id = p_user_id) = 'master' THEN 'master'
    WHEN EXISTS (
      SELECT 1 FROM subscriptions
      WHERE user_id = p_user_id AND plan_code = 'pro'
        AND status IN ('active', 'grace_period', 'billing_retry')
    ) THEN 'pro'
    WHEN NOT (SELECT payments_enabled FROM app_config LIMIT 1) THEN 'pro'
    ELSE 'guest'  -- authenticated인데 매칭 없음(결제 활성화 이후) = 전이 상태(downgrade_pending)
  END;
$$;
