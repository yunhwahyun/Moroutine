-- 16. subscription_webhook_support — RevenueCat Webhook 처리용 Idempotency + 감사 로그
-- docs/SUBSCRIPTION_DESIGN.md §3-1 참고
-- 두 테이블 모두 클라이언트 접근 전면 차단(RLS는 활성화하되 authenticated 정책을 두지 않는다).
-- Webhook Edge Function이 service_role로만 기록한다.

CREATE TABLE processed_webhook_events (
  event_id    text PRIMARY KEY,
  provider    text NOT NULL DEFAULT 'revenuecat',
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE subscription_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type    text NOT NULL,
  before_status text,
  after_status  text,
  raw_payload   jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE processed_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_audit_log ENABLE ROW LEVEL SECURITY;
-- INSERT/SELECT/UPDATE/DELETE 정책 없음 = authenticated/anon 전부 기본 거부. service_role만 접근.
