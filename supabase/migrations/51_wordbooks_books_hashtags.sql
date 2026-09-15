-- 51. 개인 단어장/책장 해시태그
-- docs/DECISION_LOG.md 2026-09-15, docs/DB_SCHEMA.md 참고
--
-- wordbooks/books(개인 전용, 공용 public_wordbooks/public_books는 대상 아님)에
-- hashtags text[] 컬럼을 추가한다. RLS는 컬럼 추가라 기존 4종 정책 그대로 적용(변경 없음).
--
-- migrate_wordbooks/migrate_books RPC(마이그레이션 35/49로 재정의된 최신 버전)도 함께
-- 재정의해 hashtags를 실어 나른다 — 안 하면 Guest→Remote 계정 이전 시 태그가 유실된다.

ALTER TABLE wordbooks ADD COLUMN hashtags text[] NOT NULL DEFAULT '{}';
ALTER TABLE books     ADD COLUMN hashtags text[] NOT NULL DEFAULT '{}';

-- ── wordbooks 이전 RPC 재정의(마이그레이션 35 버전 + hashtags) ─────────────
CREATE OR REPLACE FUNCTION migrate_wordbooks(
  p_migration_id uuid,
  p_wordbooks    jsonb   -- [{ local_id, name, description, language, hashtags: string[] }, ...]
) RETURNS TABLE (local_id text, server_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM migration_jobs WHERE id = p_migration_id AND user_id = v_user_id) THEN
    RAISE EXCEPTION 'migration job not found or not owned by user';
  END IF;

  RETURN QUERY
  WITH existing AS (
    SELECT m.local_id, m.server_id FROM migration_id_map m
    WHERE m.migration_id = p_migration_id AND m.entity_type = 'wordbook'
  ),
  owned AS (
    SELECT elem->>'local_id' AS local_id, w.id AS server_id
    FROM jsonb_array_elements(p_wordbooks) elem
    JOIN wordbooks w ON w.id = (elem->>'local_id')::uuid AND w.user_id = v_user_id
    WHERE elem->>'local_id' NOT IN (SELECT e.local_id FROM existing e)
  ),
  new_items AS (
    SELECT
      elem->>'local_id' AS local_id,
      gen_random_uuid()  AS server_id,
      elem->>'name' AS name,
      NULLIF(elem->>'description', '') AS description,
      NULLIF(elem->>'language', '') AS language,
      COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(elem->'hashtags', '[]'::jsonb))),
        '{}'
      ) AS hashtags
    FROM jsonb_array_elements(p_wordbooks) elem
    WHERE elem->>'local_id' NOT IN (SELECT e.local_id FROM existing e)
      AND elem->>'local_id' NOT IN (SELECT o.local_id FROM owned o)
  ),
  inserted AS (
    INSERT INTO wordbooks (id, user_id, name, description, language, hashtags)
    SELECT server_id, v_user_id, name, description, language, hashtags FROM new_items
    RETURNING id
  ),
  inserted_map AS (
    INSERT INTO migration_id_map (migration_id, entity_type, local_id, server_id)
    SELECT p_migration_id, 'wordbook', new_items.local_id, new_items.server_id FROM new_items
    RETURNING migration_id_map.local_id, migration_id_map.server_id
  ),
  owned_map AS (
    INSERT INTO migration_id_map (migration_id, entity_type, local_id, server_id)
    SELECT p_migration_id, 'wordbook', owned.local_id, owned.server_id FROM owned
    RETURNING migration_id_map.local_id, migration_id_map.server_id
  )
  SELECT im.local_id, im.server_id FROM inserted_map im
  UNION ALL
  SELECT om.local_id, om.server_id FROM owned_map om
  UNION ALL
  SELECT e.local_id, e.server_id FROM existing e;
END;
$$;

-- ── books 이전 RPC 재정의(마이그레이션 49 버전 + hashtags) ─────────────────
CREATE OR REPLACE FUNCTION migrate_books(
  p_migration_id uuid,
  p_books        jsonb   -- [{ local_id, name, language, hashtags: string[] }, ...]
) RETURNS TABLE (local_id text, server_id uuid)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM migration_jobs WHERE id = p_migration_id AND user_id = v_user_id) THEN
    RAISE EXCEPTION 'migration job not found or not owned by user';
  END IF;

  RETURN QUERY
  WITH existing AS (
    SELECT m.local_id, m.server_id FROM migration_id_map m
    WHERE m.migration_id = p_migration_id AND m.entity_type = 'book'
  ),
  owned AS (
    SELECT elem->>'local_id' AS local_id, b.id AS server_id
    FROM jsonb_array_elements(p_books) elem
    JOIN books b ON b.id = (elem->>'local_id')::uuid AND b.user_id = v_user_id
    WHERE elem->>'local_id' NOT IN (SELECT e.local_id FROM existing e)
  ),
  new_items AS (
    SELECT
      elem->>'local_id' AS local_id,
      gen_random_uuid()  AS server_id,
      elem->>'name' AS name,
      NULLIF(elem->>'language', '') AS language,
      COALESCE(
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(elem->'hashtags', '[]'::jsonb))),
        '{}'
      ) AS hashtags
    FROM jsonb_array_elements(p_books) elem
    WHERE elem->>'local_id' NOT IN (SELECT e.local_id FROM existing e)
      AND elem->>'local_id' NOT IN (SELECT o.local_id FROM owned o)
  ),
  inserted AS (
    INSERT INTO books (id, user_id, name, language, hashtags)
    SELECT server_id, v_user_id, name, language, hashtags FROM new_items
    RETURNING id
  ),
  inserted_map AS (
    INSERT INTO migration_id_map (migration_id, entity_type, local_id, server_id)
    SELECT p_migration_id, 'book', new_items.local_id, new_items.server_id FROM new_items
    RETURNING migration_id_map.local_id, migration_id_map.server_id
  ),
  owned_map AS (
    INSERT INTO migration_id_map (migration_id, entity_type, local_id, server_id)
    SELECT p_migration_id, 'book', owned.local_id, owned.server_id FROM owned
    RETURNING migration_id_map.local_id, migration_id_map.server_id
  )
  SELECT im.local_id, im.server_id FROM inserted_map im
  UNION ALL
  SELECT om.local_id, om.server_id FROM owned_map om
  UNION ALL
  SELECT e.local_id, e.server_id FROM existing e;
END;
$$;
