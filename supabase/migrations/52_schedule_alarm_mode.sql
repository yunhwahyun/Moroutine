-- 52. 일정 알림 방식(alarm_mode) — "설정 알림 시간"(설정 화면의 복습 알림 시간 재사용) 옵션 추가
-- docs/DECISION_LOG.md 2026-09-16 참고
--
-- 지금까지 알림은 항상 "시작 시각 - N분"(alarm_minutes)으로만 계산됐다. 종일 일정은 시작 시각이
-- 항상 자정(00:00)이라, "정시"/"N분 전"을 고르면 자정 근처(전날 밤~자정)에 알림이 와서 실질적으로
-- 쓸모가 없었다(사용자 리포트). alarm_mode='daily_time'을 고르면 시작 시각과 무관하게 그날
-- 설정(SettingsPage.tsx "복습 알림"의 알림 시간, reviewNotificationTime)에 지정된 시각에
-- 알림이 온다 — 종일/시간 지정 일정 모두에 적용 가능한 일반 옵션으로 추가한다(사용자 확정,
-- 별도의 "일정 전용 알림 시간" 설정은 만들지 않고 기존 값을 공유).

ALTER TABLE schedules
  ADD COLUMN alarm_mode text NOT NULL DEFAULT 'offset'
    CHECK (alarm_mode IN ('offset', 'daily_time'));

-- schedule_exceptions의 alarm_mode는 alarm_minutes와 동일하게 nullable — "이 일정만 수정"에서
-- 매번 폼의 현재 값을 그대로 다시 저장하므로 사실상 항상 채워지지만, 마이그레이션 이전에 만들어진
-- 행은 NULL로 남는다(그런 행은 조회 시 원본 schedule의 alarm_mode로 대체된다).
ALTER TABLE schedule_exceptions
  ADD COLUMN alarm_mode text
    CHECK (alarm_mode IS NULL OR alarm_mode IN ('offset', 'daily_time'));

-- ── migrate_schedules 재정의(마이그레이션 35 버전 + alarm_mode) ────────────
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
      NULLIF(elem->>'alarm_minutes', '')::int AS alarm_minutes,
      COALESCE(NULLIF(elem->>'alarm_mode', ''), 'offset') AS alarm_mode
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
      repeat_count, parent_schedule_id, alarm_minutes, alarm_mode
    )
    SELECT
      server_id, v_user_id, title, location, starts_at, ends_at, is_all_day,
      repeat_type, repeat_unit, repeat_value, repeat_end_type, repeat_until,
      repeat_count, parent_schedule_id, alarm_minutes, alarm_mode
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

-- ── migrate_schedule_exceptions 재정의(마이그레이션 35 버전 + alarm_mode) ──
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
      NULLIF(elem->>'alarm_minutes', '')::int AS alarm_minutes,
      NULLIF(elem->>'alarm_mode', '') AS alarm_mode
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
      is_all_day, alarm_minutes, alarm_mode
    )
    SELECT
      server_id, v_user_id, schedule_id, occurrence_date, exception_type,
      original_starts_at, original_ends_at, title, location, starts_at, ends_at,
      is_all_day, alarm_minutes, alarm_mode
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
