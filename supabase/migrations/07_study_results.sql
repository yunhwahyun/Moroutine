-- 7. study_results
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_results TO authenticated;
