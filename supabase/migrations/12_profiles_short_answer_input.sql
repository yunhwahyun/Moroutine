-- 12. profiles_short_answer_input — short_answer_input 컬럼 추가
-- 2026-09-01 저장소 복구: 실제 DB에는 이미 적용되어 있었으나(사용자 확인) 이 파일 자체가
-- supabase/migrations/에 누락되어 있던 것을 docs/DB_SCHEMA.md 마이그레이션 12 원문 그대로 복원.
-- 다시 적용할 필요 없음(DB에는 이미 컬럼이 존재) — 저장소 이력만 맞추는 용도.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS short_answer_input TEXT NOT NULL DEFAULT 'both';
