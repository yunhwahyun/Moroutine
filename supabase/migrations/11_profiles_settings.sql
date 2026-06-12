-- 11. profiles 설정 컬럼 추가

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS quiz_mode               text    NOT NULL DEFAULT 'multiple_choice',
  ADD COLUMN IF NOT EXISTS question_order          text    NOT NULL DEFAULT 'random',
  ADD COLUMN IF NOT EXISTS review_intervals        text[]  NOT NULL DEFAULT '{7d,30d,90d}',
  ADD COLUMN IF NOT EXISTS schedule_notification   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS review_notification     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS review_notification_time text   NOT NULL DEFAULT '09:00';

-- review_policy 는 기존 컬럼 유지 ('keep' | 'downgrade')
-- nickname 은 기존 컬럼 유지
