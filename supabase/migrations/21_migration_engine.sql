-- 21. migration_jobs / migration_id_map / device_migration_status — Guest↔Remote 데이터 이전 엔진
-- docs/MIGRATION_DESIGN.md §3-1, §8 참고
-- migration_jobs는 사용자가 본인 진행 상황을 조회/갱신할 수 있어야 하므로 authenticated 정책을 둔다.
-- migration_id_map은 이전 대상 데이터를 담고 있어 클라이언트 직접 접근을 막고 서버(RPC)에서만 다룬다.

CREATE TABLE migration_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direction         text NOT NULL,   -- 'local_to_remote' | 'remote_to_local'
  status            text NOT NULL DEFAULT 'in_progress',
    -- 'in_progress' | 'completed' | 'failed' | 'rolled_back'
  total_records     int,
  processed_records int NOT NULL DEFAULT 0,
  started_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz,
  error_detail      jsonb
);

CREATE TABLE migration_id_map (
  migration_id  uuid NOT NULL REFERENCES migration_jobs(id) ON DELETE CASCADE,
  entity_type   text NOT NULL,   -- 'wordbook' | 'word' | 'schedule' | ...
  local_id      text NOT NULL,
  server_id     uuid NOT NULL,
  PRIMARY KEY (migration_id, entity_type, local_id)
);

CREATE TABLE device_migration_status (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id     text NOT NULL,   -- 클라이언트 생성 고정 식별자(로컬 저장)
  direction     text NOT NULL,   -- 'remote_to_local'
  status        text NOT NULL DEFAULT 'pending',
    -- 'pending' | 'completed'
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_device_migration_unique ON device_migration_status(user_id, device_id, direction);

ALTER TABLE migration_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_id_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_migration_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "migration_jobs_select" ON migration_jobs FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- INSERT/UPDATE는 클라이언트가 본인 마이그레이션 잡만 생성/갱신 가능
CREATE POLICY "migration_jobs_insert" ON migration_jobs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "migration_jobs_update" ON migration_jobs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
-- migration_id_map: INSERT/SELECT/UPDATE/DELETE 정책 없음 = 클라이언트 기본 거부, service_role(RPC)만 접근

CREATE POLICY "device_migration_status_all" ON device_migration_status
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.migration_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_migration_status TO authenticated;
