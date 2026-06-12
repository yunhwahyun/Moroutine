-- 4. words (description 컬럼 포함)
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.words TO authenticated;
