# DB Schema

> Supabase PostgreSQL. 마이그레이션 순서 반드시 준수.

---

## 마이그레이션 실행 순서

```
1.  profiles
2.  schedules
3.  wordbooks
4.  words               ← description 컬럼 포함
5.  word_count 트리거    ← words 테이블 생성 이후에만 생성 가능
6.  study_sessions
7.  study_results
8.  notifications
9.  schedules_repeat    ← repeat 컬럼 + schedule_exceptions 테이블
10. notifications_occurrence
11. profiles_settings   ← 설정 컬럼 추가 (quiz_mode, question_order, review_intervals 등)
```

---

## profiles

```sql
CREATE TABLE profiles (
  id                       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname                 text,
  avatar_url               text,
  review_policy            text    NOT NULL DEFAULT 'keep',
  quiz_mode                text    NOT NULL DEFAULT 'multiple_choice',
  question_order           text    NOT NULL DEFAULT 'random',
  review_intervals         text[]  NOT NULL DEFAULT '{7d,30d,90d}',
  schedule_notification    boolean NOT NULL DEFAULT true,
  review_notification      boolean NOT NULL DEFAULT true,
  review_notification_time text    NOT NULL DEFAULT '09:00',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
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
```

---

## schedules

```sql
CREATE TABLE schedules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title               text NOT NULL,
  location            text,
  starts_at           timestamptz NOT NULL,
  ends_at             timestamptz,
  is_all_day          boolean NOT NULL DEFAULT false,
  repeat_type         text NOT NULL DEFAULT 'none',
    -- 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly' | 'custom'
  repeat_unit         text,
  repeat_value        int,
  repeat_end_type     text NOT NULL DEFAULT 'none',
    -- 'none' | 'until' | 'count'
  repeat_until        date,
  repeat_count        int,
  parent_schedule_id  uuid REFERENCES schedules(id) ON DELETE SET NULL,
  alarm_minutes       int,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_schedules_user_starts ON schedules(user_id, starts_at);

ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedules_select" ON schedules FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "schedules_insert" ON schedules FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "schedules_update" ON schedules FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "schedules_delete" ON schedules FOR DELETE TO authenticated USING (auth.uid() = user_id);
```

---

## schedule_exceptions

```sql
CREATE TABLE schedule_exceptions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  schedule_id         uuid NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  occurrence_date     date NOT NULL,
  exception_type      text NOT NULL,  -- 'cancelled' | 'modified'
  original_starts_at  timestamptz NOT NULL,
  original_ends_at    timestamptz,
  title               text,
  location            text,
  starts_at           timestamptz,
  ends_at             timestamptz,
  is_all_day          boolean,
  alarm_minutes       int,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_schedule_exceptions_unique
  ON schedule_exceptions(schedule_id, occurrence_date);

CREATE INDEX idx_schedule_exceptions_user_date
  ON schedule_exceptions(user_id, occurrence_date);

ALTER TABLE schedule_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedule_exceptions_select" ON schedule_exceptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "schedule_exceptions_delete" ON schedule_exceptions FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "schedule_exceptions_insert"
  ON schedule_exceptions FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM schedules WHERE id = schedule_exceptions.schedule_id AND user_id = auth.uid())
  );
CREATE POLICY "schedule_exceptions_update"
  ON schedule_exceptions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM schedules WHERE id = schedule_exceptions.schedule_id AND user_id = auth.uid())
  );
```

---

## wordbooks

```sql
CREATE TABLE wordbooks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  language    text,
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
```

---

## words

```sql
CREATE TABLE words (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wordbook_id     uuid NOT NULL REFERENCES wordbooks(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  term            text NOT NULL,
  definition      text NOT NULL,
  description     text,
  example         text,
  memo            text,
  wrong_count     int NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'unseen',
    -- 'unseen' | 'learning' | 'reviewing' | 'mastered'
  review_step     int NOT NULL DEFAULT 0,
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
```

---

## word_count 트리거 (words 테이블 이후 실행)

```sql
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
```

---

## study_sessions

```sql
CREATE TABLE study_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_type  text NOT NULL,
    -- 'learn' | 'quiz' | 'review_quiz'
  wordbook_ids  uuid[],
  total_count   int NOT NULL,
  correct_count int NOT NULL DEFAULT 0,
  wrong_count   int NOT NULL DEFAULT 0,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_study_sessions_user ON study_sessions(user_id, created_at DESC);

ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "study_sessions_select" ON study_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "study_sessions_insert" ON study_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "study_sessions_update" ON study_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "study_sessions_delete" ON study_sessions FOR DELETE TO authenticated USING (auth.uid() = user_id);
```

---

## study_results

```sql
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
```

---

## notifications

```sql
CREATE TABLE notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  schedule_id  uuid NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  native_id    text,
  fire_at      timestamptz NOT NULL,
  is_cancelled boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_schedule  ON notifications(schedule_id);
CREATE INDEX idx_notifications_user_fire ON notifications(user_id, fire_at) WHERE is_cancelled = false;

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
```

---

## RLS 정책 구조 요약

| 테이블 | INSERT WITH CHECK | UPDATE 추가 조건 |
|--------|------------------|-----------------|
| profiles | `uid = id` | — |
| schedules | `uid = user_id` | — |
| schedule_exceptions | `uid = user_id` + schedule 소유 확인 | schedule 소유 확인 |
| wordbooks | `uid = user_id` | — |
| words | `uid = user_id` + wordbook 소유 확인 | wordbook 소유 확인 |
| study_sessions | `uid = user_id` | — |
| study_results | `uid = user_id` + session 소유 + word 소유 | session 소유 + word 소유 |
| notifications | `uid = user_id` + schedule 소유 확인 | schedule 소유 확인 |
