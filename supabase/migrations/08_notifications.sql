-- 8. notifications
CREATE TABLE notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  schedule_id  uuid NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  native_id    text,                   -- Bridge 응답 후 채워짐, 초기 NULL
  fire_at      timestamptz NOT NULL,
  is_cancelled boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_schedule  ON notifications(schedule_id);
CREATE INDEX idx_notifications_user_fire ON notifications(user_id, fire_at)
  WHERE is_cancelled = false;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select" ON notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notifications_delete" ON notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "notifications_insert"
  ON notifications FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM schedules WHERE id = notifications.schedule_id AND user_id = auth.uid())
  );

CREATE POLICY "notifications_update"
  ON notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM schedules WHERE id = notifications.schedule_id AND user_id = auth.uid())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
