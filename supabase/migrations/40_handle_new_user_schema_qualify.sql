-- 40. handle_new_user()/get_admin_default_settings() — profiles를 public.profiles로 스키마 명시
-- 실제 원인 확인(2026-09-03, Postgres 로그): 회원가입 시 "relation "profiles" does not exist"(42P01)
-- 에러로 트리거가 실패하고 있었다. 원본(마이그레이션 01)은 `insert into public.profiles (...)`처럼
-- 스키마를 명시했었는데, 마이그레이션 34에서 관리자 설정값 복사 로직으로 재작성하며 `public.`을
-- 빠뜨리고 `profiles`만 사용했다. auth.users INSERT를 트리거하는 GoTrue 세션의 search_path에는 public
-- 스키마가 기본 포함되어 있지 않아, 스키마 미명시 테이블명을 찾지 못해 실패한 것 — PostgREST 경유
-- 호출(REST API, RPC)은 별도 경로로 search_path에 public이 포함되어 있어 증상이 갈렸다(멀쩡히 200으로
-- 응답하는 GET /rest/v1/profiles와 대조적으로 트리거만 실패). 마이그레이션 39가 추가한 예외 처리의
-- fallback INSERT도 동일하게 `profiles`만 써서 같은 이유로 계속 실패했다.
--
-- 수정: 함수 본문의 모든 테이블 참조를 public.profiles로 명시하고, SECURITY DEFINER 함수의 일반적인
-- 안전 수칙에 따라 SET search_path = public, pg_temp도 함께 고정한다(이 방식의 문제를 근본적으로 막음).

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_admin public.profiles%ROWTYPE;
BEGIN
  BEGIN
    SELECT * INTO v_admin FROM public.profiles WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1;
    IF FOUND THEN
      INSERT INTO public.profiles (
        id, quiz_mode, question_order, review_intervals, review_policy,
        schedule_notification, review_notification, review_notification_time, short_answer_input
      ) VALUES (
        new.id, v_admin.quiz_mode, v_admin.question_order, v_admin.review_intervals, v_admin.review_policy,
        v_admin.schedule_notification, v_admin.review_notification, v_admin.review_notification_time,
        v_admin.short_answer_input
      )
      ON CONFLICT (id) DO NOTHING;
    ELSE
      INSERT INTO public.profiles (id) VALUES (new.id) ON CONFLICT (id) DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: admin 설정 복사 실패(user_id=%): %', new.id, SQLERRM;
    INSERT INTO public.profiles (id) VALUES (new.id) ON CONFLICT (id) DO NOTHING;
  END;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION get_admin_default_settings()
RETURNS TABLE (
  quiz_mode                 text,
  question_order             text,
  review_intervals           text[],
  review_policy               text,
  schedule_notification       boolean,
  review_notification         boolean,
  review_notification_time    text,
  short_answer_input          text
)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT
    quiz_mode, question_order, review_intervals, review_policy,
    schedule_notification, review_notification, review_notification_time, short_answer_input
  FROM public.profiles
  WHERE role = 'admin'
  ORDER BY created_at ASC
  LIMIT 1;
$$;
