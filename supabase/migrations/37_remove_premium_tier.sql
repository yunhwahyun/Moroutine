-- 37. Premium 티어 폐지 — Pro만 유료 요금제로 유지
-- docs/DECISION_LOG.md 2026-09-02 참고. 실제 Premium 구독자가 없어(사용자 확인) 데이터 이관 없이
-- 바로 제거한다.

-- 1) 혹시 남아있는 테스트성 premium 구독 행이 있다면 함께 정리(FK 때문에 plan 삭제보다 먼저 실행).
DELETE FROM subscriptions WHERE plan_code = 'premium';
DELETE FROM subscription_plans WHERE code = 'premium';

-- 2) 서비스 등급 판정에서 premium 단계 제거 (admin > master > pro > guest)
CREATE OR REPLACE FUNCTION get_service_tier(p_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT CASE
    WHEN (SELECT role FROM profiles WHERE id = p_user_id) = 'admin' THEN 'admin'
    WHEN (SELECT special_access FROM profiles WHERE id = p_user_id) = 'master' THEN 'master'
    WHEN EXISTS (
      SELECT 1 FROM subscriptions
      WHERE user_id = p_user_id AND plan_code = 'pro'
        AND status IN ('active', 'grace_period', 'billing_retry')
    ) THEN 'pro'
    ELSE 'guest'  -- authenticated인데 매칭 없음 = 전이 상태(downgrade_pending), 정상 정착 상태 아님
  END;
$$;

-- 3) Pro 개인 단어 한도 검증 RPC — 허용 등급 목록에서 premium 제거(로직 자체는 무변경, master는
-- 여전히 subscription_plans와 무관하게 무제한).
CREATE OR REPLACE FUNCTION create_words_checked(
  p_wordbook_id uuid,
  p_words       jsonb
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
  IF v_tier NOT IN ('pro', 'master') THEN
    RAISE EXCEPTION 'only pro/master can register words via this function';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text));

  IF v_tier = 'pro' THEN
    SELECT personal_word_limit INTO v_limit FROM subscription_plans WHERE code = 'pro';
  ELSE
    -- master는 subscription_plans와 무관하게 항상 무제한
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

-- 4) 공용 단어장 열람 RLS(마이그레이션 36이 정의) — 허용 등급 목록에서 premium 제거.
DROP POLICY IF EXISTS "public_wordbooks_select" ON public_wordbooks;
DROP POLICY IF EXISTS "public_words_select" ON public_words;

CREATE POLICY "public_wordbooks_select" ON public_wordbooks
  FOR SELECT TO authenticated USING (
    (status IN ('published', 'default') AND get_service_tier(auth.uid()) IN ('pro', 'master'))
    OR is_admin(auth.uid())
  );

CREATE POLICY "public_words_select" ON public_words
  FOR SELECT TO authenticated USING (
    (status = 'active' AND EXISTS (
       SELECT 1 FROM public_wordbooks pw
       WHERE pw.id = public_words.wordbook_id AND pw.status IN ('published', 'default')
     ) AND get_service_tier(auth.uid()) IN ('pro', 'master'))
    OR is_admin(auth.uid())
  );

-- 5) 공용 단어장 등록/진행 상태 RLS(마이그레이션 18) — 허용 등급 목록에서 premium 제거.
DROP POLICY IF EXISTS "enrollments_all" ON user_public_wordbook_enrollments;
DROP POLICY IF EXISTS "public_word_progress_all" ON user_public_word_progress;

CREATE POLICY "enrollments_all" ON user_public_wordbook_enrollments
  FOR ALL TO authenticated
  USING (auth.uid() = user_id AND get_service_tier(auth.uid()) IN ('pro', 'master'))
  WITH CHECK (auth.uid() = user_id AND get_service_tier(auth.uid()) IN ('pro', 'master'));

CREATE POLICY "public_word_progress_all" ON user_public_word_progress
  FOR ALL TO authenticated
  USING (auth.uid() = user_id AND get_service_tier(auth.uid()) IN ('pro', 'master'))
  WITH CHECK (auth.uid() = user_id AND get_service_tier(auth.uid()) IN ('pro', 'master'));
