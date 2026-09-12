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
--- Guest/Pro/Master/Admin 정책 개편 ---
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
32. service_role_grants          ← service_role에 public 스키마 테이블 권한 부여 + list_masters() 타입 버그 수정
33. sample_wordbooks             ← public_wordbooks.is_sample + anon RLS (docs/ADMIN_DESIGN.md §3 샘플 단어장)
34. admin_settings_defaults      ← handle_new_user() 신규 가입자 기본값을 관리자 설정값으로 교체 +
                                     get_admin_default_settings() RPC(Guest 시딩용) (docs/DECISION_LOG.md 2026-09-01)
35. migration_rpcs_dedup_by_id   ← migrate_* RPC 6종에 "이미 존재하는 서버 행 재사용" 조건 추가
                                     (재구독 시 데이터 중복 생성 방지, docs/MIGRATION_DESIGN.md §3-1)
36. public_wordbook_status_simplify ← public_wordbooks.status를 초안/기본/게시/보관 4가지로 통합,
                                     is_sample 컬럼 제거, 관련 RLS 정책 교체 (docs/ADMIN_DESIGN.md §3)
37. remove_premium_tier            ← subscription_plans/subscriptions premium 행 삭제 +
                                     get_service_tier()/create_words_checked()/공용 단어장 RLS 4건에서
                                     premium 제거 (docs/DECISION_LOG.md 2026-09-02)
38. launch_free_access             ← app_config 싱글턴 테이블(payments_enabled) 신설 + get_service_tier()에
                                     "결제 미활성 시 로그인 사용자는 Pro" 분기 추가 (docs/SUBSCRIPTION_DESIGN.md §11)
39. handle_new_user_defensive       ← handle_new_user()의 관리자 설정값 복사 로직을 예외 처리로 감싸,
                                     실패해도 회원가입(auth.users INSERT) 자체는 항상 성공하도록 수정
                                     ("Database error saving new user" 회원가입 실패 버그 수정,
                                     docs/DECISION_LOG.md 2026-09-03)
40. handle_new_user_schema_qualify  ← handle_new_user()/get_admin_default_settings()의 profiles 참조를
                                     public.profiles로 스키마 명시 + SET search_path 고정 (실제 근본
                                     원인 수정 — "relation profiles does not exist" 42P01,
                                     docs/DECISION_LOG.md 2026-09-03)
41. public_books_bookshelf          ← public_books, public_book_chapters + sync_public_book_chapter_count/
                                     log_public_book_action/log_public_book_chapter_action 트리거
                                     ("공용 책장", 공용 단어장과 동일 구조, 학습/퀴즈/진행률/개인 복사·anon
                                     열람 없음, docs/ADMIN_DESIGN.md §8)
42. books_personal                  ← books, book_chapters(개인 책장, wordbooks/words와 동일한
                                     user_id 소유 구조) + sync_book_chapter_count 트리거. 41의
                                     public_books와는 완전히 별개 테이블(docs/ADMIN_DESIGN.md §8)
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
  description     text,  -- 2026-09-08부터 UI 입력 경로 없음(레거시 전용) — 새 입력은 전부 example로 감
  example         text,  -- 개인/공용 단어 등록 폼·일괄등록(.txt 3번째 컬럼) 전부 이 컬럼에 쓴다
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

## 마이그레이션 13~31 — Guest/Pro/Master/Admin 정책 개편 (신규)

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
| 32 | service_role_grants | `GRANT SELECT/INSERT/UPDATE/DELETE ON ALL TABLES/SEQUENCES IN SCHEMA public TO service_role` + `ALTER DEFAULT PRIVILEGES`(향후 테이블 자동 적용) + `list_masters()` 타입 캐스팅 버그(`u.email::text`) 수정 | `docs/DECISION_LOG.md` 2026-07-19 |
| 33 | sample_wordbooks | `public_wordbooks.is_sample` 컬럼 + `is_sample=true` 단어장에 한해 `anon`(비로그인 Guest)에게 SELECT를 여는 RLS 정책 2건 + `GRANT SELECT ... TO anon` | `docs/ADMIN_DESIGN.md` §3-2, `docs/DECISION_LOG.md` 2026-07-19 |
| 34 | admin_settings_defaults | `handle_new_user()` 교체(role='admin' 중 최초 계정의 현재 설정값을 신규 `profiles` 행에 복사, 관리자가 아직 없으면 기존 컬럼 기본값) + `get_admin_default_settings()` RPC(SECURITY DEFINER, 관리자 설정 컬럼만 반환, `GRANT EXECUTE ... TO anon`) | `docs/PERMISSION_DESIGN.md` §8, `docs/DECISION_LOG.md` 2026-09-01 |
| 35 | migration_rpcs_dedup_by_id | `migrate_wordbooks`/`migrate_words`/`migrate_schedules`/`migrate_schedule_exceptions`/`migrate_study_sessions`/`migrate_study_results` 6종에 "local_id가 이미 이 사용자 소유의 서버 행 id와 같으면 재사용(신규 INSERT 안 함)" 조건 추가(재구독 시 중복 생성 방지) | `docs/MIGRATION_DESIGN.md` §3-1, `docs/DECISION_LOG.md` 2026-09-01 |
| 36 | public_wordbook_status_simplify | `public_wordbooks.status`를 `'draft'\|'default'\|'published'\|'archived'` 4가지로 통합(`'hidden'` 폐지, `is_sample` 흡수) — 데이터 이관(`is_sample=true`→`default`, `hidden`→`draft`) + `public_wordbooks_select`/`public_words_select`/anon 샘플 정책 4건 교체 + `is_sample` 컬럼·인덱스 제거 | `docs/ADMIN_DESIGN.md` §3, `docs/DECISION_LOG.md` 2026-09-02 |
| 37 | remove_premium_tier | 실 구독자 없음을 확인하고 `subscription_plans`/`subscriptions`에서 `premium` 행 삭제 + `get_service_tier()`/`create_words_checked()` 재정의(`'premium'` 분기 제거) + 공용 단어장 열람 RLS 4건(마이그레이션 36의 `public_wordbooks_select`/`public_words_select`, 마이그레이션 18의 `enrollments_all`/`public_word_progress_all`)에서 `'premium'` 제거 | `docs/DECISION_LOG.md` 2026-09-02 |
| 38 | launch_free_access | `app_config` 싱글턴 테이블(`payments_enabled boolean DEFAULT false`) 신설(anon도 SELECT 가능, Admin만 쓰기) + `get_service_tier()` 재정의 — `payments_enabled=false`면 실제 pro 구독이 없어도 인증된 사용자를 `'pro'`로 판정(사업자 등록 전 무료 출시 기간) | `docs/SUBSCRIPTION_DESIGN.md` §11, `docs/DECISION_LOG.md` 2026-09-02 |
| 41 | public_books_bookshelf | `public_books`, `public_book_chapters` + `sync_public_book_chapter_count`/`log_public_book_action`/`log_public_book_chapter_action` 트리거("공용 책장", 공용 단어장 17/30과 동일 구조, 학습/퀴즈/진행률/개인 복사·anon 열람 없음) | `docs/ADMIN_DESIGN.md` §8, `docs/DECISION_LOG.md` 2026-09-08 |
| 42 | books_personal | `books`, `book_chapters`(개인 책장, `wordbooks`/`words`와 동일한 `user_id` 소유 구조 + `sync_book_chapter_count` 트리거) — 41의 `public_books`와는 완전히 별개 테이블 | `docs/ADMIN_DESIGN.md` §8, `docs/DECISION_LOG.md` 2026-09-08 |
| 43 | user_policy_agreements | `user_policy_agreements`(Master 가입 시 이용약관 동의 / 만 14세 이상 자격확인 기록, `agreement_type IN ('terms','age_eligibility')`, SELECT/INSERT는 본인만, UPDATE/DELETE 정책 없음 — 불변 기록, `auth.users` 삭제 시 CASCADE) | `docs/launch/PHASE1_POLICY.md` §4, §5 |
| 44 | remove_login_pro_fallback | `get_service_tier()` 재정의 — 38번에서 추가한 "`payments_enabled=false`면 인증된 사용자를 `'pro'`로 판정" 분기를 영구 제거(37번 버전으로 회귀: admin > master > 실제 pro 구독 > guest). 1차 출시 P0, 2차에서도 복원하지 않음 | `docs/launch/PHASE1_POLICY.md` §1, §12 |
| 45 | admin_audit_log_actor_delete_set_null | `admin_audit_log.actor_id` FK를 `ON DELETE SET NULL`로 변경(기존 FK는 ON DELETE 미지정=NO ACTION이라, Master 본인이 actor인 감사 로그가 남아있으면 `auth.admin.deleteUser()` 자체가 FK 위반으로 실패하는 문제를 P0 `master-delete-account` 구현 중 발견해 수정) | `docs/launch/PHASE1_POLICY.md` §3.5, §7 |
| 46 | master_invitations_fk_set_null | `master_invitations.accepted_user_id`/`revoked_by` FK를 `ON DELETE SET NULL`로 변경 — 45번과 같은 문제가 이 테이블에도 있었음(`master-accept`가 본인 id를 `accepted_user_id`에 항상 기록하므로 가입을 마친 모든 Master가 자기 자신을 가리키는 행을 가짐). 실제 Master 계정 탈퇴 시도 중 재현·발견(`invited_by`는 NOT NULL + Admin 삭제 플로우 없어 그대로 둠) | `docs/DECISION_LOG.md` 2026-09-10 |
| 47 | email_exists_rpc | `email_exists(p_email text) RETURNS boolean`(SECURITY DEFINER, `anon`/`authenticated` 실행 권한) — 비밀번호 찾기 화면에서 가입 여부를 확인하기 위한 RPC. `is_admin()`/`list_masters()`와 동일한 SQL RPC 패턴. 이메일 가입 여부를 의도적으로 노출함(account enumeration, 사용자 결정) | `docs/DECISION_LOG.md` 2026-09-10 |
| 48 | public_content_delete_audit | `log_public_wordbook_action()`/`log_public_word_action()`/`log_public_book_action()`/`log_public_book_chapter_action()` 4개 트리거 함수를 확장해 `AFTER DELETE`도 처리(OLD 참조, `*_delete` action 기록) — 마이그레이션 30/41 트리거가 INSERT/UPDATE만 커버해 그동안 없었던 관리자 삭제 기능(신규)의 감사 로그 공백을 메움 | `docs/DECISION_LOG.md` 2026-09-10 |
| 49 | migration_books | `migrate_books`/`migrate_book_chapters` RPC 신설(마이그레이션 26/35와 동일한 existing/owned/new_items 3-way 패턴) — 책장(books/book_chapters, 마이그레이션 42)이 이전 엔진(마이그레이션 26, 2026-07-18)보다 나중에 생겨 Guest→Remote 계정 이전 대상에서 빠져 있던 공백을 메움 | `docs/MIGRATION_DESIGN.md` "Phase 15 후속", `docs/DECISION_LOG.md` 2026-09-11 |
| 50 | master_invitation_token_check | `check_master_invitation(p_token text) RETURNS boolean`(SECURITY DEFINER, `anon`/`authenticated` 실행 권한) — Master 초대를 자체 토큰 방식으로 되돌리며(§ 아래 참고) `MasterAcceptPage`가 계정 생성 전에 토큰 유효성만 가볍게 확인하는 용도. `extensions.digest()`(pgcrypto)로 해시해 `master_invitations.token_hash`와 대조 | `docs/MASTER_INVITATION_DESIGN.md`, `docs/DECISION_LOG.md` 2026-09-12 |

> **참고(2026-09-10)**: 38번 마이그레이션의 `get_service_tier()` 정의는 44번이 즉시 대체했다 — 38번 파일 자체(과거 마이그레이션)는 수정하지 않고 `CREATE OR REPLACE FUNCTION`으로 다음 마이그레이션이 덮어쓰는 기존 관례를 그대로 따랐다.

> **중요(2026-07-19 발견)**: 01~31번 마이그레이션 중 어디에도 `service_role`에 대한 GRANT가 없었다(`GRANT ... TO authenticated`만 존재). RLS의 `BYPASSRLS` 속성은 행 단위 필터만 우회할 뿐 테이블 단위 GRANT를 대신하지 않으므로, 위 표의 "쓰기는 service_role" / "service_role만"이라고 적힌 모든 정책이 마이그레이션 32 적용 전까지는 **service_role조차 해당 테이블에 접근할 수 없는 상태**였다(`subscriptions`, `master_invitations`, `admin_audit_log`, `retention_schedules` 등). 즉 Edge Function 기반 로직(구독 Webhook, Master 초대/해제, 보관 정리)은 배포 이후 한 번도 실제로 동작한 적이 없었을 가능성이 높다. 상세 경위는 `docs/DECISION_LOG.md` 2026-07-19 참고.

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
| books(개인) | `uid = user_id` | — |
| book_chapters(개인) | `uid = user_id` + book 소유 확인 | book 소유 확인 |
| study_sessions | `uid = user_id` | — |
| study_results | `uid = user_id` + session 소유 + word 소유 | session 소유 + word 소유 |
| notifications | `uid = user_id` + schedule 소유 확인 | schedule 소유 확인 |
| subscription_plans | Admin만 쓰기, 조회는 전체 authenticated(+ anon, 마이그레이션 31) | — |
| subscriptions | 클라이언트 쓰기 불가(service_role만) | — |
| app_config | Admin만 쓰기, 조회는 전체 authenticated + anon(마이그레이션 38) | — |
| public_wordbooks / public_words | Admin만 쓰기, 조회는 pro/master(+admin은 전체, `status IN ('published','default')`). 예외: `status='default'`인 단어장은 `anon`(비로그인 Guest)도 SELECT 가능(마이그레이션 36) | — |
| public_books / public_book_chapters | Admin만 쓰기, 조회는 pro/master(+admin은 전체, `status='published'`). anon 예외 없음(마이그레이션 41, "공용 책장") | — |
| user_public_wordbook_enrollments | `uid = user_id` + pro/master 등급 | 동일 |
| user_public_word_progress | `uid = user_id` + pro/master 등급 | 동일 |
| master_invitations | 클라이언트 쓰기 불가(service_role만), 조회는 Admin만 | — |
| admin_audit_log | 클라이언트 쓰기 불가(service_role/트리거만), 조회는 Admin만 | — |
| migration_jobs / migration_id_map | `uid = user_id` | — |
| device_migration_status | `uid = user_id` | — |
| retention_schedules | 조회만 `uid = user_id`, 쓰기는 service_role | — |
| speaking_sentences | `uid = user_id` | — |
| speaking_recordings | `uid = user_id` | — |
| user_policy_agreements | `uid = user_id` | UPDATE 정책 없음(불변 기록) |

상세 RLS 문구는 각 테이블이 정의된 설계 문서(위 표) 원문을 그대로 적용한다.
