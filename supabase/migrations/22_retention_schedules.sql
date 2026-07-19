-- 22. retention_schedules — 구독 만료/Master 해제 후 3개월 데이터 보관·삭제 스케줄
-- docs/DATA_RETENTION_DESIGN.md §2 참고
-- 구독 만료(subscription_webhook_support 처리 중) 또는 Master 해제 시 동일 트랜잭션에서 행을 생성한다.
-- 쓰기는 service_role(Webhook/Master 해제 Edge Function)만, 클라이언트는 본인 것 조회만 가능.

CREATE TABLE retention_schedules (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source                        text NOT NULL,   -- 'subscription_expired' | 'subscription_revoked' | 'master_revoked'
  source_ref_id                 uuid,            -- subscriptions.id 또는 NULL(master)
  retention_expires_at          timestamptz NOT NULL,
  local_migration_confirmed_at  timestamptz,  -- 최소 1개 기기에서 로컬 이전 완료 확인된 시각(참고용, 삭제 조건 아님)
  notified_at_expiry            timestamptz,  -- 만료 시점 안내 발송 여부
  notified_before_deletion      boolean NOT NULL DEFAULT false,  -- 삭제 전 추가 알림 발송 여부
  status                        text NOT NULL DEFAULT 'active',
    -- 'active' | 'deletion_scheduled' | 'deleted' | 'canceled'(재구독/재지정으로 취소됨)
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_retention_schedules_due ON retention_schedules(retention_expires_at) WHERE status = 'active';
CREATE INDEX idx_retention_schedules_user ON retention_schedules(user_id);

ALTER TABLE retention_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "retention_schedules_select" ON retention_schedules
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- 쓰기는 service_role(Webhook/Master 해제 Edge Function)만

GRANT SELECT ON public.retention_schedules TO authenticated;
