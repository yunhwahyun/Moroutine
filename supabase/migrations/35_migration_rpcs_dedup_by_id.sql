-- 35. 마이그레이션 RPC 6종 — 재구독 시 기존 서버 행 중복 생성 방지
-- docs/MIGRATION_DESIGN.md §3-1 참고, docs/DECISION_LOG.md 2026-09-01
--
-- 문제: 구독 해제(remoteToLocalMigration.ts)는 서버 UUID를 그대로 로컬 id로 재사용해 내려받는다.
-- 이후 재구독해서 다시 "계정으로 이전"(guestToRemoteMigration.ts)을 실행하면, 마이그레이션 26의
-- idempotency 체크가 "같은 migration_id 안에서 이미 매핑됐는지"만 보기 때문에(재구독은 새 migration_id로
-- 시작) 구독 해제 전부터 서버에 있던 행이 gen_random_uuid()로 전부 새로 INSERT되어 중복 생성된다.
--
-- 해결: 로컬 id는 항상 crypto.randomUUID()(서버와 동일한 UUID 공간)로 생성되므로, local_id가 이미 이
-- 사용자 소유의 서버 행 id와 같으면(=원래 다운로드로 내려온 행) 새로 INSERT하지 않고 migration_id_map에
-- "그대로 재사용" 매핑만 추가한다(자식 엔티티가 부모를 찾을 수 있도록). 순수 로컬 전용으로 새로 만들어진
-- 행이 우연히 기존 서버 id와 충돌할 확률은 사실상 0이므로 이 판별은 안전하다.

-- ── wordbooks ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION migrate_wordbooks(
  p_migration_id uuid,
  p_wordbooks    jsonb
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
      NULLIF(elem->>'language', '') AS language
    FROM jsonb_array_elements(p_wordbooks) elem
    WHERE elem->>'local_id' NOT IN (SELECT e.local_id FROM existing e)
      AND elem->>'local_id' NOT IN (SELECT o.local_id FROM owned o)
  ),
  inserted AS (
    INSERT INTO wordbooks (id, user_id, name, description, language)
    SELECT server_id, v_user_id, name, description, language FROM new_items
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

-- ── words ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION migrate_words(
  p_migration_id uuid,
  p_words        jsonb
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
    WHERE m.migration_id = p_migration_id AND m.entity_type = 'word'
  ),
  owned AS (
    SELECT elem->>'local_id' AS local_id, w.id AS server_id
    FROM jsonb_array_elements(p_words) elem
    JOIN words w ON w.id = (elem->>'local_id')::uuid AND w.user_id = v_user_id
    WHERE elem->>'local_id' NOT IN (SELECT e.local_id FROM existing e)
  ),
  new_items AS (
    SELECT
      elem->>'local_id' AS local_id,
      gen_random_uuid()  AS server_id,
      wm.server_id       AS wordbook_id,
      elem->>'term' AS term,
      elem->>'definition' AS definition,
      NULLIF(elem->>'description', '') AS description,
      NULLIF(elem->>'example', '') AS example,
      NULLIF(elem->>'memo', '') AS memo,
      COALESCE(elem->>'status', 'unseen') AS status,
      COALESCE((elem->>'review_step')::int, 0) AS review_step,
      NULLIF(elem->>'first_passed_at', '')::timestamptz AS first_passed_at,
      NULLIF(elem->>'next_review_at', '')::timestamptz AS next_review_at,
      COALESCE((elem->>'wrong_count')::int, 0) AS wrong_count
    FROM jsonb_array_elements(p_words) elem
    JOIN migration_id_map wm
      ON wm.migration_id = p_migration_id AND wm.entity_type = 'wordbook'
     AND wm.local_id = elem->>'wordbook_local_id'
    WHERE elem->>'local_id' NOT IN (SELECT e.local_id FROM existing e)
      AND elem->>'local_id' NOT IN (SELECT o.local_id FROM owned o)
  ),
  inserted AS (
    INSERT INTO words (
      id, wordbook_id, user_id, term, definition, description, example, memo,
      status, review_step, first_passed_at, next_review_at, wrong_count
    )
    SELECT
      server_id, wordbook_id, v_user_id, term, definition, description, example, memo,
      status, review_step, first_passed_at, next_review_at, wrong_count
    FROM new_items
    RETURNING id
  ),
  inserted_map AS (
    INSERT INTO migration_id_map (migration_id, entity_type, local_id, server_id)
    SELECT p_migration_id, 'word', new_items.local_id, new_items.server_id FROM new_items
    RETURNING migration_id_map.local_id, migration_id_map.server_id
  ),
  owned_map AS (
    INSERT INTO migration_id_map (migration_id, entity_type, local_id, server_id)
    SELECT p_migration_id, 'word', owned.local_id, owned.server_id FROM owned
    RETURNING migration_id_map.local_id, migration_id_map.server_id
  )
  SELECT im.local_id, im.server_id FROM inserted_map im
  UNION ALL
  SELECT om.local_id, om.server_id FROM owned_map om
  UNION ALL
  SELECT e.local_id, e.server_id FROM existing e;
END;
$$;

-- ── schedules ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION migrate_schedules(
  p_migration_id uuid,
  p_schedules    jsonb
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
    WHERE m.migration_id = p_migration_id AND m.entity_type = 'schedule'
  ),
  owned AS (
    SELECT elem->>'local_id' AS local_id, s.id AS server_id
    FROM jsonb_array_elements(p_schedules) elem
    JOIN schedules s ON s.id = (elem->>'local_id')::uuid AND s.user_id = v_user_id
    WHERE elem->>'local_id' NOT IN (SELECT e.local_id FROM existing e)
  ),
  new_items AS (
    SELECT
      elem->>'local_id' AS local_id,
      gen_random_uuid()  AS server_id,
      pm.server_id       AS parent_schedule_id,
      elem->>'title' AS title,
      NULLIF(elem->>'location', '') AS location,
      (elem->>'starts_at')::timestamptz AS starts_at,
      NULLIF(elem->>'ends_at', '')::timestamptz AS ends_at,
      COALESCE((elem->>'is_all_day')::boolean, false) AS is_all_day,
      COALESCE(elem->>'repeat_type', 'none') AS repeat_type,
      NULLIF(elem->>'repeat_unit', '') AS repeat_unit,
      NULLIF(elem->>'repeat_value', '')::int AS repeat_value,
      COALESCE(elem->>'repeat_end_type', 'none') AS repeat_end_type,
      NULLIF(elem->>'repeat_until', '')::date AS repeat_until,
      NULLIF(elem->>'repeat_count', '')::int AS repeat_count,
      NULLIF(elem->>'alarm_minutes', '')::int AS alarm_minutes
    FROM jsonb_array_elements(p_schedules) elem
    LEFT JOIN migration_id_map pm
      ON pm.migration_id = p_migration_id AND pm.entity_type = 'schedule'
     AND pm.local_id = elem->>'parent_local_id'
    WHERE elem->>'local_id' NOT IN (SELECT e.local_id FROM existing e)
      AND elem->>'local_id' NOT IN (SELECT o.local_id FROM owned o)
  ),
  inserted AS (
    INSERT INTO schedules (
      id, user_id, title, location, starts_at, ends_at, is_all_day,
      repeat_type, repeat_unit, repeat_value, repeat_end_type, repeat_until,
      repeat_count, parent_schedule_id, alarm_minutes
    )
    SELECT
      server_id, v_user_id, title, location, starts_at, ends_at, is_all_day,
      repeat_type, repeat_unit, repeat_value, repeat_end_type, repeat_until,
      repeat_count, parent_schedule_id, alarm_minutes
    FROM new_items
    RETURNING id
  ),
  inserted_map AS (
    INSERT INTO migration_id_map (migration_id, entity_type, local_id, server_id)
    SELECT p_migration_id, 'schedule', new_items.local_id, new_items.server_id FROM new_items
    RETURNING migration_id_map.local_id, migration_id_map.server_id
  ),
  owned_map AS (
    INSERT INTO migration_id_map (migration_id, entity_type, local_id, server_id)
    SELECT p_migration_id, 'schedule', owned.local_id, owned.server_id FROM owned
    RETURNING migration_id_map.local_id, migration_id_map.server_id
  )
  SELECT im.local_id, im.server_id FROM inserted_map im
  UNION ALL
  SELECT om.local_id, om.server_id FROM owned_map om
  UNION ALL
  SELECT e.local_id, e.server_id FROM existing e;
END;
$$;

-- ── schedule_exceptions ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION migrate_schedule_exceptions(
  p_migration_id uuid,
  p_exceptions   jsonb
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
    WHERE m.migration_id = p_migration_id AND m.entity_type = 'schedule_exception'
  ),
  owned AS (
    SELECT elem->>'local_id' AS local_id, se.id AS server_id
    FROM jsonb_array_elements(p_exceptions) elem
    JOIN schedule_exceptions se ON se.id = (elem->>'local_id')::uuid AND se.user_id = v_user_id
    WHERE elem->>'local_id' NOT IN (SELECT e.local_id FROM existing e)
  ),
  new_items AS (
    SELECT
      elem->>'local_id' AS local_id,
      gen_random_uuid()  AS server_id,
      sm.server_id       AS schedule_id,
      (elem->>'occurrence_date')::date AS occurrence_date,
      elem->>'exception_type' AS exception_type,
      (elem->>'original_starts_at')::timestamptz AS original_starts_at,
      NULLIF(elem->>'original_ends_at', '')::timestamptz AS original_ends_at,
      NULLIF(elem->>'title', '') AS title,
      NULLIF(elem->>'location', '') AS location,
      NULLIF(elem->>'starts_at', '')::timestamptz AS starts_at,
      NULLIF(elem->>'ends_at', '')::timestamptz AS ends_at,
      (elem->>'is_all_day')::boolean AS is_all_day,
      NULLIF(elem->>'alarm_minutes', '')::int AS alarm_minutes
    FROM jsonb_array_elements(p_exceptions) elem
    JOIN migration_id_map sm
      ON sm.migration_id = p_migration_id AND sm.entity_type = 'schedule'
     AND sm.local_id = elem->>'schedule_local_id'
    WHERE elem->>'local_id' NOT IN (SELECT e.local_id FROM existing e)
      AND elem->>'local_id' NOT IN (SELECT o.local_id FROM owned o)
  ),
  inserted AS (
    INSERT INTO schedule_exceptions (
      id, user_id, schedule_id, occurrence_date, exception_type,
      original_starts_at, original_ends_at, title, location, starts_at, ends_at,
      is_all_day, alarm_minutes
    )
    SELECT
      server_id, v_user_id, schedule_id, occurrence_date, exception_type,
      original_starts_at, original_ends_at, title, location, starts_at, ends_at,
      is_all_day, alarm_minutes
    FROM new_items
    RETURNING id
  ),
  inserted_map AS (
    INSERT INTO migration_id_map (migration_id, entity_type, local_id, server_id)
    SELECT p_migration_id, 'schedule_exception', new_items.local_id, new_items.server_id FROM new_items
    RETURNING migration_id_map.local_id, migration_id_map.server_id
  ),
  owned_map AS (
    INSERT INTO migration_id_map (migration_id, entity_type, local_id, server_id)
    SELECT p_migration_id, 'schedule_exception', owned.local_id, owned.server_id FROM owned
    RETURNING migration_id_map.local_id, migration_id_map.server_id
  )
  SELECT im.local_id, im.server_id FROM inserted_map im
  UNION ALL
  SELECT om.local_id, om.server_id FROM owned_map om
  UNION ALL
  SELECT e.local_id, e.server_id FROM existing e;
END;
$$;

-- ── study_sessions ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION migrate_study_sessions(
  p_migration_id uuid,
  p_sessions     jsonb
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
    WHERE m.migration_id = p_migration_id AND m.entity_type = 'study_session'
  ),
  owned AS (
    SELECT elem->>'local_id' AS local_id, ss.id AS server_id
    FROM jsonb_array_elements(p_sessions) elem
    JOIN study_sessions ss ON ss.id = (elem->>'local_id')::uuid AND ss.user_id = v_user_id
    WHERE elem->>'local_id' NOT IN (SELECT e.local_id FROM existing e)
  ),
  new_items AS (
    SELECT
      elem->>'local_id' AS local_id,
      gen_random_uuid()  AS server_id,
      elem->>'session_type' AS session_type,
      (
        SELECT array_agg(wm.server_id) FROM jsonb_array_elements_text(
          COALESCE(elem->'wordbook_local_ids', '[]'::jsonb)
        ) wid
        JOIN migration_id_map wm
          ON wm.migration_id = p_migration_id AND wm.entity_type = 'wordbook' AND wm.local_id = wid
      ) AS wordbook_ids,
      (elem->>'total_count')::int AS total_count,
      COALESCE((elem->>'correct_count')::int, 0) AS correct_count,
      COALESCE((elem->>'wrong_count')::int, 0) AS wrong_count,
      NULLIF(elem->>'completed_at', '')::timestamptz AS completed_at,
      COALESCE(NULLIF(elem->>'created_at', '')::timestamptz, now()) AS created_at
    FROM jsonb_array_elements(p_sessions) elem
    WHERE elem->>'local_id' NOT IN (SELECT e.local_id FROM existing e)
      AND elem->>'local_id' NOT IN (SELECT o.local_id FROM owned o)
  ),
  inserted AS (
    INSERT INTO study_sessions (
      id, user_id, session_type, wordbook_ids, total_count, correct_count, wrong_count,
      completed_at, created_at
    )
    SELECT
      server_id, v_user_id, session_type, wordbook_ids, total_count, correct_count, wrong_count,
      completed_at, created_at
    FROM new_items
    RETURNING id
  ),
  inserted_map AS (
    INSERT INTO migration_id_map (migration_id, entity_type, local_id, server_id)
    SELECT p_migration_id, 'study_session', new_items.local_id, new_items.server_id FROM new_items
    RETURNING migration_id_map.local_id, migration_id_map.server_id
  ),
  owned_map AS (
    INSERT INTO migration_id_map (migration_id, entity_type, local_id, server_id)
    SELECT p_migration_id, 'study_session', owned.local_id, owned.server_id FROM owned
    RETURNING migration_id_map.local_id, migration_id_map.server_id
  )
  SELECT im.local_id, im.server_id FROM inserted_map im
  UNION ALL
  SELECT om.local_id, om.server_id FROM owned_map om
  UNION ALL
  SELECT e.local_id, e.server_id FROM existing e;
END;
$$;

-- ── study_results ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION migrate_study_results(
  p_migration_id uuid,
  p_results      jsonb
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
    WHERE m.migration_id = p_migration_id AND m.entity_type = 'study_result'
  ),
  owned AS (
    SELECT elem->>'local_id' AS local_id, sr.id AS server_id
    FROM jsonb_array_elements(p_results) elem
    JOIN study_results sr ON sr.id = (elem->>'local_id')::uuid AND sr.user_id = v_user_id
    WHERE elem->>'local_id' NOT IN (SELECT e.local_id FROM existing e)
  ),
  new_items AS (
    SELECT
      elem->>'local_id' AS local_id,
      gen_random_uuid()  AS server_id,
      sm.server_id       AS session_id,
      wm.server_id       AS word_id,
      (elem->>'is_correct')::boolean AS is_correct,
      COALESCE((elem->>'attempt_count')::int, 1) AS attempt_count,
      COALESCE(NULLIF(elem->>'answered_at', '')::timestamptz, now()) AS answered_at
    FROM jsonb_array_elements(p_results) elem
    JOIN migration_id_map sm
      ON sm.migration_id = p_migration_id AND sm.entity_type = 'study_session'
     AND sm.local_id = elem->>'session_local_id'
    JOIN migration_id_map wm
      ON wm.migration_id = p_migration_id AND wm.entity_type = 'word'
     AND wm.local_id = elem->>'word_local_id'
    WHERE elem->>'local_id' NOT IN (SELECT e.local_id FROM existing e)
      AND elem->>'local_id' NOT IN (SELECT o.local_id FROM owned o)
  ),
  inserted AS (
    INSERT INTO study_results (id, session_id, word_id, user_id, is_correct, attempt_count, answered_at)
    SELECT server_id, session_id, word_id, v_user_id, is_correct, attempt_count, answered_at
    FROM new_items
    RETURNING id
  ),
  inserted_map AS (
    INSERT INTO migration_id_map (migration_id, entity_type, local_id, server_id)
    SELECT p_migration_id, 'study_result', new_items.local_id, new_items.server_id FROM new_items
    RETURNING migration_id_map.local_id, migration_id_map.server_id
  ),
  owned_map AS (
    INSERT INTO migration_id_map (migration_id, entity_type, local_id, server_id)
    SELECT p_migration_id, 'study_result', owned.local_id, owned.server_id FROM owned
    RETURNING migration_id_map.local_id, migration_id_map.server_id
  )
  SELECT im.local_id, im.server_id FROM inserted_map im
  UNION ALL
  SELECT om.local_id, om.server_id FROM owned_map om
  UNION ALL
  SELECT e.local_id, e.server_id FROM existing e;
END;
$$;
