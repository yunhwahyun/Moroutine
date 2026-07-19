-- 26. Guest→Remote 데이터 이전 RPC 모음
-- docs/MIGRATION_DESIGN.md §3 참고
-- 엔티티 타입별로 함수를 분리한다(wordbooks → words → schedules → schedule_exceptions →
-- study_sessions → study_results 순서로 클라이언트가 호출, docs/MIGRATION_DESIGN.md §3-2).
--
-- 공통 Idempotency 패턴: (migration_id, entity_type, local_id)가 이미 migration_id_map에 있으면
-- 재삽입하지 않고 기존 매핑을 그대로 반환한다 — 네트워크 중단 후 재실행해도 중복이 생기지 않는다.
-- 부모 참조가 아직 이전되지 않은 자식 행은 JOIN에서 자연스럽게 빠진다(§3-2 "부모가 실패하면
-- 해당 서브트리를 건너뛴다" 원칙) — 클라이언트는 응답 개수가 요청 개수보다 적으면 이를 감지해야 한다.
-- words 테이블만 예외로 Pro 한도 검증을 하지 않는다(§10 정책 — 이전은 항상 전량 성공).

-- ── wordbooks ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION migrate_wordbooks(
  p_migration_id uuid,
  p_wordbooks    jsonb   -- [{ local_id, name, description, language }, ...]
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
  new_items AS (
    SELECT
      elem->>'local_id' AS local_id,
      gen_random_uuid()  AS server_id,
      elem->>'name' AS name,
      NULLIF(elem->>'description', '') AS description,
      NULLIF(elem->>'language', '') AS language
    FROM jsonb_array_elements(p_wordbooks) elem
    WHERE elem->>'local_id' NOT IN (SELECT e.local_id FROM existing e)
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
  )
  SELECT im.local_id, im.server_id FROM inserted_map im
  UNION ALL
  SELECT e.local_id, e.server_id FROM existing e;
END;
$$;

-- ── words (Pro 한도 무시, 항상 전량 이전) ──────────────────────────────────
CREATE OR REPLACE FUNCTION migrate_words(
  p_migration_id uuid,
  p_words        jsonb
    -- [{ local_id, wordbook_local_id, term, definition, description, example, memo,
    --    status, review_step, first_passed_at, next_review_at, wrong_count }, ...]
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
  )
  SELECT im.local_id, im.server_id FROM inserted_map im
  UNION ALL
  SELECT e.local_id, e.server_id FROM existing e;
END;
$$;

-- ── schedules (parent_schedule_id는 매핑 안 되면 NULL 폴백) ────────────────
CREATE OR REPLACE FUNCTION migrate_schedules(
  p_migration_id uuid,
  p_schedules    jsonb
    -- [{ local_id, parent_local_id, title, location, starts_at, ends_at, is_all_day,
    --    repeat_type, repeat_unit, repeat_value, repeat_end_type, repeat_until,
    --    repeat_count, alarm_minutes }, ...]
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
  )
  SELECT im.local_id, im.server_id FROM inserted_map im
  UNION ALL
  SELECT e.local_id, e.server_id FROM existing e;
END;
$$;

-- ── schedule_exceptions (부모 schedule 매핑 필수 — 없으면 스킵) ────────────
CREATE OR REPLACE FUNCTION migrate_schedule_exceptions(
  p_migration_id uuid,
  p_exceptions   jsonb
    -- [{ local_id, schedule_local_id, occurrence_date, exception_type, original_starts_at,
    --    original_ends_at, title, location, starts_at, ends_at, is_all_day, alarm_minutes }, ...]
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
  )
  SELECT im.local_id, im.server_id FROM inserted_map im
  UNION ALL
  SELECT e.local_id, e.server_id FROM existing e;
END;
$$;

-- ── study_sessions (wordbook_ids 배열도 remap, 매핑 안 된 원소는 자동 제외) ─
CREATE OR REPLACE FUNCTION migrate_study_sessions(
  p_migration_id uuid,
  p_sessions     jsonb
    -- [{ local_id, session_type, wordbook_local_ids: string[], total_count, correct_count,
    --    wrong_count, completed_at, created_at }, ...]
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
  )
  SELECT im.local_id, im.server_id FROM inserted_map im
  UNION ALL
  SELECT e.local_id, e.server_id FROM existing e;
END;
$$;

-- ── study_results (session/word 매핑 둘 다 필수 — 없으면 스킵) ─────────────
CREATE OR REPLACE FUNCTION migrate_study_results(
  p_migration_id uuid,
  p_results      jsonb
    -- [{ local_id, session_local_id, word_local_id, is_correct, attempt_count, answered_at }, ...]
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
  )
  SELECT im.local_id, im.server_id FROM inserted_map im
  UNION ALL
  SELECT e.local_id, e.server_id FROM existing e;
END;
$$;
