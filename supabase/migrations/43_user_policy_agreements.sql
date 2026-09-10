-- 43. user_policy_agreements — Master 가입 시 이용약관 동의 / 만 14세 이상 자격확인 기록
-- docs/launch/PHASE1_POLICY.md §4, §5 참고. 회원 유지 중에는 불변(immutable) 기록으로 유지하다가
-- 회원탈퇴(auth.users 삭제) 시 CASCADE로 함께 삭제되는 것을 기본으로 한다. 별도 UPDATE/DELETE
-- 클라이언트 정책은 두지 않는다(수정·삭제는 회원탈퇴로만 발생).

CREATE TABLE user_policy_agreements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agreement_type  text NOT NULL CHECK (agreement_type IN ('terms', 'age_eligibility')),
  policy_version  text NOT NULL,
  agreed_at       timestamptz NOT NULL DEFAULT now(),
  metadata        jsonb
);

CREATE INDEX idx_user_policy_agreements_user ON user_policy_agreements(user_id);

ALTER TABLE user_policy_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_policy_agreements_select_own" ON user_policy_agreements
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "user_policy_agreements_insert_own" ON user_policy_agreements
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- UPDATE/DELETE 정책 없음 — 불변 기록. 실제 삽입은 master-accept(service_role)가 수행하지만,
-- 위 INSERT 정책은 스펙대로 "본인만"을 명시해 클라이언트 직접 호출도 동일 원칙을 따르게 한다.

GRANT SELECT, INSERT ON public.user_policy_agreements TO authenticated;
