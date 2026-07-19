# 구독 설계 (Subscription Design)

> 작성일: 2026-07-18
> 전제: `docs/PERMISSION_DESIGN.md`의 3축 모델(인증상태/계정역할/서비스권한), `subscription_plans`/`subscriptions` DDL을 따른다.
> 데이터 이전의 기술적 엔진(청크 업로드, Idempotency, 롤백)은 `docs/MIGRATION_DESIGN.md` 참고. 이 문서는 "언제, 어떤 조건으로 전이가 발생하는가"라는 정책 레벨을 다룬다.

---

## 1. Pro / Premium 확정 정책

| 항목 | Pro | Premium |
|---|---|---|
| 가입 | 로그인 필수 | 로그인 필수 |
| 저장 위치 | Supabase DB + Storage | Supabase DB + Storage |
| 기기 간 동기화 | O | O |
| 개인 단어 총등록 수 제한 | **있음** (`subscription_plans.pro.personal_word_limit`) | **없음**(`null`) |
| 단어 일괄 등록 | O (한도 내) | O(무제한) |
| 공용 단어장 이용 | O | O |

Pro 제한 포함/제외 대상(§4 참고 원문 그대로 확정):

- 포함: 개별 등록, 일괄 등록, CSV 등록, Guest→Pro 이전 단어, 공용 단어를 개인 단어장으로 복사한 사본.
- 미포함: 관리자 공용 단어장 원본, 공용 단어장 학습 진행 데이터.

---

## 2. 구독 상태 머신

```text
active         → 정상 유료 권한
grace_period   → 결제 실패했지만 일정 기간 기존 권한 유지
billing_retry  → 결제 재시도 중, 기존 권한 유지
expired        → 최종 구독 만료, 권한 종료 트리거
revoked        → 환불/강제 취소, 권한 즉시 종료 트리거
```

`get_service_tier()`(`docs/PERMISSION_DESIGN.md` §4-4)는 `active`/`grace_period`/`billing_retry` 3개 상태를 모두 "활성 구독"으로 취급해 Pro/Premium 권한을 유지한다. `expired`/`revoked`는 §6 만료 처리 절차를 트리거한다.

**확정(2026-07-18)**: Grace Period = **16일**(Google Play 기본값, iOS는 App Store가 자체적으로 최대 60일까지 재시도하므로 서버 값은 상한선 역할만 함). billing_retry 최대 기간 = **30일**(스토어 표준 재시도 주기) — 이 기간이 지나면 자동으로 `expired` 처리해야 하나, 실제 자동 전환용 스케줄 Edge Function(`subscription-retry-timeout`)은 Phase 18의 `retention-cleanup`과 같은 성격(pg_cron 등록 필요)이라 이번 스캐폴딩에서는 판단에 필요한 `subscriptions.billing_retry_started_at` 컬럼(마이그레이션 27)만 준비하고, 실제 크론 등록은 이후 세션으로 이월한다.

---

## 3. RevenueCat Webhook 처리

### 3-1. Edge Function `revenuecat-webhook` ✅ 구현 완료(`supabase/functions/revenuecat-webhook/index.ts`, 2026-07-18)

```
POST /functions/v1/revenuecat-webhook
Headers: Authorization: Bearer {RevenueCat Webhook Auth Token}

처리:
1. Authorization 헤더 검증 (RevenueCat 대시보드 설정 토큰과 일치 여부, service_role 권한으로 실행)
2. event.app_user_id → Supabase user_id 매핑 (RevenueCat app_user_id = Supabase auth.users.id로 1:1 설정)
3. event.type 분기:
   INITIAL_PURCHASE | RENEWAL | UNCANCELLATION
     → subscriptions UPSERT { plan_code, status: 'active', current_period_end, ... }
     → 기존 활성 구독(다른 plan_code)이 있으면 먼저 status='canceled'로 전이 후 신규 INSERT
        (idx_subscriptions_user_active 유니크 인덱스 충돌 방지)
   BILLING_ISSUE
     → subscriptions UPDATE status='billing_retry'
   GRACE_PERIOD (RevenueCat expiration_at_ms 기준 판단, 플랫폼별 상이)
     → subscriptions UPDATE status='grace_period', grace_period_end=...
   CANCELLATION (자발적 해지 예약, 만료 전까지는 active 유지)
     → subscriptions UPDATE canceled_at=now() (status는 유지, current_period_end까지 정상 이용)
   EXPIRATION
     → subscriptions UPDATE status='expired', expired_at=now(),
        retention_expires_at = now() + 3 months
     → downgrade_pending 트리거 (§6)
   REFUND / REVOKE
     → subscriptions UPDATE status='revoked', expired_at=now(),
        retention_expires_at = now() + 3 months
     → downgrade_pending 트리거 (§6), 즉시 처리(환불 악용 방지 위해 grace 없음)
4. Idempotency: RevenueCat event.id를 별도 processed_webhook_events(event_id PK)에 기록,
   중복 이벤트 수신 시 2번째부터는 no-op 후 200 반환
5. 감사 로그: subscription_audit_log INSERT (user_id, event_type, before_status, after_status, raw_payload)
```

```sql
CREATE TABLE processed_webhook_events (
  event_id    text PRIMARY KEY,
  provider    text NOT NULL DEFAULT 'revenuecat',
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE subscription_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type    text NOT NULL,
  before_status text,
  after_status  text,
  raw_payload   jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
-- RLS: 클라이언트 접근 불가(서버 전용). ENABLE RLS만 하고 정책 없음 = 기본 거부.
ALTER TABLE subscription_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_webhook_events ENABLE ROW LEVEL SECURITY;
```

- 클라이언트는 `subscriptions` 테이블에 대해 SELECT 정책만 가진다(`docs/PERMISSION_DESIGN.md` §4-3). Webhook 처리 Edge Function만 service_role로 INSERT/UPDATE 가능 → "클라이언트 값만으로 유료 권한을 부여하지 않는다" 원칙 충족.

---

## 4. Pro 단어 한도 원자적 검증

### 4-1. 검증이 필요한 모든 등록 경로

단건 등록 / 일괄 등록 / CSV 등록 / Guest 데이터 이전 / 다른 단어장 복사 / API 직접 요청 — 예외 없이 전부 서버(RPC) 경유.

### 4-2. RPC 설계 ✅ 구현 완료(`supabase/migrations/25_create_words_checked.sql`, 2026-07-18)

초안(TABLE 반환)과 달리 실제 구현은 **jsonb 단일 값**을 반환한다 — `createWord`(단건)가 방금 삽입된 단어 행 자체를 필요로 하기 때문에 `inserted` 배열도 함께 실어 보낸다. `bulkCreateWords`는 `inserted`는 버리고 카운트 필드만 사용한다.

```sql
CREATE OR REPLACE FUNCTION create_words_checked(
  p_wordbook_id uuid,
  p_words       jsonb   -- [{term, definition, description, example, memo}, ...]
) RETURNS jsonb   -- { inserted: Word[], inserted_count, current_total, limit_value, blocked }
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_tier     text;
  v_limit    int;
  v_current  int;
  v_incoming int := jsonb_array_length(p_words);
  v_inserted jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  -- 소유권 검증
  IF NOT EXISTS (SELECT 1 FROM wordbooks WHERE id = p_wordbook_id AND user_id = v_user_id) THEN
    RAISE EXCEPTION 'wordbook not owned by user';
  END IF;

  v_tier := get_service_tier(v_user_id);
  IF v_tier NOT IN ('pro', 'premium', 'master') THEN
    RAISE EXCEPTION 'only pro/premium/master can register words via this function';
  END IF;

  -- 동시 등록 Race Condition 방지: 사용자 단위 advisory lock (트랜잭션 종료 시 자동 해제)
  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text));

  -- premium/master는 subscription_plans 조회 없이 항상 무제한(IF 분기로 명시 — SELECT 결과가
  -- 우연히 NULL이 아니게 되는 실수를 원천 차단)
  IF v_tier = 'pro' THEN
    SELECT personal_word_limit INTO v_limit FROM subscription_plans WHERE code = 'pro';
  ELSE
    v_limit := NULL;
  END IF;

  SELECT count(*) INTO v_current FROM words WHERE user_id = v_user_id;

  IF v_limit IS NOT NULL AND v_current + v_incoming > v_limit THEN
    RETURN jsonb_build_object(
      'inserted', '[]'::jsonb, 'inserted_count', 0,
      'current_total', v_current, 'limit_value', v_limit, 'blocked', true
    );
  END IF;

  WITH inserted_rows AS (
    INSERT INTO words (wordbook_id, user_id, term, definition, description, example, memo)
    SELECT p_wordbook_id, v_user_id,
           elem->>'term', elem->>'definition',
           NULLIF(elem->>'description', ''), NULLIF(elem->>'example', ''), NULLIF(elem->>'memo', '')
    FROM jsonb_array_elements(p_words) elem
    RETURNING *
  )
  SELECT jsonb_agg(to_jsonb(inserted_rows)) INTO v_inserted FROM inserted_rows;

  RETURN jsonb_build_object(
    'inserted', COALESCE(v_inserted, '[]'::jsonb), 'inserted_count', v_incoming,
    'current_total', v_current + v_incoming, 'limit_value', v_limit, 'blocked', false
  );
END;
$$;
```

- `pg_advisory_xact_lock(hashtext(user_id))`으로 동일 사용자의 동시 다중 등록 요청을 트랜잭션 범위에서 직렬화 → Race Condition 차단.
- 부분 성공 없음: 한도 초과 시 `blocked=true`와 함께 0건 삽입, 전체 트랜잭션 롤백. "정상 행만 등록"이 필요한 CSV 케이스는 클라이언트가 사전에 초과분을 걸러내고 남은 만큼만 이 RPC를 호출하는 방식으로 처리(§5 참고).
- Guest는 이 RPC를 호출하지 않는다(로컬 Repository가 처리, `docs/DATA_STORAGE_DESIGN.md`).
- **클라이언트 연동**: `web/src/repositories/remote/RemoteDataRepository.ts`의 `createWord()`(단건, 한도 초과 시 `WordLimitExceededError` throw)와 `bulkCreateWords()`(대량, `BulkCreateResult.blocked`로 결과 반환) 둘 다 이 RPC 하나만 호출한다 — 직접 `supabase.from('words').insert()`를 호출하는 경로는 이제 없다.

### 4-3. 클라이언트 사전 안내(§13 일괄 등록 정책) ✅ 구현 완료(`WordbookDetailPage.tsx`, 2026-07-18)

일괄 등록 화면은 RPC 호출 전에 아래를 계산해 미리보기 패널로 표시하고, 사용자가 확인(등록 버튼 클릭)해야 실제 `bulkCreateWords()`(RPC)를 호출한다:

```
현재 개인 단어 수 / 추가 예정 수 / 중복 제외 수 / 오류 행 수 /
등록 후 예상 단어 수 / 요금제 한도 / 등록 가능 여부
```

- 중복 판정: 같은 단어장 내 기존 단어 + 파일 내부 중복을 `term+definition` 완전 일치로 판정, 자동 제외 후 등록.
- 오류 행: `.txt` 파싱 시 단어/뜻 중 하나라도 비어있는 줄.
- 이 사전 계산은 UX용이며 최종 판정은 항상 RPC(서버)가 내린다(클라이언트 계산과 서버 계산이 어긋나면 서버가 우선 — 동시 등록 등으로 어긋날 경우 서버의 `blocked` 응답을 그대로 노출).
- 단건 등록("+ 추가" 폼)도 동일하게 한도 대상이며, 초과 시 폼 하단에 에러 메시지로 안내(별도 미리보기 없이 즉시 실패 처리 — 1건이라 미리보기의 실익이 낮음).
- Pro 등급에서는 `/wordbooks` 목록 화면 상단에 "개인 단어 N/한도개" 상시 배너를 노출하고, 한도 도달 시 Premium 업그레이드 유도 문구 + `/pricing`(Phase 21 placeholder) 링크를 표시한다.

**Playwright 실브라우저 검증(2026-07-18)**: 미리보기 계산 로직 자체는 tier와 무관한 순수 UI 코드라 Guest 경로에서 게이트를 임시로 우회해 검증(검증 후 즉시 원복) — 기존 단어 1개 + 업로드 파일(정상 3행/중복 2행/오류 1행) 조합에서 "현재 1개/추가 예정 3개/중복 제외 2개/오류 행 1개/등록 후 예상 4개"가 정확히 계산되고, 등록 후 실제 단어 수도 예상과 정확히 일치함을 확인. **다만 RPC 자체의 서버측 한도 차단(`blocked=true` 응답)은 실제 Pro 등급 Supabase 계정이 없어 이 세션에서는 직접 검증하지 못했다** — SQL 로직 리뷰로 정확성을 신뢰하고 있으나, 실제 Pro 계정으로 사후 검증을 권장한다.

---

## 5. Guest → Pro/Premium 전환

정책 절차(11단계, §9 원문)와 데이터 이전 엔진은 `docs/MIGRATION_DESIGN.md` §2 참고. 이 문서에서는 구독 관점의 트리거 조건만 기술.

```text
1. Pro/Premium 상품 선택
2. 회원가입 또는 로그인 (Supabase Auth 계정 신규 생성)
3. RevenueCat 결제 → Webhook 수신 → subscriptions 행 생성(§3)
4. 클라이언트가 subscriptions 활성 상태를 폴링 또는 딜레이 후 재조회해 Entitlement 확정
   (Webhook 도달 전 클라이언트가 낙관적으로 Premium을 가정하지 않는다 — 서버 확정 대기)
5~11. docs/MIGRATION_DESIGN.md §2 참고
```

### 5-1. Guest → Pro 전환 시 한도 초과 (§10 정책)

```text
기존 로컬 단어는 모두 서버로 이전(삭제 없음)
이전된 단어: 조회 / 학습 / 수정 / 삭제 가능
신규 등록(개별/일괄/CSV/복사/API)만 차단 — §4-2 RPC의 blocked=true 응답으로 자연스럽게 처리됨
개인 단어 수가 한도 이하로 내려가면(삭제 등으로) 신규 등록 자동 재허용
Premium 업그레이드 안내 노출
```

이전 자체는 한도를 검증하지 않는 별도 경로(`migrate_guest_words` RPC, `docs/MIGRATION_DESIGN.md` §3)를 사용한다 — §4-2의 `create_words_checked`는 신규 등록 전용이며 마이그레이션에는 사용하지 않는다(마이그레이션은 한도를 무시하고 전량 이전해야 하므로).

화면 표시 항목: 현재 개인 단어 수 / Pro 단어 한도 / 초과 단어 수 / 신규 등록 제한 상태 / Premium 업그레이드 버튼.

### 5-2. Guest → Premium 전환

한도 개념이 없으므로 전량 이전 후 즉시 신규 등록 허용. 대량 데이터·녹음 파일 이전 포함(`docs/MIGRATION_DESIGN.md` §2-3).

---

## 6. 구독 만료 / 결제 최종 실패 → Guest 전환

> 이 절차는 "만료/해지"뿐 아니라 **"결제 이력이 아예 없는 authenticated 계정"**(예: `docs/API_SPEC.md` 회원가입 폼을 상품 선택 없이 단독으로 완료한 경우)에도 동일하게 적용된다. `get_service_tier()`가 `guest`를 반환하는데 세션은 인증 상태인 모든 경우가 대상이며, 서버는 원인(만료 vs 미결제)을 구분하지 않고 동일한 `downgrade_pending` 절차로 처리한다(`docs/PERMISSION_DESIGN.md` §2-1, `docs/DECISION_LOG.md` 2026-07-18 "결제 없는 회원가입 미지원" 참고). §6-2의 안내 문구(§19 알림 정책, `DowngradeModal.tsx`)도 "구독 만료"가 아니라 "유효한 구독 없음"을 전제로 일반화해 표현한다.

### 6-1. 트리거

`subscriptions.status`가 `expired` 또는 `revoked`로 확정되는 시점(§3 Webhook), 또는 회원가입 완료 후 유효한 구독을 한 번도 생성하지 않은 경우(§5의 정상 흐름을 건너뛰고 로그인/가입만 완료한 상태).

### 6-2. 절차 (§16 원문)

```text
1. 서버에서 구독 만료 확정 (subscriptions.status = expired/revoked)
2. 사용자에게 만료 안내 (§19 알림 정책)
3. 앱 실행 시 서버 데이터를 현재 기기로 다운로드
4. Local DB에 적용 (docs/DATA_STORAGE_DESIGN.md의 LocalDataRepository)
5. 로컬 데이터 개수·무결성 검증
6. 이전 완료 상태 서버 기록 (device_migration_status, docs/MIGRATION_DESIGN.md §5)
7. 로그아웃 (Supabase Auth 세션 종료)
8. Guest Local Mode 전환
9. 서버 데이터는 retention_expires_at까지(기본 3개월) 보관
10. retention_expires_at 경과 후 서버 개인 데이터 삭제 (docs/DATA_RETENTION_DESIGN.md)
```

### 6-3. 중요 조건

- 로컬 이전 완료 **전** 서버 데이터 삭제 금지, 강제 로그아웃 금지.
- 오프라인이면 상태를 `downgrade_pending`으로 유지하고 로그인 세션은 살려둔 채 재시도 대기(앱 재실행 시 이어서 처리).
- 부분 실패 시 롤백 또는 재시도(`docs/MIGRATION_DESIGN.md` §4).
- 기준 데이터는 항상 서버 최신본. 현재 기기에 기존 Guest 데이터가 남아있다면 병합 규칙(§7-2와 동일한 충돌 처리) 적용.

### 6-4. 데이터 상태 (기기 로컬 관점)

```text
active              — 정상 Remote 사용 중
downgrade_pending    — 만료 확정, 로컬 이전 대기/진행 중
retained             — 로컬 이전 완료, 서버는 보관 중(3개월 타이머 진행)
deletion_scheduled   — 삭제 임박(알림 발송 시점 이후)
deleted              — 서버 개인 데이터 삭제 완료
```

### 6-5. 만료 후 Guest의 단어 한도

Guest로 전환된 이후에는 등록 제한이 없다(§3.4 Guest 정책과 동일). 로컬 저장 환경이 허용하는 범위에서 계속 등록 가능.

---

## 7. Pro/Premium 복원 (3개월 이내, §18.1)

> **이월(2026-07-18)**: 이 절의 병합 로직은 이번 Phase 16 스캐폴딩 범위에서 제외했다. 중복 판정 UI,
> 기기 선택 UX가 §7-1/§7-2 자체에 "결정 필요"로 남아 있어(아래 §10, `docs/MIGRATION_DESIGN.md` §9),
> Edge Function/다운그레이드 엔진과는 성격이 다른 별도 UX 설계 작업이 필요하다. `docs/TODO.md` Phase 16에
> 남겨두고 다음 세션에서 별도로 다룬다.

### 7-1. Pro 복원 시 한도 초과 (§11, §17 정책)

```text
기존 서버 데이터 유지
Guest 로컬 데이터(만료 후 계속 등록된 것 포함) 이전 가능
기존 서버 단어 + 이전된 로컬 단어 모두 유지, 중복 제거하여 병합
신규 등록만 차단 (한도 초과 상태 유지 시)
한도 이하가 되면 신규 등록 재허용
Premium 업그레이드 안내
```

병합/중복 제거 알고리즘, Idempotency Key 처리는 `docs/MIGRATION_DESIGN.md` §6(3개월 이내 복원) 참고.

### 7-2. Premium 복원

한도 없음 → 모든 로컬 데이터를 제한 없이 병합, 신규 등록 즉시 허용.

---

## 8. 사용자 상태 전이 매트릭스 (§26 전체)

각 전이는 `발생조건 / 인증상태 / 결제상태 / 저장모드 / 데이터이전방향 / 사용자확인 / 단어한도처리 / 실패시롤백 / 서버데이터보존 / UI변경 / 알림 / 로그아웃여부` 순으로 기술한다.

### 8-1. Guest → 유료/Master

| 전이 | 발생조건 | 인증상태 변화 | 저장모드 변화 | 데이터 이전 방향 | 사용자 확인 | 단어 한도 처리 | 실패 롤백 | 알림 | 로그아웃 |
|---|---|---|---|---|---|---|---|---|---|
| Guest→Pro | 결제 성공 + Webhook 확정 | anonymous→authenticated | Local→Remote | 로컬→서버(전량) | 필수(§9 안내) | 초과 시 신규 차단(§5-1) | 부분 실패 시 로컬 유지+재시도, 성공 검증 전 로컬 삭제 금지 | 없음(즉시 전환) | 없음 |
| Guest→Premium | 결제 성공 + Webhook 확정 | anonymous→authenticated | Local→Remote | 로컬→서버(전량, 제한없음) | 필수 | 없음 | 동일 | 없음 | 없음 |
| Guest→Master | Admin이 이메일로 초대 후 사용자가 초대 수락 | anonymous→authenticated(신규 가입) | Local→Remote(선택적, 이전 시점에 로컬 데이터 있으면 §9 절차 재사용) | 로컬→서버(전량, 제한없음) | 필수 | 없음 | 동일 | 초대 메일 | 없음 |

### 8-2. Pro ↔ Premium

| 전이 | 발생조건 | 결제상태 | 데이터 이전 | 단어 한도 처리 | 서버데이터 보존 | UI 변경 |
|---|---|---|---|---|---|---|
| Pro→Premium | 업그레이드 결제 | 기존 Pro 구독 canceled → Premium 구독 active | 이전 불필요(동일 Remote, 행 재사용) | 한도 해제, 즉시 무제한 | 그대로 유지 | 한도 표시 UI 제거 |
| Premium→Pro | 다운그레이드(사용자 선택 또는 결제 실패로 인한 강제 다운그레이드는 §6 만료 절차를 따름 — 여기서는 자발적 다운그레이드만) | 기존 Premium 구독 canceled → Pro 구독 active | 이전 불필요 | 즉시 한도 검증 적용. **기존 단어 수가 Pro 한도를 초과해도 삭제하지 않음** — §5-1과 동일한 "신규 등록만 차단" 규칙 적용 | 그대로 유지 | 한도 초과 시 §5-1 UI 노출 |

### 8-3. 유료/Master → Guest

| 전이 | 발생조건 | 처리 | 참고 |
|---|---|---|---|
| Pro→Guest | 구독 expired/revoked | §6 절차 | — |
| Premium→Guest | 구독 expired/revoked | §6 절차 | — |
| Master→Guest | Admin이 Master 권한 해제 **+ 유효한 유료 구독 없음** | `docs/MASTER_INVITATION_DESIGN.md` §4 절차(§6 절차와 동일한 로컬 이전 후 Guest 전환) | 유료 구독이 있으면 아래 8-4 참고 |

### 8-4. Master 해제 시 유료 구독 존재

| 전이 | 발생조건 | 처리 |
|---|---|---|
| Master→Premium | Master 해제 + 유효 Premium 구독 존재 | `special_access='none'`으로 변경만 하고 Remote 유지, 재로그인/재이전 불필요(`get_service_tier`가 자동으로 premium 반환) |
| Master→Pro | Master 해제 + 유효 Pro 구독 존재(Premium 없음) | 동일하되, 기존 단어 수가 Pro 한도 초과 시 §5-1 규칙 적용(삭제 없이 신규 등록만 차단) |

### 8-5. Master 승격

| 전이 | 발생조건 | 처리 |
|---|---|---|
| Pro→Master | Admin이 기존 Pro 유료 사용자를 Master로 지정 | `special_access='master'` 부여. 기존 Pro 구독은 그대로 두거나(중복 유료 결제 낭비 방지를 위해 Admin이 사용자에게 구독 해지를 안내) 유지해도 무방 — `get_service_tier`가 Master를 Premium보다 우선하므로 실사용 권한에는 영향 없음. 결제 이중 부담 방지는 **결정 필요**(자동 환불/해지 연동 여부) |
| Premium→Master | 동일 | 동일 |

### 8-6. 계정 역할 전이

| 전이 | 발생조건 | 처리 |
|---|---|---|
| User→Admin | 별도 관리자 승격 프로세스(Supabase Dashboard 직접 SQL 또는 최상위 Admin 전용 Edge Function, MVP는 Dashboard 수동) | `profiles.role='admin'`. 감사 로그 기록 |
| Admin→User | 동일 프로세스로 해제 | `profiles.role='user'`. 감사 로그 기록. 해제 후 서비스 권한은 기존 special_access/subscriptions 값으로 자동 재판정 |

---

## 9. 설정 화면 반영 (§23 발췌)

- Pro: 개인 단어 현재 수 / 한도 / 신규 등록 가능 여부 / 마지막 동기화 시간 / Premium 업그레이드 / 구독 관리 / 데이터 내보내기.
- Premium: 무제한 표시 / 동기화 상태 / 구독 관리 / 데이터 내보내기.
- Master: 결제 관리 메뉴 비노출, 무제한 표시, 동기화 상태.

상세 화면 목록은 `docs/UI_FLOW.md` 참고.

---

## 10. 결정 필요 항목

| 항목 | 비고 |
|---|---|
| ~~Grace Period 기간~~ | ✅ 확정(2026-07-18): 16일. §2 참고 |
| ~~billing_retry 최대 기간/횟수~~ | ✅ 확정(2026-07-18): 최대 30일. §2 참고 |
| Master 승격 시 기존 유료 구독 자동 해지 여부 | 이중 결제 방지 정책 |
| Pro `personal_word_limit` 값 | `docs/PERMISSION_DESIGN.md` §8과 동일 항목 |
| §7 3개월 이내 복원 병합 UX(중복 판정, 기기 선택) | Phase 16 이월 — 다음 세션 |
