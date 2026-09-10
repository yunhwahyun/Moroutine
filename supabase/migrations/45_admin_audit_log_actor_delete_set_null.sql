-- 45. admin_audit_log.actor_id FK를 ON DELETE SET NULL로 변경 — Master 자진 탈퇴(P0 §5) 구현 중 발견
--
-- 문제: admin_audit_log.actor_id는 ON DELETE 지정 없이 auth.users(id)를 참조한다(기본 NO ACTION).
-- master-accept가 Master 본인을 actor_id로 하는 'master_accepted' 로그를 남기므로, 사실상 모든
-- Master 계정은 자기 자신을 actor로 하는 감사 로그 행을 최소 1건 이상 갖는다. 이 상태에서
-- master-delete-account가 auth.admin.deleteUser()로 auth.users 행을 지우려 하면, 남아있는
-- admin_audit_log.actor_id의 FK 제약(RESTRICT)에 걸려 삭제 자체가 실패한다.
--
-- retention-cleanup(마이그레이션 29에서 actor_id를 NOT NULL 해제)이 시스템 작업에 이미 actor_id=null을
-- 쓰는 것과 동일한 패턴으로, 계정이 실제로 삭제될 때는 SET NULL로 참조를 끊는다. 각 로그 행의
-- detail jsonb에 이미 이메일 등 행위자 식별 정보가 남아 있으므로(예: master-accept의
-- detail.email) 감사 추적력이 완전히 사라지지는 않는다.
ALTER TABLE admin_audit_log
  DROP CONSTRAINT admin_audit_log_actor_id_fkey,
  ADD CONSTRAINT admin_audit_log_actor_id_fkey
    FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
