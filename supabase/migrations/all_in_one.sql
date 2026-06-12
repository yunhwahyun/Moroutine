-- ============================================================
-- Moroutine — 전체 마이그레이션 (01~08 통합)
-- Supabase SQL Editor에서 한 번에 실행
-- ============================================================


-- 1. profiles
-- ============================================================
CREATE TABLE profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname      text,
  avatar_url    text,
  review_policy text NOT NULL DEFAULT 'keep',  -- 'keep' | 'downgrade'
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id) VALUES (new.id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_delete" ON profiles FOR DELETE TO authenticated USING (auth.uid() = id);


-- 2. schedules
-- ============================================================
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


-- 3. wordbooks
-- ============================================================
CREATE TABLE wordbooks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  language    text,         -- 'en-ko' | 'ja-ko' | 'zh-ko' 등
  word_count  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wordbooks_user ON wordbooks(user_id);

ALTER TABLE wordbooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wordbooks_select" ON wordbooks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "wordbooks_insert" ON wordbooks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wordbooks_update" ON wordbooks FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wordbooks_delete" ON wordbooks FOR DELETE TO authenticated USING (auth.uid() = user_id);


-- 4. words
-- ============================================================
CREATE TABLE words (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wordbook_id     uuid NOT NULL REFERENCES wordbooks(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  term            text NOT NULL,        -- 단어
  definition      text NOT NULL,        -- 뜻
  description     text,                 -- 학습 화면 + 퀴즈 정답 시 노출하는 설명
  example         text,                 -- 예문
  memo            text,                 -- 사용자 개인 메모
  wrong_count     int NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'unseen',
    -- 'unseen' | 'learning' | 'reviewing' | 'mastered'
  review_step     int NOT NULL DEFAULT 0,
    -- 0: 복습 단계 아님 / 1: 1차 / 2: 2차 / 3: 3차
  first_passed_at timestamptz,
  next_review_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_words_wordbook    ON words(wordbook_id);
CREATE INDEX idx_words_user_review ON words(user_id, next_review_at) WHERE status = 'reviewing';
CREATE INDEX idx_words_user_status ON words(user_id, status);

ALTER TABLE words ENABLE ROW LEVEL SECURITY;

CREATE POLICY "words_select" ON words FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "words_delete" ON words FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "words_insert"
  ON words FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM wordbooks
      WHERE wordbooks.id = words.wordbook_id AND wordbooks.user_id = auth.uid()
    )
  );

CREATE POLICY "words_update"
  ON words FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM wordbooks
      WHERE wordbooks.id = words.wordbook_id AND wordbooks.user_id = auth.uid()
    )
  );


-- 5. word_count 트리거
-- ============================================================
CREATE OR REPLACE FUNCTION sync_word_count()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE wordbooks SET word_count = word_count + 1 WHERE id = NEW.wordbook_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE wordbooks SET word_count = word_count - 1 WHERE id = OLD.wordbook_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_word_count
  AFTER INSERT OR DELETE ON words
  FOR EACH ROW EXECUTE PROCEDURE sync_word_count();


-- 6. study_sessions
-- ============================================================
CREATE TABLE study_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_type  text NOT NULL,
    -- 'learn'       : 눈+귀 학습 세션
    -- 'quiz'        : 일반 퀴즈 세션
    -- 'review_quiz' : 복습 퀴즈 세션
  wordbook_ids  uuid[],           -- NULL이면 전체 / review이면 NULL
  total_count   int NOT NULL,
  correct_count int NOT NULL DEFAULT 0,
  wrong_count   int NOT NULL DEFAULT 0,
  completed_at  timestamptz,      -- NULL이면 진행 중
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_study_sessions_user ON study_sessions(user_id, created_at DESC);

ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "study_sessions_select" ON study_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "study_sessions_insert" ON study_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "study_sessions_update" ON study_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "study_sessions_delete" ON study_sessions FOR DELETE TO authenticated USING (auth.uid() = user_id);


-- 7. study_results
-- ============================================================
CREATE TABLE study_results (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  word_id       uuid NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_correct    boolean NOT NULL,
  attempt_count int NOT NULL DEFAULT 1,
  answered_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_study_results_session ON study_results(session_id);
CREATE INDEX idx_study_results_word    ON study_results(word_id);

ALTER TABLE study_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "study_results_select" ON study_results FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "study_results_delete" ON study_results FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "study_results_insert"
  ON study_results FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM study_sessions WHERE id = study_results.session_id AND user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM words WHERE id = study_results.word_id AND user_id = auth.uid())
  );

CREATE POLICY "study_results_update"
  ON study_results FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM study_sessions WHERE id = study_results.session_id AND user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM words WHERE id = study_results.word_id AND user_id = auth.uid())
  );


-- 8. notifications
-- ============================================================
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


-- 9. 테이블 권한 부여 (authenticated 롤)
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles       TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedules      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wordbooks      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.words          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_results  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications  TO authenticated;
