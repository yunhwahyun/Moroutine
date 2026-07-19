# 데이터 보관·삭제·알림 설계 (Data Retention Design)

> 작성일: 2026-07-18
> 전제: `docs/SUBSCRIPTION_DESIGN.md` §6(구독 만료), `docs/MASTER_INVITATION_DESIGN.md` §5(Master 해제) — 둘 다 이 문서의 리텐션 파이프라인을 공유한다.

---

## 1. 확정 정책

구독 종료 또는 Master 권한 해제 후 서버의 사용자 개인 데이터는 **3개월** 보관한다. 보관 기준 시점은 `expired_at`(구독) 또는 `special_access_revoked_at`(Master)이며, `subscriptions.retention_expires_at` 컬럼(또는 Master 전용 리텐션 레코드, §2)에 "= 기준시점 + 3개월"로 계산해 저장한다.

---

## 2. 리텐션 트리거 통합

구독 만료와 Master 해제는 서로 다른 테이블에서 발생하므로, 삭제 스케줄러가 참조할 통합 뷰/테이블을 둔다.

```sql
CREATE TABLE retention_schedules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source              text NOT NULL,   -- 'subscription_expired' | 'subscription_revoked' | 'master_revoked'
  source_ref_id       uuid,            -- subscriptions.id 또는 NULL(master)
  retention_expires_at timestamptz NOT NULL,
  local_migration_confirmed_at timestamptz,  -- 최소 1개 기기에서 로컬 이전 완료 확인된 시각(참고용, 삭제 조건 아님)
  notified_at_expiry  timestamptz,     -- §6-1 만료 시점 안내 발송 여부
  notified_before_deletion boolean NOT NULL DEFAULT false,  -- §6-2 삭제 전 추가 알림 발송 여부
  status              text NOT NULL DEFAULT 'active',
    -- 'active' | 'deletion_scheduled' | 'deleted' | 'canceled'(재구독/재지정으로 취소됨)
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_retention_schedules_due ON retention_schedules(retention_expires_at) WHERE status = 'active';
CREATE INDEX idx_retention_schedules_user ON retention_schedules(user_id);

ALTER TABLE retention_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "retention_schedules_select" ON retention_schedules
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- 쓰기는 service_role(Webhook/Master 해제 Edge Function)만
```

- 구독이 `expired`/`revoked`로 전이될 때(`docs/SUBSCRIPTION_DESIGN.md` §3) 또는 Master가 해제될 때(`docs/MASTER_INVITATION_DESIGN.md` §5), 동일 트랜잭션에서 `retention_schedules` 행을 생성한다.
- **3개월 이내 재구독/재지정 시**(`docs/SUBSCRIPTION_DESIGN.md` §7) 해당 `retention_schedules.status='canceled'`로 전이시켜 삭제 대상에서 제외한다.

✅ **구현 완료(2026-07-18)**: 위 두 항목은 `supabase/functions/revenuecat-webhook/index.ts`(`handleTermination()`이 만료/해지 시 INSERT, `handleActivation()`이 재구독 시 `status='canceled'`로 전이)와 `supabase/functions/master-revoke/index.ts`(유효 구독 없을 때만 INSERT)/`master-accept/index.ts`(수락 시 `status='canceled'`로 전이)에 반영됨.

---

## 3. 3개월 이내 처리

`docs/MIGRATION_DESIGN.md` §7(3개월 이내 복원 병합), `docs/SUBSCRIPTION_DESIGN.md` §7 참고. 이 문서는 "삭제되지 않는다"는 보장만 담당한다 — 스케줄러(§4)는 `retention_schedules.status='active'`이고 `retention_expires_at < now()`인 행만 대상으로 하므로, 복원이 완료되어 `status='canceled'`가 된 사용자는 자동으로 삭제 파이프라인에서 제외된다.

---

## 4. 3개월 경과 후 삭제

### 4-1. 삭제 대상 / 보존 대상

| 삭제 후보 | 별도 보존 검토 대상(삭제하지 않음) |
|---|---|
| 개인 단어장(`wordbooks`) | Auth 계정(`auth.users`) — 재가입 방지·이력 목적상 계정 자체는 유지, 개인 데이터만 삭제 |
| 개인 단어(`words`) | 결제 거래 내역(`subscription_audit_log`, RevenueCat 원장) |
| 학습 이력(`study_sessions`, `study_results`) | 환불 내역 |
| 복습 상태(단어의 status/review_step 등, words 삭제에 포함) | 법적 보존 대상(세금계산서 등, 있다면) |
| 일정(`schedules`, `schedule_exceptions`) | 이용약관 동의 이력 |
| 알림 설정(`notifications`, `profiles`의 알림 컬럼은 계정과 함께 유지 여부 별도 검토) | 관리자 권한 변경 이력(`admin_audit_log`) |
| 개인 녹음 파일(Storage `speaking-recordings/{user_id}/...`) | Master 초대·권한 변경 감사 로그(`master_invitations`, `admin_audit_log`) |
| 공용 단어장 사용자 학습 진행(`user_public_wordbook_enrollments`, `user_public_word_progress`) | — |
| 불필요한 동기화 로그(있다면) | — |

`profiles` 행 자체는 삭제하지 않는다(계정 재활성화 시 닉네임 등 최소 정보 유지 여부는 결정 필요, §7) — 다만 `role`/`special_access`는 Master 해제 케이스라면 이미 `none`으로 전이되어 있다.

### 4-2. Scheduled Edge Function `retention-cleanup` ✅ 구현 완료(`supabase/functions/retention-cleanup/index.ts`, 2026-07-18)

**구현 편차**: 아래 원안은 자식→부모 순서로 명시적 삭제를 나열하지만, 실제 코드는 `wordbooks`/
`schedules`/`study_sessions`/`user_public_wordbook_enrollments`/`user_public_word_progress`/
`speaking_sentences` **부모 테이블만** `user_id` 기준으로 삭제한다 — 기존 FK가 이미 대부분
`ON DELETE CASCADE`(`words→wordbooks`, `schedule_exceptions`/`notifications→schedules`,
`study_results→study_sessions`/`words`, `speaking_recordings→speaking_sentences`)로 걸려 있어
자식 테이블은 자동으로 함께 삭제되기 때문. DELETE는 멱등이라 실패 후 재시도해도 이미 지워진
테이블은 0건 삭제로 넘어가 별도 트랜잭션 관리 없이 안전하다. Storage(`speaking-recordings/{user_id}/**`)
삭제 단계는 스피킹 기능(Phase 23) 자체가 미착수라 실제 버킷/파일이 없어 이번엔 생략 — Phase 23
구현 후 추가 필요.

```
Cron: pg_cron, 매일 03:00 UTC (docs/DB_SCHEMA.md 기존 speaking_recordings cleanup과 동일 패턴)

처리:
1. retention_schedules WHERE status='active' AND retention_expires_at < now() 조회
2. 각 user_id에 대해 트랜잭션 단위로:
   a. Storage 파일 삭제 (speaking-recordings/{user_id}/**) — Storage API 별도 호출(트랜잭션 밖)이므로
      DB 삭제보다 먼저 수행하고, 실패 시 해당 user_id는 스킵하고 다음 cron 주기에 재시도
   b. 관계형 데이터 삭제(자식 → 부모 순서, FK CASCADE 활용 가능한 것은 CASCADE, 명시적 삭제가 필요한 것은 순서 지정):
      study_results → study_sessions
      schedule_exceptions → notifications → schedules
      words → wordbooks
      user_public_word_progress → user_public_wordbook_enrollments
      speaking_recordings(메타) → speaking_sentences(사용자 등록분)
   c. retention_schedules.status = 'deleted', updated_at = now()
3. Idempotency: 이미 status='deleted'인 행은 스킵(멱등)
4. 부분 실패: 트랜잭션 롤백 후 해당 user_id는 status='active' 유지 → 다음 cron 주기 재시도.
   반복 실패(예: 5회 이상) 시 관리자 알림 큐에 적재(수동 확인 필요 항목으로 표시)
5. 삭제 결과 감사 로그: admin_audit_log INSERT (actor_id=시스템 계정 또는 NULL 허용 컬럼 별도 처리,
   action='retention_delete', target_type='user', detail={ tables_deleted, storage_files_deleted, duration_ms })
```

```sql
SELECT cron.schedule(
  'retention-cleanup',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/retention-cleanup',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  )
  $$
);
```

✅ **확정(2026-07-18)**: `admin_audit_log.actor_id`는 시스템 계정을 새로 만들지 않고 **nullable로 완화**했다(마이그레이션 29). `retention-cleanup`은 `actor_id: null`로 감사 로그를 남긴다.

pg_cron 등록(`cron.schedule(...)`) 자체는 Supabase 프로젝트 Dashboard에서 pg_cron 확장 활성화 후 사용자가 직접 실행해야 한다 — 이번 세션은 Edge Function 코드까지만 스캐폴딩했다.

---

## 5. 삭제 후 상태

- 삭제된 데이터는 복원 불가.
- 현재 기기의 Guest 로컬 데이터에는 영향 없음(서버 삭제와 로컬 저장소는 완전히 독립).
- 재구독 시 새로운 서버 데이터로 시작(빈 상태 — 3개월이 지났으므로 자동 병합 대상 없음, `docs/MIGRATION_DESIGN.md` §7 병합 로직은 `retention_schedules.status='active'`인 경우에만 적용됨을 명확히 한다).

---

## 6. 알림 정책 (§19)

### 6-1. 구독 만료 시점 안내

만료 확정(`docs/SUBSCRIPTION_DESIGN.md` §3 Webhook 처리) 직후 1회 발송.

```text
구독이 종료되었습니다.
클라우드에 저장된 데이터는 구독 종료일로부터 3개월 동안 보관됩니다.
앱을 실행하면 데이터를 현재 기기에 저장하여 무료 모드로 계속 사용할 수 있습니다.
3개월 이후에는 클라우드 데이터가 삭제되며 복원할 수 없습니다.
```

진입점: 앱 열기 / 데이터 내보내기 / 구독 복원 / 데이터 보관 만료일 확인.

✅ **구현 완료(2026-07-18, §6-2 편차와 동일한 방식)**: 1회성 발송 대신 `RetentionBanner`가
`retention_schedules.status='active'`인 동안 앱 열 때마다 지속적으로 표시 — "1회 발송" 요구사항을
"삭제 전까지 상시 노출"로 대체(전달력 측면에서 더 안전한 방향으로 판단).

### 6-2. 삭제 전 추가 알림 ✅ 확정(2026-07-18): 7일 전 1회만(다단계 아님)

```text
클라우드 데이터 보관기간이 곧 종료됩니다.
삭제 예정일: YYYY.MM.DD
삭제 이후에는 기존 학습 데이터를 복원할 수 없습니다.
데이터를 유지하려면 앱을 열어 현재 기기로 저장하거나, 구독을 복원하거나, 데이터를 내보내주세요.
```

> **구현 편차(2026-07-18)**: 아래 원안은 별도 `retention-notify` Edge Function이 이메일을 발송하는
> 것이었으나, 조사 결과 Supabase Auth의 4개 기본 메일 템플릿(초대/매직링크/비밀번호재설정/가입확인)이
> 전부 특정 인증 액션에 묶여 있어 임의 내용의 알림을 보낼 수 없었다. **이메일 대신 앱 내 배너로
> 대체**(§6-3 "앱 내 알림" 옵션 채택) — `retention-notify` Edge Function은 만들지 않고, 클라이언트가
> `retention_schedules`(RLS로 본인 것만 SELECT 가능)를 직접 읽어 `RetentionBanner`
> (`web/src/components/retention/RetentionBanner.tsx`, `AppLayout` 상단에 마운트)로 표시한다.
> `notified_before_deletion` 컬럼은 이번 구현에서 사용하지 않는다(배너는 매번 조회해 표시하므로
> "발송 여부 플래그"라는 개념 자체가 필요 없음) — 향후 실제 이메일/푸시를 추가하면 그때 사용.

### 6-3. 알림 수단

| 수단 | 상태 |
|---|---|
| 이메일 | ❌ 채택 안 함(2026-07-18) — Supabase Auth 기본 메일 템플릿이 임의 내용에 맞지 않음(§6-2 편차 참고). 외부 이메일 서비스 도입 시 재검토 |
| Push Notification | ❌ 이번 범위에서 도입 안 함(2026-07-18 확정) — 서버 발신 원격 푸시는 Expo Push API 또는 FCM/APNs 직접 연동이 필요, 현재 `expo-notifications`는 로컬 알림만 처리(`docs/DESIGN.md` §5) |
| 앱 내 알림 | ✅ 채택(2026-07-18) — `RetentionBanner`로 구현 완료 |
| 결제 플랫폼 알림 연계 | RevenueCat/App Store/Play Store 자체 발송 만료 안내와 별개로 운영, 중복 발송 여부는 운영 정책 |

### 6-4. 법무 검토 항목

사용자가 알림 수신을 거부한 경우에도 데이터 삭제 고지가 "필수 서비스 안내"에 해당해 마케팅 수신거부와 무관하게 발송 가능한지는 **운영·법무 검토 항목**으로 남긴다(임의 결정하지 않음).

---

## 7. 결정 필요 항목

| 항목 | 비고 |
|---|---|
| ~~삭제 전 추가 알림 시점(30일/7일/1일 중 몇 단계)~~ | ✅ 확정(2026-07-18): 7일 전 1회만 |
| ~~`admin_audit_log.actor_id` nullable 여부 / 시스템 계정 도입~~ | ✅ 확정(2026-07-18): nullable로 완화(마이그레이션 29). §4-2 참고 |
| ~~Push Notification 서버 발신 도입 여부~~ | ✅ 확정(2026-07-18): 이번 범위에서 도입 안 함. §6-3 참고 |
| 데이터 삭제 고지의 필수 안내 해당 여부(법무) | §6-4 참고 — 법무 검토 사항이라 이번에도 임의 결정하지 않음(미해결 유지) |
