-- 30. public_content_audit_triggers — 공용 단어장/단어 CRUD를 admin_audit_log에 자동 기록
-- docs/ADMIN_DESIGN.md §4 참고 — "클라이언트가 로그 기록을 누락할 수 없도록" 트리거 방식을 채택.
-- 이 CRUD는 service_role 없이 클라이언트가 is_admin() RLS로 직접 쓰므로 트리거 내부의 auth.uid()는
-- 관리자 본인의 세션이다(마이그레이션 28/29가 다룬 "service_role은 auth.uid()가 NULL" 문제와 무관).

CREATE OR REPLACE FUNCTION log_public_wordbook_action()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
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

CREATE TRIGGER trg_log_public_wordbook_action
  AFTER INSERT OR UPDATE ON public_wordbooks
  FOR EACH ROW EXECUTE PROCEDURE log_public_wordbook_action();

-- public_words도 동일 패턴. 일괄 등록은 행마다 하나씩 기록되어 원안의 "public_word_bulk_import"
-- 단일 액션명과 달리 여러 건으로 남는다 — 감사 추적 정확도 측면에서는 오히려 더 상세하므로 그대로 채택.
CREATE OR REPLACE FUNCTION log_public_word_action()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
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

CREATE TRIGGER trg_log_public_word_action
  AFTER INSERT OR UPDATE ON public_words
  FOR EACH ROW EXECUTE PROCEDURE log_public_word_action();
