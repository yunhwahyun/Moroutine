-- 9. schedules 반복 종료 조건 컬럼 추가 + schedule_exceptions 테이블

-- schedules 테이블에 반복 관련 컬럼 추가
ALTER TABLE schedules
  ADD COLUMN IF NOT EXISTS repeat_end_type      text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS repeat_until         date,
  ADD COLUMN IF NOT EXISTS repeat_count         int,
  ADD COLUMN IF NOT EXISTS parent_schedule_id   uuid REFERENCES schedules(id) ON DELETE SET NULL;

-- schedule_exceptions: 반복 일정의 특정 occurrence 수정/삭제 예외
CREATE TABLE schedule_exceptions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  schedule_id         uuid        NOT NULL REFERENCES schedules(id)  ON DELETE CASCADE,

  occurrence_date     date        NOT NULL,
  exception_type      text        NOT NULL,
    -- 'cancelled' | 'modified'

  original_starts_at  timestamptz NOT NULL,
  original_ends_at    timestamptz,

  -- modified일 때 덮어쓸 값 (null이면 원본 유지)
  title               text,
  location            text,
  starts_at           timestamptz,
  ends_at             timestamptz,
  is_all_day          boolean,
  alarm_minutes       int,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- schedule_id + occurrence_date 복합 유니크 (한 occurrence에 예외 1건만 허용)
CREATE UNIQUE INDEX idx_schedule_exceptions_unique
  ON schedule_exceptions(schedule_id, occurrence_date);

CREATE INDEX idx_schedule_exceptions_user_date
  ON schedule_exceptions(user_id, occurrence_date);

ALTER TABLE schedule_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedule_exceptions_select"
  ON schedule_exceptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "schedule_exceptions_delete"
  ON schedule_exceptions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "schedule_exceptions_insert"
  ON schedule_exceptions FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM schedules
      WHERE id = schedule_exceptions.schedule_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "schedule_exceptions_update"
  ON schedule_exceptions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM schedules
      WHERE id = schedule_exceptions.schedule_id AND user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_exceptions TO authenticated;
