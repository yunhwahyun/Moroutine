-- 15. subscriptions — 구독 상태 테이블 + get_service_tier()
-- docs/PERMISSION_DESIGN.md §4-3, §4-4 참고
-- 클라이언트는 SELECT만 가능. INSERT/UPDATE는 Webhook Edge Function(service_role)만 수행한다.
-- (docs/SUBSCRIPTION_DESIGN.md §3 — 결제 상태는 클라이언트 값을 신뢰하지 않는다)

CREATE TABLE subscriptions (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_code                 text NOT NULL REFERENCES subscription_plans(code),
    -- 'pro' | 'premium'
  status                    text NOT NULL DEFAULT 'active',
    -- 'active' | 'grace_period' | 'billing_retry' | 'expired' | 'revoked'
  provider                  text NOT NULL DEFAULT 'revenuecat',
  provider_subscription_id  text,
  started_at                timestamptz NOT NULL DEFAULT now(),
  current_period_end        timestamptz,
  grace_period_end          timestamptz,
  canceled_at                timestamptz,
  expired_at                timestamptz,
  retention_expires_at      timestamptz,   -- expired_at + 3개월 (docs/DATA_RETENTION_DESIGN.md)
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- 동시에 2개 이상의 활성 구독 방지
CREATE UNIQUE INDEX idx_subscriptions_user_active
  ON subscriptions(user_id) WHERE status IN ('active', 'grace_period', 'billing_retry');
CREATE INDEX idx_subscriptions_user ON subscriptions(user_id, created_at DESC);
CREATE INDEX idx_subscriptions_retention ON subscriptions(retention_expires_at) WHERE retention_expires_at IS NOT NULL;

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_select" ON subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

GRANT SELECT ON public.subscriptions TO authenticated;

-- 최종 서비스 등급 판정 (admin > master > premium > pro > guest)
-- grace_period/billing_retry도 활성 구독으로 취급해 권한을 유지한다.
CREATE OR REPLACE FUNCTION get_service_tier(p_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT CASE
    WHEN (SELECT role FROM profiles WHERE id = p_user_id) = 'admin' THEN 'admin'
    WHEN (SELECT special_access FROM profiles WHERE id = p_user_id) = 'master' THEN 'master'
    WHEN EXISTS (
      SELECT 1 FROM subscriptions
      WHERE user_id = p_user_id AND plan_code = 'premium'
        AND status IN ('active', 'grace_period', 'billing_retry')
    ) THEN 'premium'
    WHEN EXISTS (
      SELECT 1 FROM subscriptions
      WHERE user_id = p_user_id AND plan_code = 'pro'
        AND status IN ('active', 'grace_period', 'billing_retry')
    ) THEN 'pro'
    ELSE 'guest'  -- authenticated인데 매칭 없음 = 전이 상태(downgrade_pending), 정상 정착 상태 아님
  END;
$$;
