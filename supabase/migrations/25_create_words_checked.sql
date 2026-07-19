-- 25. create_words_checked — Pro 개인 단어 한도 원자적 검증 RPC
-- docs/SUBSCRIPTION_DESIGN.md §4-2 참고
-- 단건/일괄 등록 모두 이 RPC를 경유한다(web/src/repositories/remote/RemoteDataRepository.ts의
-- createWord/bulkCreateWords). SECURITY DEFINER로 words 테이블에 직접 쓰되, 함수 내부에서
-- wordbook 소유권 검증 + 서비스 등급별 한도 검증을 직접 수행하므로 RLS 우회가 안전하다.
--
-- 동시성: 동일 사용자의 여러 등록 요청이 동시에 들어와도 pg_advisory_xact_lock으로 트랜잭션
-- 범위 내 직렬화되므로 "한도를 넘겨 등록되는" Race Condition이 발생하지 않는다.

CREATE OR REPLACE FUNCTION create_words_checked(
  p_wordbook_id uuid,
  p_words       jsonb   -- [{ "term": "...", "definition": "...", "description": "...", "example": "...", "memo": "..." }, ...]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_tier     text;
  v_limit    int;
  v_current  int;
  v_incoming int := jsonb_array_length(p_words);
  v_inserted jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM wordbooks WHERE id = p_wordbook_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'wordbook not owned by user';
  END IF;

  v_tier := get_service_tier(v_user_id);
  IF v_tier NOT IN ('pro', 'premium', 'master') THEN
    RAISE EXCEPTION 'only pro/premium/master can register words via this function';
  END IF;

  -- 사용자 단위 advisory lock — 트랜잭션 종료 시 자동 해제, 동시 등록 요청을 직렬화한다.
  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text));

  IF v_tier = 'pro' THEN
    SELECT personal_word_limit INTO v_limit FROM subscription_plans WHERE code = 'pro';
  ELSE
    -- premium/master는 subscription_plans와 무관하게 항상 무제한
    v_limit := NULL;
  END IF;

  SELECT count(*) INTO v_current FROM words WHERE user_id = v_user_id;

  IF v_limit IS NOT NULL AND v_current + v_incoming > v_limit THEN
    RETURN jsonb_build_object(
      'inserted', '[]'::jsonb,
      'inserted_count', 0,
      'current_total', v_current,
      'limit_value', v_limit,
      'blocked', true
    );
  END IF;

  WITH inserted_rows AS (
    INSERT INTO words (wordbook_id, user_id, term, definition, description, example, memo)
    SELECT
      p_wordbook_id,
      v_user_id,
      elem->>'term',
      elem->>'definition',
      NULLIF(elem->>'description', ''),
      NULLIF(elem->>'example', ''),
      NULLIF(elem->>'memo', '')
    FROM jsonb_array_elements(p_words) elem
    RETURNING *
  )
  SELECT jsonb_agg(to_jsonb(inserted_rows)) INTO v_inserted FROM inserted_rows;

  RETURN jsonb_build_object(
    'inserted', COALESCE(v_inserted, '[]'::jsonb),
    'inserted_count', v_incoming,
    'current_total', v_current + v_incoming,
    'limit_value', v_limit,
    'blocked', false
  );
END;
$$;

-- words 테이블의 기존 RLS(words_insert 등)는 그대로 유지한다 — 클라이언트가 이 RPC를 우회해
-- supabase.from('words').insert()를 직접 호출해도 소유권 검증까지는 통과하지만, 한도 검증은
-- 오직 이 함수 경로에서만 이뤄진다는 한계가 있다. web/src/repositories/remote/RemoteDataRepository.ts가
-- createWord/bulkCreateWords 두 경로 모두 반드시 이 함수를 호출하도록 강제한다(애플리케이션 레벨 보장).
