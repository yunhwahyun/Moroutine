-- 23. speaking_sentences — 개인 스피킹 문장 (평가 기능 없는 신규 설계)
-- docs/SPEAKING_DESIGN.md §4-1 참고
-- 관리자 배포 콘텐츠가 아니라 사용자 개인 데이터다(단어장/단어와 동일한 소유 구조).
-- 구 버전의 speaking_tasks(관리자 과제)/speaking_sessions(과제 세션)는 실제 파일로 만들어진 적이 없어
-- 별도 DROP 없이 이 설계로 완전히 대체한다(docs/DECISION_LOG.md 2026-07-18 참고).

CREATE TABLE speaking_sentences (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text         text NOT NULL,
  translation  text,
  language     text NOT NULL DEFAULT 'en-US',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_speaking_sentences_user ON speaking_sentences(user_id, created_at DESC);

ALTER TABLE speaking_sentences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "speaking_sentences_select" ON speaking_sentences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "speaking_sentences_insert" ON speaking_sentences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "speaking_sentences_update" ON speaking_sentences FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "speaking_sentences_delete" ON speaking_sentences FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.speaking_sentences TO authenticated;
