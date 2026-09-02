-- 34. 관리자 설정값 → 신규 가입자 기본값
-- docs/DECISION_LOG.md 2026-09-01 — "사용자가 설정 안 했을 때 관리자 값 적용"은 신규 가입자부터만
-- 적용한다(기존 가입자는 영향 없음, DB에 "커스터마이징 여부" 플래그를 새로 추가하지 않는 단순한 방식).

-- handle_new_user() 교체: role='admin' 중 가장 먼저 만들어진 계정의 현재 설정값을 신규 profiles 행에
-- 복사한다. 관리자가 아직 없으면(최초 관리자 자신의 가입 등 부트스트랩 케이스) 기존처럼 컬럼 기본값을 쓴다.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_admin profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_admin FROM profiles WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1;
  IF FOUND THEN
    INSERT INTO profiles (
      id, quiz_mode, question_order, review_intervals, review_policy,
      schedule_notification, review_notification, review_notification_time, short_answer_input
    ) VALUES (
      new.id, v_admin.quiz_mode, v_admin.question_order, v_admin.review_intervals, v_admin.review_policy,
      v_admin.schedule_notification, v_admin.review_notification, v_admin.review_notification_time,
      v_admin.short_answer_input
    )
    ON CONFLICT (id) DO NOTHING;
  ELSE
    INSERT INTO profiles (id) VALUES (new.id) ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- get_admin_default_settings(): Guest(비로그인, anon)가 관리자의 설정값만 좁게 읽을 수 있는 전용 통로.
-- profiles RLS(auth.uid() = id)는 익명 조회를 막으므로, sample_wordbooks(마이그레이션 33)의 anon RLS와
-- 같은 목적을 SECURITY DEFINER 함수로 달성한다 — 개인식별 정보(nickname 등)는 반환하지 않는다.
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
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT
    quiz_mode, question_order, review_intervals, review_policy,
    schedule_notification, review_notification, review_notification_time, short_answer_input
  FROM profiles
  WHERE role = 'admin'
  ORDER BY created_at ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION get_admin_default_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_admin_default_settings() TO anon;
