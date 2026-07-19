# 권한 설계 (Permission Design)

> 작성일: 2026-07-18
> Moroutine 무료·유료·관리자 정책 전면 개편 — SSOT는 `docs/DESIGN.md`, 이 문서는 그 하위 상세.
> 관련 문서: `docs/SUBSCRIPTION_DESIGN.md`, `docs/DATA_STORAGE_DESIGN.md`, `docs/ADMIN_DESIGN.md`, `docs/MASTER_INVITATION_DESIGN.md`

---

## 1. 확정 정책 요약

- 사용자 유형은 `guest / pro / premium / admin / master` 5종.
- 이 값을 단일 컬럼으로 관리하지 않는다. **인증 상태 / 계정 역할 / 서비스 권한 3개 축으로 분리**한다.
- 서비스 권한은 항상 **서버에서 검증된 값**을 기준으로 판단한다. 클라이언트 상태(Zustand 등)는 서버 값의 캐시일 뿐 권한의 근거가 될 수 없다.
- Guest는 Supabase Auth 계정이 없다. Guest는 "인증 상태=anonymous"이며, DB의 `profiles`/`subscriptions` 어디에도 행이 존재하지 않는다.

---

## 2. 3축 모델

### 2-1. 인증 상태 (Authentication State)

```text
anonymous     — Supabase Auth 세션 없음. Guest.
authenticated — Supabase Auth 세션 있음. pro / premium / master / admin 중 하나여야 함(정상 상태).
```

> 인증되어 있으나 아무 서비스 권한도 없는 상태(구독 만료 + special_access 없음)는 **정상 정착 상태가 아니라 전이 상태**다. `docs/MIGRATION_DESIGN.md`의 `downgrade_pending` 절차를 거쳐 반드시 `anonymous`(Guest)로 귀결되어야 한다. 이 상태가 오래 지속되면 버그로 간주한다.
>
> **정책: 결제 없는 회원가입은 지원하지 않는다.** 이 전이 상태는 "Pro/Premium이었다가 만료·해지된 경우"만이 아니라 "애초에 상품을 결제한 적이 없는 계정"에도 동일하게 적용된다 — 원인(만료 vs 미결제)과 무관하게 authenticated + 무권한은 항상 같은 방식(§7-1 아래 `downgrade_pending` 절차)으로 처리되어 Guest로 귀결되어야 한다. "가입만 하고 결제하지 않은 상태"를 Guest와 구분되는 별도 정착 상태(예: Free 회원)로 존치하지 않는다 — 이는 의도적 결정이며, `docs/SUBSCRIPTION_DESIGN.md` §6, `docs/DECISION_LOG.md` 2026-07-18 항목("가입 즉시 상품 선택을 강제하거나 로그아웃 문구를 일반화") 참고.

### 2-2. 계정 역할 (Account Role) — `profiles.role`

```text
user   — 일반 사용자 (기본값)
admin  — 관리자
```

- 클라이언트에서 변경 불가. `profiles_update` RLS 정책에서 `role`/`special_access` 컬럼은 사용자 자신도 수정 불가(§7 참고).
- 오직 Admin이 다른 Admin을 지정하는 서버 프로세스(수동 SQL 또는 별도 관리자 승격 Edge Function, MVP에서는 Supabase Dashboard에서 직접 수행)를 통해서만 변경.

### 2-3. 서비스 권한 (Service Entitlement)

```text
guest    — anonymous 상태에서만 존재(DB 행 없음, 클라이언트 로컬 판단)
pro      — 활성 pro 구독
premium  — 활성 premium 구독
master   — profiles.special_access = 'master'
```

- `admin`은 서비스 권한 열거형에는 포함하지 않는다. Admin은 계정 역할이며, 관리자 화면 접근 여부는 role로 판단하고, Admin 본인이 개인 학습 기능을 사용할지는 **결정 필요**(§8 결정 필요 항목 참고) 항목으로 별도 처리한다.

---

## 3. 권한 우선순위 결정 로직

```text
role = 'admin'                        → Admin
special_access = 'master'             → Master
활성 Premium 구독 존재                 → Premium
활성 Pro 구독 존재                     → Pro
그 외 (anonymous, 또는 authenticated인데 위 어디에도 해당 없음) → Guest
```

- 우선순위는 상호 배타적이지 않다. 예: Admin이면서 과거 Pro 구독 이력이 있을 수 있으나, 최종 서비스 등급은 항상 최상단 매칭값을 따른다(Admin > Master > Premium > Pro > Guest).
- `role='admin'`인 계정도 `special_access`, `subscriptions` 행을 가질 수 있다(예: 관리자가 개인적으로 Pro를 구독). 다만 최종 판정은 Admin이 우선한다. 관리자 화면 접근은 role만으로 판단하고, 개인 학습 기능 사용 시의 데이터 저장 모드(Remote/AdminContent)는 §8에서 결정.

---

## 4. DB 스키마

### 4-1. profiles (기존 테이블 확장)

기존 마이그레이션 01/11/12(`docs/DB_SCHEMA.md`)의 `profiles`에 아래 컬럼을 추가한다. **기존 `plan_type`, `premium_expires_at` 컬럼(마이그레이션 13, 문서 계획만 존재하고 실제 파일 없음)은 신설하지 않고 이 설계로 대체한다.**

```sql
-- 마이그레이션 13(신규) — profiles_role_access
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS role            text NOT NULL DEFAULT 'user',
    -- 'user' | 'admin'
  ADD COLUMN IF NOT EXISTS special_access  text NOT NULL DEFAULT 'none',
    -- 'none' | 'master'
  ADD COLUMN IF NOT EXISTS special_access_granted_at timestamptz,
  ADD COLUMN IF NOT EXISTS special_access_granted_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS special_access_revoked_at timestamptz;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check CHECK (role IN ('user', 'admin')),
  ADD CONSTRAINT profiles_special_access_check CHECK (special_access IN ('none', 'master'));

CREATE INDEX idx_profiles_role ON profiles(role) WHERE role = 'admin';
CREATE INDEX idx_profiles_special_access ON profiles(special_access) WHERE special_access = 'master';
```

`role`, `special_access`, `special_access_*`는 **사용자 자신도 클라이언트에서 수정 불가**해야 하므로 기존 `profiles_update` RLS 정책을 컬럼 단위로 분리한다(§7 참고).

### 4-2. subscription_plans (신규 — 요금제 설정 테이블)

Pro 한도 등은 하드코딩하지 않고 이 테이블로 관리한다.

```sql
-- 마이그레이션 14(신규) — subscription_plans
CREATE TABLE subscription_plans (
  code                     text PRIMARY KEY,   -- 'pro' | 'premium'
  personal_word_limit      int,                -- NULL = 무제한
  sync_enabled             boolean NOT NULL DEFAULT true,
  public_wordbook_enabled  boolean NOT NULL DEFAULT true,
  bulk_import_enabled      boolean NOT NULL DEFAULT true,
  is_active                boolean NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- 초기 데이터 — personal_word_limit 값은 결정 필요(§8), 임시 자리표시자로 미확정 표기
INSERT INTO subscription_plans (code, personal_word_limit, sync_enabled, public_wordbook_enabled, bulk_import_enabled)
VALUES
  ('pro',     NULL, true, true, true),  -- TODO: 실제 한도 값 확정 전까지 NULL(무제한)로 시작하지 않도록 배포 전 반드시 채울 것
  ('premium', NULL, true, true, true);

ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
-- 모든 인증 사용자가 읽을 수 있어야 함(가격/한도 표시용). 쓰기는 Admin만.
CREATE POLICY "subscription_plans_select" ON subscription_plans
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "subscription_plans_admin_write" ON subscription_plans
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
```

> ⚠️ 배포 체크리스트: `pro.personal_word_limit`을 NULL(무제한)인 채로 배포하면 Pro/Premium 구분이 무의미해진다. 값 확정 전에는 스테이징에서만 사용하고 프로덕션 배포를 막는 CI 체크를 권장(결정 필요 항목, §8).

### 4-3. subscriptions (신규 — 결제 상태)

상세 설계는 `docs/SUBSCRIPTION_DESIGN.md` 참고. 여기서는 권한 판정에 필요한 핵심만 기술.

```sql
-- 마이그레이션 15(신규) — subscriptions
CREATE TABLE subscriptions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_code              text NOT NULL REFERENCES subscription_plans(code),
    -- 'pro' | 'premium'
  status                 text NOT NULL DEFAULT 'active',
    -- 'active' | 'grace_period' | 'billing_retry' | 'expired' | 'revoked'
  provider                text NOT NULL DEFAULT 'revenuecat',
  provider_subscription_id text,
  started_at             timestamptz NOT NULL DEFAULT now(),
  current_period_end     timestamptz,
  grace_period_end       timestamptz,
  canceled_at            timestamptz,
  expired_at             timestamptz,
  retention_expires_at   timestamptz,   -- expired_at/master 해제 시점 + 3개월, 서버 데이터 삭제 예정일
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_subscriptions_user_active
  ON subscriptions(user_id) WHERE status IN ('active', 'grace_period', 'billing_retry');
CREATE INDEX idx_subscriptions_user ON subscriptions(user_id, created_at DESC);
CREATE INDEX idx_subscriptions_retention ON subscriptions(retention_expires_at) WHERE retention_expires_at IS NOT NULL;

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_select" ON subscriptions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- INSERT/UPDATE는 클라이언트에서 금지. Webhook 처리 Edge Function이 service_role로 직접 기록.
-- (RLS를 우회하는 service_role 경로만 존재 — authenticated 대상 INSERT/UPDATE 정책 없음)
```

`idx_subscriptions_user_active` 유니크 인덱스로 "동시에 2개 이상의 활성 구독" 상태를 DB 레벨에서 방지한다(Pro→Premium 전환 시 기존 구독을 먼저 `canceled`/`expired`로 전이시킨 후 신규 구독 INSERT).

### 4-4. 권한 판정 SQL 함수

RLS 정책과 애플리케이션 양쪽에서 재사용하기 위해 `SECURITY DEFINER STABLE` 함수로 정의한다.

```sql
CREATE OR REPLACE FUNCTION is_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE((SELECT role = 'admin' FROM profiles WHERE id = p_user_id), false);
$$;

CREATE OR REPLACE FUNCTION get_service_tier(p_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT CASE
    WHEN (SELECT role FROM profiles WHERE id = p_user_id) = 'admin' THEN 'admin'
    WHEN (SELECT special_access FROM profiles WHERE id = p_user_id) = 'master' THEN 'master'
    WHEN EXISTS (
      SELECT 1 FROM subscriptions
      WHERE user_id = p_user_id AND plan_code = 'premium'
        AND status IN ('active', 'grace_period', 'billing_retry')
    ) THEN 'premium'
    WHEN EXISTS (
      SELECT 1 FROM subscriptions
      WHERE user_id = p_user_id AND plan_code = 'pro'
        AND status IN ('active', 'grace_period', 'billing_retry')
    ) THEN 'pro'
    ELSE 'guest'  -- authenticated인데 매칭 없음 = 전이 상태(버그 아니면 downgrade_pending)
  END;
$$;
```

> `grace_period`/`billing_retry` 상태도 "활성 구독"으로 취급해 권한을 유지한다(§7 processing 원칙, `docs/SUBSCRIPTION_DESIGN.md` §2 참고).

---

## 5. 권한 표현 방식 비교 및 최종안

| 방식 | 장점 | 단점 | 채택 여부 |
|---|---|---|---|
| `profiles.role` / `profiles.special_access` 플랫 컬럼 | 조회 단순, RLS에서 서브쿼리 1회로 판정, 즉시 반영(해제 시 바로 적용) | 컬럼 추가마다 마이그레이션 필요 | **✅ 채택** (role, special_access) |
| 별도 Entitlement 테이블(`user_entitlements`) | 이력 관리 용이, 여러 권한 동시 부여 가능 | 이번 모델은 권한이 상호배타적 우선순위 구조라 오버엔지니어링 | ❌ 미채택 — `subscriptions` 테이블이 사실상 이 역할을 함 |
| Supabase Auth Custom Claims (JWT) | 클라이언트에서 즉시 읽기 가능, RLS에서 `auth.jwt()`로 DB 조회 없이 판정 가능 | **JWT는 로그인/갱신 시점에만 발급** → Admin이 Master를 해제해도 사용자의 기존 JWT가 만료되기 전까지(기본 1시간) 클라이언트가 구권한을 계속 인식. 즉시 반영이 필요한 이번 정책(Master 해제, Admin 강등)에 부적합 | ❌ 미채택 |

**최종안**: `profiles.role` + `profiles.special_access` (플랫 컬럼) + `subscriptions` (구독 상태 테이블) 조합. 모든 RLS 정책과 서버 로직은 매 요청마다 `get_service_tier()` 함수로 DB를 직접 조회해 판정한다. Custom Claims는 사용하지 않음으로써 "해제 즉시 반영"이라는 요구사항(§6, §18)을 만족시킨다. 대가로 매 요청 DB 조회 비용이 발생하지만, `profiles`/`subscriptions` 모두 인덱스가 걸린 소규모 조회이므로 MVP 규모에서는 무시 가능한 수준으로 판단.

> Custom Claims를 병행 도입할 경우를 대비해 문서화: 만약 향후 트래픽 증가로 DB 조회 비용이 문제가 되면, JWT에 `service_tier`를 캐싱하되 **Master/Admin 해제 시에는 Supabase Admin API로 해당 사용자의 세션을 강제 무효화(`admin.signOut` 또는 refresh token revoke)해 즉시 반영을 강제하는 보완책이 필요**하다는 점을 결정 필요 항목으로 남긴다.

---

## 6. 클라이언트 Permissions 객체

화면에서 `if (planType === 'premium')` 같은 직접 분기를 금지하고, 중앙화된 권한 객체를 사용한다.

```typescript
// src/lib/permissions.ts
export type ServiceTier = 'guest' | 'pro' | 'premium' | 'master' | 'admin'

export type Permissions = {
  serviceTier: ServiceTier
  isAuthenticated: boolean
  usesRemoteStorage: boolean       // false = LocalDataRepository, true = RemoteDataRepository
  canSync: boolean
  canBulkImport: boolean
  canUsePublicWordbooks: boolean
  personalWordLimit: number | null // null = 무제한
  canAccessAdmin: boolean
}

export function buildPermissions(input: {
  role: 'user' | 'admin'
  specialAccess: 'none' | 'master'
  subscription: { planCode: 'pro' | 'premium'; status: SubscriptionStatus } | null
  plans: Record<'pro' | 'premium', { personalWordLimit: number | null; syncEnabled: boolean; bulkImportEnabled: boolean; publicWordbookEnabled: boolean }>
  isAuthenticated: boolean
}): Permissions {
  const activeStatuses = ['active', 'grace_period', 'billing_retry']
  const hasActiveSub = (code: 'pro' | 'premium') =>
    input.subscription?.planCode === code && activeStatuses.includes(input.subscription.status)

  const serviceTier: ServiceTier =
    input.role === 'admin' ? 'admin'
    : input.specialAccess === 'master' ? 'master'
    : hasActiveSub('premium') ? 'premium'
    : hasActiveSub('pro') ? 'pro'
    : 'guest'

  if (serviceTier === 'guest') {
    return {
      serviceTier, isAuthenticated: input.isAuthenticated, usesRemoteStorage: false,
      canSync: false, canBulkImport: false, canUsePublicWordbooks: false,
      personalWordLimit: null, canAccessAdmin: false,
    }
  }
  if (serviceTier === 'admin') {
    return {
      serviceTier, isAuthenticated: true, usesRemoteStorage: false, // §8 결정 필요: Admin 개인 학습 기능 사용 여부
      canSync: false, canBulkImport: false, canUsePublicWordbooks: false,
      personalWordLimit: null, canAccessAdmin: true,
    }
  }
  if (serviceTier === 'master') {
    return {
      serviceTier, isAuthenticated: true, usesRemoteStorage: true,
      canSync: true, canBulkImport: true, canUsePublicWordbooks: true,
      personalWordLimit: null, canAccessAdmin: false,
    }
  }
  // pro | premium
  const plan = input.plans[serviceTier]
  return {
    serviceTier, isAuthenticated: true, usesRemoteStorage: true,
    canSync: plan.syncEnabled, canBulkImport: plan.bulkImportEnabled,
    canUsePublicWordbooks: plan.publicWordbookEnabled,
    personalWordLimit: plan.personalWordLimit, canAccessAdmin: false,
  }
}
```

- `personalWordLimit = null`은 무제한을 의미한다(Guest, Premium, Master, Admin).
- Guest의 `personalWordLimit: null`은 "서버 제한 없음"을 의미할 뿐, §3.4 정책상 Guest는 로컬 저장 용량이 사실상의 한계다. UI는 이를 별도 안내(로컬 저장 용량 안내)로 표시하고 `personalWordLimit`과 혼동하지 않는다.
- 이 객체는 반드시 **서버에서 조회한 role/special_access/subscription/plans 값**으로만 생성한다. 클라이언트가 임의로 `serviceTier`를 지정해 생성할 수 없도록 `buildPermissions`는 순수 함수로 유지하고, 입력값 자체는 TanStack Query로 서버에서 로드한다(§9 참고).

---

## 7. RLS 정책 원칙

| 원칙 | 적용 |
|---|---|
| Pro/Premium/Master는 자신의 개인 데이터만 CRUD | 기존 `wordbooks`/`words`/`study_sessions`/`schedules`/`notifications` RLS(`auth.uid() = user_id`) 그대로 유지 — 이 정책들은 role/tier와 무관하게 "로그인한 본인"이면 적용되므로 수정 불필요 |
| Guest는 Supabase 개인 데이터에 접근하지 않음 | Guest는 애초에 Auth 계정이 없으므로 자동 충족. 서버 측 강제 규칙 아님(구조적으로 불가능) |
| Pro/Premium/Master는 `published` 공용 단어장 읽기 가능 | `public_wordbooks_select` 정책에 `get_service_tier(auth.uid()) IN ('pro','premium','master')` 조건(`docs/ADMIN_DESIGN.md` §4 DDL 참고) |
| Guest는 공용 단어장 접근 불가 | Guest는 anon key로도 `authenticated` 세션이 없으므로 `TO authenticated` 정책 자체가 차단 |
| 일반 사용자는 공용 단어장 원본 수정·삭제 불가 | `public_wordbooks`/`public_words`의 UPDATE/DELETE 정책은 `is_admin(auth.uid())`만 허용 |
| 사용자는 자신의 공용 단어장 등록 상태만 CRUD | `user_public_wordbook_enrollments`: `auth.uid() = user_id` |
| 사용자는 자신의 공용 단어 학습 진행만 CRUD | `user_public_word_progress`: `auth.uid() = user_id` |
| Admin은 공용 단어장/단어만 CRUD | `public_wordbooks`/`public_words`의 ALL 정책: `is_admin(auth.uid())`. 개인 데이터 테이블에는 Admin용 정책을 추가하지 않는다(=Admin도 타인의 `words`/`wordbooks`를 조회 불가) |
| Master 권한은 클라이언트에서 변경 불가 | `profiles_update` 정책을 컬럼 단위로 분리(아래 §7-1) |
| Admin 역할은 클라이언트에서 변경 불가 | 동일 |
| 결제 상태는 클라이언트 값을 신뢰하지 않음 | `subscriptions`에 authenticated용 INSERT/UPDATE 정책 자체를 만들지 않음. service_role Webhook 경로만 존재 |
| Pro 단어 한도는 서버에서 최종 검증 | `docs/SUBSCRIPTION_DESIGN.md` §3의 RPC로 원자적 처리 |
| 초대 토큰은 서버에서만 검증 | `docs/MASTER_INVITATION_DESIGN.md` §3 |

### 7-1. profiles UPDATE 정책 — 컬럼 단위 보호

Postgres RLS는 컬럼 단위 权한을 직접 지원하지 않으므로, `role`/`special_access*` 컬럼 보호는 **트리거**로 구현한다.

```sql
CREATE OR REPLACE FUNCTION prevent_self_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    NEW.role = OLD.role;
    NEW.special_access = OLD.special_access;
    NEW.special_access_granted_at = OLD.special_access_granted_at;
    NEW.special_access_granted_by = OLD.special_access_granted_by;
    NEW.special_access_revoked_at = OLD.special_access_revoked_at;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_self_privilege_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE PROCEDURE prevent_self_privilege_escalation();
```

- 일반 사용자의 `profiles UPDATE` 요청(닉네임 변경 등)이 실수로 `role`/`special_access`를 함께 보내더라도 트리거가 기존 값으로 되돌려 무력화한다.
- Admin에 의한 `special_access` 변경(Master 지정/해제)은 **Admin 전용 Edge Function**(service_role 사용, `docs/MASTER_INVITATION_DESIGN.md` 참고)에서 수행하며, 이 경우 `is_admin(auth.uid())`이 true이므로 트리거를 통과한다.

---

## 8. 결정 필요 항목 (이 문서 범위)

| 항목 | 비고 |
|---|---|
| Pro `personal_word_limit` 실제 값 | `subscription_plans` 테이블 값으로만 관리, 코드에 하드코딩 금지 |
| Admin의 일반 학습 기능(단어장/퀴즈 등) 사용 여부 | 사용 허용 시 `usesRemoteStorage`/데이터 저장 위치 재설계 필요 — 현재는 `false`로 잠정 처리 |
| Custom Claims 병행 도입 여부(트래픽 증가 시) | §5 참고, 병행 시 세션 강제 무효화 보완책 필수 |

---

## 9. 클라이언트 로딩 전략

- `usePermissions()` 훅(TanStack Query, key: `['permissions']`)이 로그인 시 `profiles`(role, special_access) + `subscriptions`(활성 구독 1건) + `subscription_plans`(전체)를 조회해 `buildPermissions()`로 변환.
- Guest(비로그인)는 서버 조회 없이 즉시 `buildPermissions({ role: 'user', specialAccess: 'none', subscription: null, isAuthenticated: false, plans })`로 고정된 Guest 권한을 반환.
- 세션 시작 시 1회 로딩 후, `subscriptions` 변경은 실시간 반영이 필수는 아님(MVP 범위) — 앱 재시작/포그라운드 복귀 시 재조회로 충분(§25 동기화 정책과 별개, 권한 자체의 실시간 갱신은 결정 필요 항목 아님으로 명시적으로 MVP 제외).
