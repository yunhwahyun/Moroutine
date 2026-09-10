-- 46. master_invitations의 accepted_user_id/revoked_by FK를 ON DELETE SET NULL로 변경
-- 마이그레이션 45(admin_audit_log.actor_id)와 동일한 문제가 이 테이블에도 있었다 — 실사용 중
-- master-delete-account 호출로 발견(2026-09-10). master-accept가 Master 본인의 id를
-- accepted_user_id에 항상 기록하므로, 가입을 마친 모든 Master는 자기 자신을 가리키는
-- master_invitations 행을 최소 1건 갖는다. ON DELETE 미지정(NO ACTION) 상태라 auth.admin.deleteUser()가
-- FK 위반으로 실패했다(실제 Master 계정으로 재현·확인 완료).
--
-- invited_by는 NOT NULL이고 항상 Admin의 id를 가리키는데(초대자), 이 앱엔 Admin 계정을 삭제하는
-- 플로우가 없으므로 그대로 둔다(NOT NULL 컬럼은 SET NULL 액션을 붙일 수 없어, 굳이 바꾸려면
-- NOT NULL부터 풀어야 하는데 지금은 그럴 필요가 없다).
ALTER TABLE master_invitations
  DROP CONSTRAINT master_invitations_accepted_user_id_fkey,
  ADD CONSTRAINT master_invitations_accepted_user_id_fkey
    FOREIGN KEY (accepted_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE master_invitations
  DROP CONSTRAINT master_invitations_revoked_by_fkey,
  ADD CONSTRAINT master_invitations_revoked_by_fkey
    FOREIGN KEY (revoked_by) REFERENCES auth.users(id) ON DELETE SET NULL;
