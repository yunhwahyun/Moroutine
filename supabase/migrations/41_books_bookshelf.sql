-- 41. books / book_chapters — "책장" 기능(순수 읽기/듣기 전용 콘텐츠)
-- docs/ADMIN_DESIGN.md §책장 참고
-- 공용 단어장(17/30)과 동일한 구조(Admin만 쓰기, Pro/Master만 조회, 감사 로그 트리거)를 따르되
-- 학습/퀴즈/진행률/개인 복사("담기")가 전혀 없어 훨씬 단순하다 — description/category/difficulty
-- 같은 부가 필드, enrollment/progress 테이블, anon(Guest) 열람 예외 전부 만들지 않는다.

CREATE TABLE books (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  language      text,
    -- nullable, 선택사항 — 재생은 language와 무관하게 항상 en-US로 고정된다(책장은 원어 듣기 전용).
  status        text NOT NULL DEFAULT 'draft',
    -- 'draft' | 'published' | 'archived'
  chapter_count int NOT NULL DEFAULT 0,
  created_by    uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_books_status ON books(status);

CREATE TABLE book_chapters (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id     uuid NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  title       text NOT NULL,
  content     text NOT NULL,
  sort_order  int NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'active',
    -- 'active' | 'archived' (물리 삭제 금지, 공용 단어장과 동일 정책)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_book_chapters_book ON book_chapters(book_id, sort_order);
CREATE INDEX idx_book_chapters_status ON book_chapters(book_id, status);

-- chapter_count 트리거 (sync_public_word_count와 동일 패턴)
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

-- 감사 로그 트리거 (log_public_wordbook_action/log_public_word_action과 동일 패턴)
CREATE OR REPLACE FUNCTION log_book_action()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, detail)
  VALUES (
    auth.uid(),
    CASE
      WHEN TG_OP = 'INSERT' THEN 'book_create'
      WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'book_status_change'
      ELSE 'book_update'
    END,
    'book',
    NEW.id::text,
    jsonb_build_object('title', NEW.title, 'status', NEW.status)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_book_action
  AFTER INSERT OR UPDATE ON books
  FOR EACH ROW EXECUTE PROCEDURE log_book_action();

-- 일괄 등록은 파일 하나(=목차 하나)마다 별도 insert이므로 자연히 행마다 기록된다(공용 단어와 동일 판단).
CREATE OR REPLACE FUNCTION log_book_chapter_action()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, detail)
  VALUES (
    auth.uid(),
    CASE
      WHEN TG_OP = 'INSERT' THEN 'book_chapter_create'
      WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'book_chapter_status_change'
      ELSE 'book_chapter_update'
    END,
    'book_chapter',
    NEW.id::text,
    jsonb_build_object('book_id', NEW.book_id, 'title', NEW.title, 'status', NEW.status)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_book_chapter_action
  AFTER INSERT OR UPDATE ON book_chapters
  FOR EACH ROW EXECUTE PROCEDURE log_book_chapter_action();

ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE book_chapters ENABLE ROW LEVEL SECURITY;

-- 조회: Pro/Master만 published 열람, Admin은 전체(draft 포함, 미리보기용) 열람. Guest(anon)는 대상 아님.
CREATE POLICY "books_select" ON books
  FOR SELECT TO authenticated USING (
    (status = 'published' AND get_service_tier(auth.uid()) IN ('pro', 'master'))
    OR is_admin(auth.uid())
  );
CREATE POLICY "books_admin_write" ON books
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "book_chapters_select" ON book_chapters
  FOR SELECT TO authenticated USING (
    (status = 'active' AND EXISTS (
       SELECT 1 FROM books b
       WHERE b.id = book_chapters.book_id AND b.status = 'published'
     ) AND get_service_tier(auth.uid()) IN ('pro', 'master'))
    OR is_admin(auth.uid())
  );
CREATE POLICY "book_chapters_admin_write" ON book_chapters
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.books TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.book_chapters TO authenticated;
