-- 49. Guest→Remote 데이터 이전 RPC — books/book_chapters 추가
-- docs/MIGRATION_DESIGN.md §3 참고, docs/DECISION_LOG.md 2026-09-11
--
-- 배경: 마이그레이션 26(2026-07-18)이 이전 엔진을 만들 당시엔 책장(개인 books/book_chapters,
-- 마이그레이션 42, 2026-09-08)이 아직 존재하지 않아 이전 대상에서 빠져 있었다. Guest가 책장에
-- 콘텐츠를 만들고 로그인해도 "계정으로 이전"을 눌러도 서버로 전혀 넘어가지 않는 공백이었다.
-- 마이그레이션 35(재구독 시 기존 서버 행 재사용 판정)와 동일한 3-way 패턴(existing/owned/new_items)
-- 을 그대로 따른다. books → book_chapters 순서로 클라이언트가 호출해야 한다(word가 wordbook을
-- 필요로 하는 것과 동일한 부모-자식 관계).

-- ── books ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION migrate_books(
  p_migration_id uuid,
  p_books        jsonb   -- [{ local_id, name, language }, ...]
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
      NULLIF(elem->>'language', '') AS language
    FROM jsonb_array_elements(p_books) elem
    WHERE elem->>'local_id' NOT IN (SELECT e.local_id FROM existing e)
      AND elem->>'local_id' NOT IN (SELECT o.local_id FROM owned o)
  ),
  inserted AS (
    INSERT INTO books (id, user_id, name, language)
    SELECT server_id, v_user_id, name, language FROM new_items
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

-- ── book_chapters (부모 book 매핑 필수 — 없으면 스킵) ───────────────────────
CREATE OR REPLACE FUNCTION migrate_book_chapters(
  p_migration_id uuid,
  p_chapters     jsonb   -- [{ local_id, book_local_id, title, content, sort_order }, ...]
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
    WHERE m.migration_id = p_migration_id AND m.entity_type = 'book_chapter'
  ),
  owned AS (
    SELECT elem->>'local_id' AS local_id, c.id AS server_id
    FROM jsonb_array_elements(p_chapters) elem
    JOIN book_chapters c ON c.id = (elem->>'local_id')::uuid AND c.user_id = v_user_id
    WHERE elem->>'local_id' NOT IN (SELECT e.local_id FROM existing e)
  ),
  new_items AS (
    SELECT
      elem->>'local_id' AS local_id,
      gen_random_uuid()  AS server_id,
      bm.server_id       AS book_id,
      elem->>'title' AS title,
      elem->>'content' AS content,
      COALESCE((elem->>'sort_order')::int, 0) AS sort_order
    FROM jsonb_array_elements(p_chapters) elem
    JOIN migration_id_map bm
      ON bm.migration_id = p_migration_id AND bm.entity_type = 'book'
     AND bm.local_id = elem->>'book_local_id'
    WHERE elem->>'local_id' NOT IN (SELECT e.local_id FROM existing e)
      AND elem->>'local_id' NOT IN (SELECT o.local_id FROM owned o)
  ),
  inserted AS (
    INSERT INTO book_chapters (id, book_id, user_id, title, content, sort_order)
    SELECT server_id, book_id, v_user_id, title, content, sort_order FROM new_items
    RETURNING id
  ),
  inserted_map AS (
    INSERT INTO migration_id_map (migration_id, entity_type, local_id, server_id)
    SELECT p_migration_id, 'book_chapter', new_items.local_id, new_items.server_id FROM new_items
    RETURNING migration_id_map.local_id, migration_id_map.server_id
  ),
  owned_map AS (
    INSERT INTO migration_id_map (migration_id, entity_type, local_id, server_id)
    SELECT p_migration_id, 'book_chapter', owned.local_id, owned.server_id FROM owned
    RETURNING migration_id_map.local_id, migration_id_map.server_id
  )
  SELECT im.local_id, im.server_id FROM inserted_map im
  UNION ALL
  SELECT om.local_id, om.server_id FROM owned_map om
  UNION ALL
  SELECT e.local_id, e.server_id FROM existing e;
END;
$$;
