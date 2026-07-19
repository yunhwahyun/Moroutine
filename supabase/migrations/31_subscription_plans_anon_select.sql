-- 31. subscription_plans_anon_select — Guest도 요금제 비교표(/pricing)를 볼 수 있도록 SELECT 정책 확장
-- docs/UI_FLOW.md "요금제 비교 (/pricing)" — Guest가 가입 유도 목적으로 봐야 하는데,
-- 마이그레이션 14의 정책이 TO authenticated만 허용해 비로그인 상태에서는 전혀 읽을 수 없었다.
-- subscription_plans는 가격이 아니라 한도/기능 플래그만 담고 있어 익명 공개에 문제가 없다.

DROP POLICY IF EXISTS "subscription_plans_select" ON subscription_plans;
CREATE POLICY "subscription_plans_select" ON subscription_plans
  FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON public.subscription_plans TO anon;
