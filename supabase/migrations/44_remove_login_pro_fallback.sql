-- 44. "결제 미활성 시 로그인 사용자는 Pro" fallback 영구 제거 — 1차 출시 P0
-- docs/launch/PHASE1_POLICY.md §1, §12 참고. 1차에는 실제 Pro 사용자가 존재하지 않는다(Guest/Master/
-- Admin만 존재). 마이그레이션 38에서 추가했던 "WHEN NOT payments_enabled THEN 'pro'" 분기를 제거하고
-- 37번 버전(admin > master > 실제 pro 구독 > guest)으로 되돌린다. 이 fallback은 2차에서도 복원하지
-- 않는다 — payments_enabled=true가 되면 실제 subscriptions 활성 구독 체크만으로 pro가 판정되어야
-- 한다(웹 클라이언트 web/src/lib/permissions.ts의 동일 fallback 제거와 짝을 이룬다).
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
    ELSE 'guest'
  END;
$$;
