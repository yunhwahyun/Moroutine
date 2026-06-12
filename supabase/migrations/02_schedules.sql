-- 2. schedules
CREATE TABLE schedules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         text NOT NULL,
  location      text,
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz,
  is_all_day    boolean NOT NULL DEFAULT false,
  repeat_type   text NOT NULL DEFAULT 'none',
    -- 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly' | 'custom'
  repeat_unit   text,     -- 'day' | 'week' | 'month' | 'year'  (custom 전용)
  repeat_value  int,
  alarm_minutes int,      -- NULL=알림없음 / 0=정시 / 10=10분전
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_schedules_user_starts ON schedules(user_id, starts_at);

ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedules_select" ON schedules FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "schedules_insert" ON schedules FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "schedules_update" ON schedules FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "schedules_delete" ON schedules FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedules TO authenticated;
