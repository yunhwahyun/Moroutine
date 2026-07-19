-- 29. retention_cleanup_support — Phase 18(데이터 보관/삭제) 구현에 필요한 선행 수정
-- docs/DATA_RETENTION_DESIGN.md §4-2, §7 참고

-- retention-cleanup은 사람이 아닌 Scheduled Function이 실행하므로 actor_id를 채울 수 없다.
-- 결정(2026-07-18): 시스템 계정을 새로 만들지 않고 nullable로 완화한다.
ALTER TABLE admin_audit_log ALTER COLUMN actor_id DROP NOT NULL;
