-- 6. study_sessions
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_sessions TO authenticated;
