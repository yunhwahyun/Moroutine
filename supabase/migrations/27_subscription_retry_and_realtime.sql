-- 27. subscription_retry_and_realtime — billing_retry 자동 만료 판단용 컬럼 + 구독 상태 realtime 구독 지원
-- docs/SUBSCRIPTION_DESIGN.md §2, §3, §10 참고 (Grace Period 16일 / billing_retry 최대 30일 확정, 2026-07-18)
-- billing_retry_started_at: BILLING_ISSUE 진입 시각. 추후 스케줄 함수가 30일 경과 시 expired로 전환하는 데 사용한다
-- (스케줄 함수 자체는 이번 마이그레이션 범위 아님 — pg_cron 등록은 Phase 18 retention-cleanup과 같은 시점에 진행).

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS billing_retry_started_at timestamptz;

-- 클라이언트가 자신의 구독 상태 변경을 postgres_changes로 실시간 구독할 수 있도록 publication에 추가.
-- 기존 RLS 정책(subscriptions_select, auth.uid() = user_id)이 realtime 인가에도 그대로 적용된다.
ALTER PUBLICATION supabase_realtime ADD TABLE subscriptions;
