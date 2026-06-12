-- 10. notifications에 occurrence_date 추가 (반복 일정 알림 관리용)

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS occurrence_date date;

-- schedule_id + occurrence_date 기준 중복 알림 방지
CREATE UNIQUE INDEX idx_notifications_schedule_occurrence
  ON notifications(schedule_id, occurrence_date)
  WHERE is_cancelled = false;
