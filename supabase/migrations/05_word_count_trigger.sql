-- 5. word_count 트리거 (반드시 words 테이블 DDL 이후에 실행)
CREATE OR REPLACE FUNCTION sync_word_count()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE wordbooks SET word_count = word_count + 1 WHERE id = NEW.wordbook_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE wordbooks SET word_count = word_count - 1 WHERE id = OLD.wordbook_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_word_count
  AFTER INSERT OR DELETE ON words
  FOR EACH ROW EXECUTE PROCEDURE sync_word_count();
