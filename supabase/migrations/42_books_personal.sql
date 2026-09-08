-- 42. books / book_chapters — 개인 책장(사용자가 직접 만드는 책, 단어장/단어와 동일한 소유 구조)
-- docs/ADMIN_DESIGN.md §8 참고. 마이그레이션 41의 public_books/public_book_chapters(관리자
-- 큐레이션)와는 완전히 별개 테이블 — 이쪽은 wordbooks/words와 동일하게 auth.uid() = user_id로만
-- 소유를 판정한다(상태값/게시 개념 없음). 학습/퀴즈/복습 없음 — chapter_count만 words의
-- word_count와 동일한 트리거 패턴으로 유지한다.

CREATE TABLE books (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  language      text,
  chapter_count int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_books_user ON books(user_id);

ALTER TABLE books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "books_select" ON books FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "books_insert" ON books FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "books_update" ON books FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "books_delete" ON books FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE book_chapters (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id     uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  content     text NOT NULL,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_book_chapters_book ON book_chapters(book_id);

ALTER TABLE book_chapters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "book_chapters_select" ON book_chapters FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "book_chapters_delete" ON book_chapters FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "book_chapters_insert"
  ON book_chapters FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM books WHERE books.id = book_chapters.book_id AND books.user_id = auth.uid())
  );
CREATE POLICY "book_chapters_update"
  ON book_chapters FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM books WHERE books.id = book_chapters.book_id AND books.user_id = auth.uid())
  );

-- chapter_count 트리거 (sync_word_count와 동일 패턴)
CREATE OR REPLACE FUNCTION sync_book_chapter_count()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE books SET chapter_count = chapter_count + 1 WHERE id = NEW.book_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE books SET chapter_count = chapter_count - 1 WHERE id = OLD.book_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_book_chapter_count
  AFTER INSERT OR DELETE ON book_chapters
  FOR EACH ROW EXECUTE PROCEDURE sync_book_chapter_count();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.books TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.book_chapters TO authenticated;
