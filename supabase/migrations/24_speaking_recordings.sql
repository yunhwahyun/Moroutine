-- 24. speaking_recordings — 개인 스피킹 녹음 메타 (평가 없는 단순 버전, speaking_sentences 이후에만 생성 가능)
-- docs/SPEAKING_DESIGN.md §4-1, §6 참고
-- 문장당 녹음 1개(다시 녹음 = UPSERT). 구 버전의 expires_at/평가 연계 컬럼은 전부 제거.

CREATE TABLE speaking_recordings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sentence_id    uuid NOT NULL REFERENCES speaking_sentences(id) ON DELETE CASCADE,
  storage_path   text NOT NULL,
  mime_type      text,
    -- Web: 'audio/webm;codecs=opus' → .webm  /  Native: 'audio/m4a' → .m4a
  duration_ms    int,
  recorded_at    timestamptz NOT NULL DEFAULT now()
);
-- 문장당 녹음 1개 (다시 녹음 = UPSERT)
CREATE UNIQUE INDEX idx_speaking_recordings_sentence ON speaking_recordings(sentence_id);

ALTER TABLE speaking_recordings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "speaking_recordings_select" ON speaking_recordings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "speaking_recordings_insert" ON speaking_recordings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "speaking_recordings_update" ON speaking_recordings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "speaking_recordings_delete" ON speaking_recordings FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.speaking_recordings TO authenticated;
