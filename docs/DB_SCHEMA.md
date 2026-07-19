# DB Schema

> Supabase PostgreSQL. 마이그레이션 순서 반드시 준수.

---

## 마이그레이션 실행 순서

```
1.  profiles
2.  schedules
3.  wordbooks
4.  words               ← description 컬럼 포함
5.  word_count 트리거    ← words 테이블 생성 이후에만 생성 가능
6.  study_sessions
7.  study_results
8.  notifications
9.  schedules_repeat    ← repeat 컬럼 + schedule_exceptions 테이블
10. notifications_occurrence
11. profiles_settings   ← 설정 컬럼 추가 (quiz_mode, question_order, review_intervals 등)
12. profiles_short_answer_input ← short_answer_input 컬럼 추가
```

> **2026-07-18 정책 전면 개편**: 구 Phase 10 계획(마이그레이션 13~17 — `profiles_plan`/`speaking_tasks`/`speaking_sessions`/`speaking_recordings`/`pronunciation_evaluations`)은 실제 파일로 생성된 적이 없어 전량 폐기하고 아래 신규 계획으로 대체한다. 배경은 `docs/DECISION_LOG.md` 2026-07-18 항목, 정책 원문은 `docs/PERMISSION_DESIGN.md`/`docs/SUBSCRIPTION_DESIGN.md`/`docs/ADMIN_DESIGN.md`/`docs/MASTER_INVITATION_DESIGN.md`/`docs/DATA_RETENTION_DESIGN.md`/`docs/MIGRATION_DESIGN.md`/`docs/SPEAKING_DESIGN.md` 참고.

```
--- Guest/Pro/Premium/Master/Admin 정책 개편 ---
13. profiles_role_access        ← role, special_access 컬럼 추가 (docs/PERMISSION_DESIGN.md §4-1)
14. subscription_plans          ← 요금제 설정 테이블 (docs/PERMISSION_DESIGN.md §4-2)
15. subscriptions                ← 구독 상태 테이블 (docs/PERMISSION_DESIGN.md §4-3)
16. subscription_webhook_support ← processed_webhook_events, subscription_audit_log (docs/SUBSCRIPTION_DESIGN.md §3)
17. public_wordbooks_words       ← public_wordbooks, public_words (docs/ADMIN_DESIGN.md §3-2)
18. user_public_progress         ← user_public_wordbook_enrollments, user_public_word_progress (docs/ADMIN_DESIGN.md §3-3)
19. master_invitations           ← Master 초대 테이블 (docs/MASTER_INVITATION_DESIGN.md §2)
20. admin_audit_log              ← 관리자 작업 감사 로그 (docs/ADMIN_DESIGN.md §4)
21. migration_engine             ← migration_jobs, migration_id_map, device_migration_status (docs/MIGRATION_DESIGN.md §3, §8)
22. retention_schedules          ← 3개월 보관/삭제 스케줄 (docs/DATA_RETENTION_DESIGN.md §2)
23. speaking_sentences           ← 개인 스피킹 문장 (docs/SPEAKING_DESIGN.md §4-1, 평가 기능 없는 신규 설계)
24. speaking_recordings          ← 개인 스피킹 녹음 메타 (docs/SPEAKING_DESIGN.md §4-1)
25. create_words_checked         ← Pro 단어 한도 원자적 검증 RPC (docs/SUBSCRIPTION_DESIGN.md §4-2)
26. migration_engine_rpcs        ← Guest→Remote 이전 RPC 6종 (docs/MIGRATION_DESIGN.md §3)
27. subscription_retry_and_realtime ← billing_retry_started_at 컬럼 + subscriptions realtime publication (docs/SUBSCRIPTION_DESIGN.md §2, §10)
28. master_admin_fixes           ← prevent_self_privilege_escalation 트리거 수정 + master_invitations.token_hash nullable + list_masters() RPC + profiles realtime publication (docs/MASTER_INVITATION_DESIGN.md)
29. retention_cleanup_support     ← admin_audit_log.actor_id nullable (docs/DATA_RETENTION_DESIGN.md §4-2, §7)
30. public_content_audit_triggers ← public_wordbooks/public_words 쓰기를 admin_audit_log에 자동 기록하는 트리거 (docs/ADMIN_DESIGN.md §4)
31. subscription_plans_anon_select ← subscription_plans SELECT를 anon까지 확장 (docs/UI_FLOW.md §3 요금제 비교)
```

> `is_admin()` / `get_service_tier()` SQL 함수(`docs/PERMISSION_DESIGN.md` §4-4)는 마이그레이션 13 직후, 이를 참조하는 모든 RLS 정책(14번 이후)보다 먼저 생성한다.

---

## profiles

```sql
CREATE TABLE profiles (
  id                       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname                 text,
  avatar_url               text,
  review_policy            text    NOT NULL DEFAULT 'keep',
  quiz_mode                text    NOT NULL DEFAULT 'multiple_choice',
  question_order           text    NOT NULL DEFAULT 'random',
  review_intervals         text[]  NOT NULL DEFAULT '{7d,30d,90d}',
  schedule_notification    boolean NOT NULL DEFAULT true,
  review_notification      boolean NOT NULL DEFAULT true,
  review_notification_time text    NOT NULL DEFAULT '09:00',
  short_answer_input       text    NOT NULL DEFAULT 'both',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id) VALUES (new.id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_delete" ON profiles FOR DELETE TO authenticated USING (auth.uid() = id);
```

---

## schedules

```sql
CREATE TABLE schedules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title               text NOT NULL,
  location            text,
  starts_at           timestamptz NOT NULL,
  ends_at             timestamptz,
  is_all_day          boolean NOT NULL DEFAULT false,
  repeat_type         text NOT NULL DEFAULT 'none',
    -- 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly' | 'custom'
  repeat_unit         text,
  repeat_value        int,
  repeat_end_type     text NOT NULL DEFAULT 'none',
    -- 'none' | 'until' | 'count'
  repeat_until        date,
  repeat_count        int,
  parent_schedule_id  uuid REFERENCES schedules(id) ON DELETE SET NULL,
  alarm_minutes       int,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_schedules_user_starts ON schedules(user_id, starts_at);

ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedules_select" ON schedules FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "schedules_insert" ON schedules FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "schedules_update" ON schedules FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "schedules_delete" ON schedules FOR DELETE TO authenticated USING (auth.uid() = user_id);
```

---

## schedule_exceptions

```sql
CREATE TABLE schedule_exceptions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  schedule_id         uuid NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  occurrence_date     date NOT NULL,
  exception_type      text NOT NULL,  -- 'cancelled' | 'modified'
  original_starts_at  timestamptz NOT NULL,
  original_ends_at    timestamptz,
  title               text,
  location            text,
  starts_at           timestamptz,
  ends_at             timestamptz,
  is_all_day          boolean,
  alarm_minutes       int,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_schedule_exceptions_unique
  ON schedule_exceptions(schedule_id, occurrence_date);

CREATE INDEX idx_schedule_exceptions_user_date
  ON schedule_exceptions(user_id, occurrence_date);

ALTER TABLE schedule_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedule_exceptions_select" ON schedule_exceptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "schedule_exceptions_delete" ON schedule_exceptions FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "schedule_exceptions_insert"
  ON schedule_exceptions FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM schedules WHERE id = schedule_exceptions.schedule_id AND user_id = auth.uid())
  );
CREATE POLICY "schedule_exceptions_update"
  ON schedule_exceptions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM schedules WHERE id = schedule_exceptions.schedule_id AND user_id = auth.uid())
  );
```

---

## wordbooks

```sql
CREATE TABLE wordbooks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  language    text,
  word_count  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wordbooks_user ON wordbooks(user_id);

ALTER TABLE wordbooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wordbooks_select" ON wordbooks FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "wordbooks_insert" ON wordbooks FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wordbooks_update" ON wordbooks FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wordbooks_delete" ON wordbooks FOR DELETE TO authenticated USING (auth.uid() = user_id);
```

---

## words

```sql
CREATE TABLE words (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wordbook_id     uuid NOT NULL REFERENCES wordbooks(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  term            text NOT NULL,
  definition      text NOT NULL,
  description     text,
  example         text,
  memo            text,
  wrong_count     int NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'unseen',
    -- 'unseen' | 'learning' | 'reviewing' | 'mastered'
  review_step     int NOT NULL DEFAULT 0,
  first_passed_at timestamptz,
  next_review_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_words_wordbook    ON words(wordbook_id);
CREATE INDEX idx_words_user_review ON words(user_id, next_review_at) WHERE status = 'reviewing';
CREATE INDEX idx_words_user_status ON words(user_id, status);

ALTER TABLE words ENABLE ROW LEVEL SECURITY;

CREATE POLICY "words_select" ON words FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "words_delete" ON words FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "words_insert"
  ON words FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM wordbooks
      WHERE wordbooks.id = words.wordbook_id AND wordbooks.user_id = auth.uid()
    )
  );
CREATE POLICY "words_update"
  ON words FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM wordbooks
      WHERE wordbooks.id = words.wordbook_id AND wordbooks.user_id = auth.uid()
    )
  );
```

---

## word_count 트리거 (words 테이블 이후 실행)

```sql
CREATE OR REPLACE FUNCTION sync_word_count()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE wordbooks SET word_count = word_count + 1 WHERE id = NEW.wordbook_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE wordbooks SET word_count = word_count - 1 WHERE id = OLD.wordbook_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_word_count
  AFTER INSERT OR DELETE ON words
  FOR EACH ROW EXECUTE PROCEDURE sync_word_count();
```

---

## study_sessions

```sql
CREATE TABLE study_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_type  text NOT NULL,
    -- 'learn' | 'quiz' | 'review_quiz'
  wordbook_ids  uuid[],
  total_count   int NOT NULL,
  correct_count int NOT NULL DEFAULT 0,
  wrong_count   int NOT NULL DEFAULT 0,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_study_sessions_user ON study_sessions(user_id, created_at DESC);

ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "study_sessions_select" ON study_sessions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "study_sessions_insert" ON study_sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "study_sessions_update" ON study_sessions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "study_sessions_delete" ON study_sessions FOR DELETE TO authenticated USING (auth.uid() = user_id);
```

---

## study_results

```sql
CREATE TABLE study_results (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  word_id       uuid NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_correct    boolean NOT NULL,
  attempt_count int NOT NULL DEFAULT 1,
  answered_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_study_results_session ON study_results(session_id);
CREATE INDEX idx_study_results_word    ON study_results(word_id);

ALTER TABLE study_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "study_results_select" ON study_results FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "study_results_delete" ON study_results FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "study_results_insert"
  ON study_results FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM study_sessions WHERE id = study_results.session_id AND user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM words WHERE id = study_results.word_id AND user_id = auth.uid())
  );
CREATE POLICY "study_results_update"
  ON study_results FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM study_sessions WHERE id = study_results.session_id AND user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM words WHERE id = study_results.word_id AND user_id = auth.uid())
  );
```

---

## notifications

```sql
CREATE TABLE notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  schedule_id  uuid NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  native_id    text,
  fire_at      timestamptz NOT NULL,
  is_cancelled boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_schedule  ON notifications(schedule_id);
CREATE INDEX idx_notifications_user_fire ON notifications(user_id, fire_at) WHERE is_cancelled = false;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select" ON notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notifications_delete" ON notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notifications_insert"
  ON notifications FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM schedules WHERE id = notifications.schedule_id AND user_id = auth.uid())
  );
CREATE POLICY "notifications_update"
  ON notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM schedules WHERE id = notifications.schedule_id AND user_id = auth.uid())
  );
```

---

## 마이그레이션 12 — profiles_short_answer_input

```sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS short_answer_input TEXT NOT NULL DEFAULT 'both';
```

---

---

## 마이그레이션 13~31 — Guest/Pro/Premium/Master/Admin 정책 개편 (신규)

전체 DDL은 아래 각 설계 문서에 원문이 있다. 이 표는 마이그레이션 순번과 출처만 인덱싱한다(실행 시 반드시 순번 순서를 지킬 것 — 뒷번호가 앞번호의 함수/테이블을 참조함).

| # | 마이그레이션 | 주요 오브젝트 | DDL 원문 |
|---|---|---|---|
| 13 | profiles_role_access | `profiles.role`, `profiles.special_access` 컬럼 + `is_admin()`/`get_service_tier()` 함수 + `prevent_self_privilege_escalation` 트리거 | `docs/PERMISSION_DESIGN.md` §4-1, §4-4, §7-1 |
| 14 | subscription_plans | `subscription_plans` 테이블 + 초기 데이터 | `docs/PERMISSION_DESIGN.md` §4-2 |
| 15 | subscriptions | `subscriptions` 테이블 | `docs/PERMISSION_DESIGN.md` §4-3 |
| 16 | subscription_webhook_support | `processed_webhook_events`, `subscription_audit_log` | `docs/SUBSCRIPTION_DESIGN.md` §3 |
| 17 | public_wordbooks_words | `public_wordbooks`, `public_words` + `sync_public_word_count` 트리거 | `docs/ADMIN_DESIGN.md` §3-2 |
| 18 | user_public_progress | `user_public_wordbook_enrollments`, `user_public_word_progress` | `docs/ADMIN_DESIGN.md` §3-3 |
| 19 | master_invitations | `master_invitations` | `docs/MASTER_INVITATION_DESIGN.md` §2 |
| 20 | admin_audit_log | `admin_audit_log` | `docs/ADMIN_DESIGN.md` §4 |
| 21 | migration_engine | `migration_jobs`, `migration_id_map`, `device_migration_status` | `docs/MIGRATION_DESIGN.md` §3-1, §8 |
| 22 | retention_schedules | `retention_schedules` | `docs/DATA_RETENTION_DESIGN.md` §2 |
| 23 | speaking_sentences | `speaking_sentences` | `docs/SPEAKING_DESIGN.md` §4-1 |
| 24 | speaking_recordings | `speaking_recordings`(평가 없는 신규 버전, 구 마이그레이션 계획과 이름은 같으나 컬럼 구조 다름) | `docs/SPEAKING_DESIGN.md` §4-1 |
| 25 | create_words_checked | `create_words_checked` RPC(Pro 단어 한도 원자적 검증) | `docs/SUBSCRIPTION_DESIGN.md` §4-2 |
| 26 | migration_engine_rpcs | `migrate_wordbooks`/`migrate_words`/`migrate_schedules`/`migrate_schedule_exceptions`/`migrate_study_sessions`/`migrate_study_results` RPC 6종 | `docs/MIGRATION_DESIGN.md` §3 |
| 27 | subscription_retry_and_realtime | `subscriptions.billing_retry_started_at` 컬럼 + `subscriptions` realtime publication 추가 | `docs/SUBSCRIPTION_DESIGN.md` §2, §10 |
| 28 | master_admin_fixes | `prevent_self_privilege_escalation` 트리거 수정(service_role 예외 추가) + `master_invitations.token_hash` nullable + `list_masters()` RPC + `profiles` realtime publication 추가 | `docs/MASTER_INVITATION_DESIGN.md` |
| 29 | retention_cleanup_support | `admin_audit_log.actor_id` NOT NULL 제약 제거(Scheduled Function이 시스템 실행 기록을 남길 수 있도록) | `docs/DATA_RETENTION_DESIGN.md` §4-2, §7 |
| 30 | public_content_audit_triggers | `log_public_wordbook_action()`/`log_public_word_action()` 트리거(`public_wordbooks`/`public_words` AFTER INSERT/UPDATE → `admin_audit_log` 자동 기록) | `docs/ADMIN_DESIGN.md` §4 |
| 31 | subscription_plans_anon_select | `subscription_plans` SELECT 정책을 `TO anon, authenticated`로 확장(Guest도 `/pricing` 요금제 비교표 조회 가능) | `docs/UI_FLOW.md` §3 요금제 비교 |

> **폐기**: 구 마이그레이션 계획 13(`profiles_plan`) / 14(`speaking_tasks`) / 15(`speaking_sessions`) / 17(`pronunciation_evaluations`)은 실제 파일이 생성된 적이 없으므로 DROP 없이 계획만 폐기. 구 16번(`speaking_recordings`)은 이름을 유지하되 신규 24번 정의로 완전히 대체(과거 `expires_at`/평가 연계 컬럼 제거, `sentence_id` 기반으로 재설계).

---

## RLS 정책 구조 요약

| 테이블 | INSERT WITH CHECK | UPDATE 추가 조건 |
|--------|------------------|-----------------|
| profiles | `uid = id` (단, role/special_access*는 트리거로 보호) | — |
| schedules | `uid = user_id` | — |
| schedule_exceptions | `uid = user_id` + schedule 소유 확인 | schedule 소유 확인 |
| wordbooks | `uid = user_id` | — |
| words | `uid = user_id` + wordbook 소유 확인 | wordbook 소유 확인 |
| study_sessions | `uid = user_id` | — |
| study_results | `uid = user_id` + session 소유 + word 소유 | session 소유 + word 소유 |
| notifications | `uid = user_id` + schedule 소유 확인 | schedule 소유 확인 |
| subscription_plans | Admin만 쓰기, 조회는 전체 authenticated | — |
| subscriptions | 클라이언트 쓰기 불가(service_role만) | — |
| public_wordbooks / public_words | Admin만 쓰기, 조회는 pro/premium/master(+admin은 전체) | — |
| user_public_wordbook_enrollments | `uid = user_id` + pro/premium/master 등급 | 동일 |
| user_public_word_progress | `uid = user_id` + pro/premium/master 등급 | 동일 |
| master_invitations | 클라이언트 쓰기 불가(service_role만), 조회는 Admin만 | — |
| admin_audit_log | 클라이언트 쓰기 불가(service_role/트리거만), 조회는 Admin만 | — |
| migration_jobs / migration_id_map | `uid = user_id` | — |
| device_migration_status | `uid = user_id` | — |
| retention_schedules | 조회만 `uid = user_id`, 쓰기는 service_role | — |
| speaking_sentences | `uid = user_id` | — |
| speaking_recordings | `uid = user_id` | — |

상세 RLS 문구는 각 테이블이 정의된 설계 문서(위 표) 원문을 그대로 적용한다.
