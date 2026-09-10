-- 48. 공용 단어장/단어/책/목차 DELETE 감사 로그 추가
--
-- 마이그레이션 30/41의 트리거는 AFTER INSERT OR UPDATE만 커버해 DELETE는 감사 로그에 전혀 남지
-- 않았다(그 시점엔 관리자 화면에 삭제 기능 자체가 없어 문제되지 않았음). 이번에 관리자/사용자
-- 화면에 실제 삭제 기능을 추가하면서 발견 — NEW 대신 OLD를 참조하도록 4개 함수를 확장하고
-- AFTER DELETE를 트리거 이벤트에 추가한다. docs/ADMIN_DESIGN.md §4 "모든 관리자 작업을 감사
-- 로그에 남긴다"는 원칙을 삭제에도 동일하게 적용.
--
-- 참고: public_wordbooks/public_books를 삭제하면 하위 public_words/public_book_chapters가
-- ON DELETE CASCADE로 함께 삭제되고, 그때마다 이 트리거들이 행마다 실행돼 감사 로그도 행마다
-- 남는다 — 일괄 등록 때와 동일한 기존 방침(상세할수록 좋다고 판단, 마이그레이션 30 주석 참고)을
-- 그대로 따른다.

CREATE OR REPLACE FUNCTION log_public_wordbook_action()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, detail)
    VALUES (auth.uid(), 'public_wordbook_delete', 'public_wordbook', OLD.id::text,
      jsonb_build_object('title', OLD.title, 'status', OLD.status));
    RETURN OLD;
  END IF;
  INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, detail)
  VALUES (
    auth.uid(),
    CASE
      WHEN TG_OP = 'INSERT' THEN 'public_wordbook_create'
      WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'public_wordbook_status_change'
      ELSE 'public_wordbook_update'
    END,
    'public_wordbook',
    NEW.id::text,
    jsonb_build_object('title', NEW.title, 'status', NEW.status)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_public_wordbook_action ON public_wordbooks;
CREATE TRIGGER trg_log_public_wordbook_action
  AFTER INSERT OR UPDATE OR DELETE ON public_wordbooks
  FOR EACH ROW EXECUTE PROCEDURE log_public_wordbook_action();

CREATE OR REPLACE FUNCTION log_public_word_action()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, detail)
    VALUES (auth.uid(), 'public_word_delete', 'public_word', OLD.id::text,
      jsonb_build_object('wordbook_id', OLD.wordbook_id, 'term', OLD.term, 'status', OLD.status));
    RETURN OLD;
  END IF;
  INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, detail)
  VALUES (
    auth.uid(),
    CASE
      WHEN TG_OP = 'INSERT' THEN 'public_word_create'
      WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'public_word_status_change'
      ELSE 'public_word_update'
    END,
    'public_word',
    NEW.id::text,
    jsonb_build_object('wordbook_id', NEW.wordbook_id, 'term', NEW.term, 'status', NEW.status)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_public_word_action ON public_words;
CREATE TRIGGER trg_log_public_word_action
  AFTER INSERT OR UPDATE OR DELETE ON public_words
  FOR EACH ROW EXECUTE PROCEDURE log_public_word_action();

CREATE OR REPLACE FUNCTION log_public_book_action()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, detail)
    VALUES (auth.uid(), 'public_book_delete', 'public_book', OLD.id::text,
      jsonb_build_object('title', OLD.title, 'status', OLD.status));
    RETURN OLD;
  END IF;
  INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, detail)
  VALUES (
    auth.uid(),
    CASE
      WHEN TG_OP = 'INSERT' THEN 'public_book_create'
      WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'public_book_status_change'
      ELSE 'public_book_update'
    END,
    'public_book',
    NEW.id::text,
    jsonb_build_object('title', NEW.title, 'status', NEW.status)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_public_book_action ON public_books;
CREATE TRIGGER trg_log_public_book_action
  AFTER INSERT OR UPDATE OR DELETE ON public_books
  FOR EACH ROW EXECUTE PROCEDURE log_public_book_action();

CREATE OR REPLACE FUNCTION log_public_book_chapter_action()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, detail)
    VALUES (auth.uid(), 'public_book_chapter_delete', 'public_book_chapter', OLD.id::text,
      jsonb_build_object('book_id', OLD.book_id, 'title', OLD.title, 'status', OLD.status));
    RETURN OLD;
  END IF;
  INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, detail)
  VALUES (
    auth.uid(),
    CASE
      WHEN TG_OP = 'INSERT' THEN 'public_book_chapter_create'
      WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'public_book_chapter_status_change'
      ELSE 'public_book_chapter_update'
    END,
    'public_book_chapter',
    NEW.id::text,
    jsonb_build_object('book_id', NEW.book_id, 'title', NEW.title, 'status', NEW.status)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_public_book_chapter_action ON public_book_chapters;
CREATE TRIGGER trg_log_public_book_chapter_action
  AFTER INSERT OR UPDATE OR DELETE ON public_book_chapters
  FOR EACH ROW EXECUTE PROCEDURE log_public_book_chapter_action();
