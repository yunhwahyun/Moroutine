-- 39. handle_new_user() 방어적으로 재작성 — "Database error saving new user" 회원가입 실패 수정
-- 배경: 신규 회원가입 시 GoTrue가 "Database error saving new user"를 반환하는 문제가 보고됨. 이 에러는
-- auth.users INSERT에 걸린 트리거(handle_new_user, 마이그레이션 34)가 예외를 던질 때 GoTrue가 그대로
-- 노출하는 일반 메시지다. 마이그레이션 34의 "관리자 설정값 복사" 로직(v_admin 조회 + INSERT)이 어떤
-- 이유로든 실패하면 profiles 행 자체가 생성되지 못하고 auth.users INSERT까지 롤백되어 회원가입 전체가
-- 막힌다 — 부가 기능(설정값 복사) 하나 때문에 "계정 생성"이라는 핵심 기능이 깨지면 안 된다.
--
-- docs/DECISION_LOG.md 2026-07-19의 master-invite 계열 Edge Function 수정과 동일한 방어 원칙(예외를
-- 삼키지 않고 최상위에서 잡아 최소한의 성공 경로를 보장)을 트리거에도 적용한다: 관리자 설정값 복사에
-- 실패해도 예외를 잡아 기본값 프로필 행만이라도 반드시 생성하고, 원인은 RAISE WARNING으로 Postgres
-- 로그에 남긴다(Dashboard → Logs → Postgres Logs에서 확인 가능).

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_admin profiles%ROWTYPE;
BEGIN
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
  EXCEPTION WHEN OTHERS THEN
    -- 관리자 설정값 복사 실패가 회원가입 자체를 막지 않도록, 원인을 로그로 남기고 기본값 프로필로 대체.
    RAISE WARNING 'handle_new_user: admin 설정 복사 실패(user_id=%): %', new.id, SQLERRM;
    INSERT INTO profiles (id) VALUES (new.id) ON CONFLICT (id) DO NOTHING;
  END;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
