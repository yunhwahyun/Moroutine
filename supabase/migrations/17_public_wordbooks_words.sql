-- 17. public_wordbooks / public_words — 관리자가 등록하는 공용 단어장
-- docs/ADMIN_DESIGN.md §3-2, §3-4 참고
-- 원본 참조 방식: 사용자는 조회·학습만 가능, 원본 수정/삭제는 Admin 전용.
-- 공용 단어는 물리 삭제하지 않고 status='archived'로 관리한다.

CREATE TABLE public_wordbooks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  description  text,
  category     text,
  difficulty   text NOT NULL DEFAULT 'beginner',
    -- 'beginner' | 'intermediate' | 'advanced'
  language     text NOT NULL DEFAULT 'en-US',
  status       text NOT NULL DEFAULT 'draft',
    -- 'draft' | 'published' | 'hidden' | 'archived'
  word_count   int NOT NULL DEFAULT 0,
  created_by   uuid NOT NULL REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_public_wordbooks_status ON public_wordbooks(status);

CREATE TABLE public_words (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wordbook_id     uuid NOT NULL REFERENCES public_wordbooks(id) ON DELETE CASCADE,
  term            text NOT NULL,
  definition      text NOT NULL,
  description     text,
  example         text,
  sort_order      int NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'active',
    -- 'active' | 'archived'  (물리 삭제 금지)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_public_words_wordbook ON public_words(wordbook_id, sort_order);
CREATE INDEX idx_public_words_status ON public_words(wordbook_id, status);

-- word_count 트리거 (기존 04_words.sql/05_word_count_trigger.sql의 sync_word_count와 동일 패턴, 공용 전용 별도 함수)
CREATE OR REPLACE FUNCTION sync_public_word_count()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public_wordbooks SET word_count = word_count + 1 WHERE id = NEW.wordbook_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public_wordbooks SET word_count = word_count - 1 WHERE id = OLD.wordbook_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_public_word_count
  AFTER INSERT OR DELETE ON public_words
  FOR EACH ROW EXECUTE PROCEDURE sync_public_word_count();

ALTER TABLE public_wordbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_words ENABLE ROW LEVEL SECURITY;

-- 조회: Pro/Premium/Master만 published 열람, Admin은 전체(draft 포함, 미리보기용) 열람
CREATE POLICY "public_wordbooks_select" ON public_wordbooks
  FOR SELECT TO authenticated USING (
    (status = 'published' AND get_service_tier(auth.uid()) IN ('pro', 'premium', 'master'))
    OR is_admin(auth.uid())
  );
CREATE POLICY "public_wordbooks_admin_write" ON public_wordbooks
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "public_words_select" ON public_words
  FOR SELECT TO authenticated USING (
    (status = 'active' AND EXISTS (
       SELECT 1 FROM public_wordbooks pw
       WHERE pw.id = public_words.wordbook_id AND pw.status = 'published'
     ) AND get_service_tier(auth.uid()) IN ('pro', 'premium', 'master'))
    OR is_admin(auth.uid())
  );
CREATE POLICY "public_words_admin_write" ON public_words
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.public_wordbooks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.public_words TO authenticated;
