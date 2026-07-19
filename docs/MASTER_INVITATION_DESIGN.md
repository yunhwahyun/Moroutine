# Master 초대·해제 설계 (Master Invitation Design)

> 작성일: 2026-07-18
> 전제: `docs/PERMISSION_DESIGN.md`(`profiles.special_access`), `docs/ADMIN_DESIGN.md`(감사 로그), `docs/SUBSCRIPTION_DESIGN.md` §8-4/8-5(Master 관련 상태 전이).

---

## 1. 확정 정책

Master는 관리자가 지정한 무료 로그인 회원 — 유료 결제 없이 Premium과 동일하게 무제한 이용. 관리자 기능은 이용 불가. 가입은 **관리자가 이메일을 먼저 등록 → 초대 메일 발송 → 사용자가 링크로 가입 완료**하는 순서로만 진행한다(사용자가 스스로 "Master로 가입"할 방법은 없다).

---

> **구현 편차(2026-07-18, ✅ 구현 완료)**: 아래 §2~§4의 "자체 crypto 토큰 생성 → SHA-256 해시 저장 →
> 토큰 직접 검증" 방식은 실제로는 **Supabase 세션 인증 방식으로 단순화**해 구현했다. `inviteUserByEmail`은
> 이미 가입된 이메일에는 사용할 수 없고, 초대/매직 링크 모두 Supabase 자체 토큰으로 로그인 세션을 만드는
> 방식이라 자체 토큰 스킴과 결이 맞지 않았기 때문. 근거는 `docs/DECISION_LOG.md` 2026-07-18 항목 참고.
> 실제 동작: 신규 이메일은 `auth.admin.inviteUserByEmail`, 이미 가입된 이메일은 그 호출이 실패하면
> `auth.signInWithOtp`(매직 링크)로 자동 폴백 — 어느 쪽이든 클릭하면 `/master/accept`에 **이미 인증된
> 세션**으로 도착하고, `master-accept` Edge Function은 토큰 대신 **세션의 이메일**을 `master_invitations`와
> 대조한다. 이에 따라 `token_hash` 컬럼은 검증에 쓰이지 않아 NOT NULL 제약을 제거(마이그레이션 28)하고
> INSERT 시 채우지 않는다.

## 2. master_invitations 테이블

```sql
-- 마이그레이션 18(신규) — master_invitations
CREATE TABLE master_invitations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL,
  token_hash   text NOT NULL,      -- 원문 토큰은 저장하지 않음 (sha256)
  status       text NOT NULL DEFAULT 'pending',
    -- 'pending' | 'sent' | 'accepted' | 'expired' | 'revoked'
  invited_by   uuid NOT NULL REFERENCES auth.users(id),
  expires_at   timestamptz NOT NULL,
  accepted_at  timestamptz,
  accepted_user_id uuid REFERENCES auth.users(id),
  revoked_at   timestamptz,
  revoked_by   uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- 동일 이메일 중복 초대 방지: "처리 중"(pending/sent) 상태는 이메일당 최대 1건
CREATE UNIQUE INDEX idx_master_invitations_active_email
  ON master_invitations(email) WHERE status IN ('pending', 'sent');
CREATE INDEX idx_master_invitations_token ON master_invitations(token_hash);
CREATE INDEX idx_master_invitations_email ON master_invitations(email);

ALTER TABLE master_invitations ENABLE ROW LEVEL SECURITY;
-- 클라이언트 직접 접근 전면 차단 — 모든 처리는 service_role Edge Function 경유
CREATE POLICY "master_invitations_admin_select" ON master_invitations
  FOR SELECT TO authenticated USING (is_admin(auth.uid()));
-- INSERT/UPDATE/DELETE 정책 없음 = Edge Function(service_role)만 가능
```

---

## 3. 보안 원칙

| 요구사항 | 구현 |
|---|---|
| 초대 토큰 원문 DB 저장 금지 | `token_hash`만 저장(SHA-256). 원문은 이메일 링크에만 존재, 서버 메모리에서도 응답 즉시 폐기 |
| 초대 링크 만료시간 | `expires_at` — 값은 결정 필요(§7), Edge Function이 검증 시점에 `now() > expires_at`이면 `status='expired'`로 갱신 후 거부 |
| 1회 사용 후 재사용 차단 | `accept` 처리 시 `status='accepted'`로 트랜잭션 내 원자적 업데이트. 이미 `accepted`/`expired`/`revoked`면 거부 |
| 동일 이메일 중복 초대 방지 | `idx_master_invitations_active_email` 유니크 인덱스(부분 인덱스로 pending/sent만 제한) |
| 이미 가입된 이메일 처리 | 초대 등록 시 `auth.users`에 해당 이메일이 이미 존재하면 "신규 가입" 대신 "기존 계정에 Master 권한 부여" 플로우로 분기(§4-2) |
| 초대 철회 | `status='revoked'`, `revoked_at`/`revoked_by` 기록. 이후 해당 토큰은 검증 실패 처리 |
| 만료 후 재발송 | 기존 `expired`/`revoked` 건은 그대로 두고(이력 보존) 신규 `master_invitations` 행을 새 토큰으로 생성 |
| 관리자 작업 감사 로그 | 모든 초대/철회/재발송/해제를 `admin_audit_log`(`docs/ADMIN_DESIGN.md` §4)에 기록 |
| 이메일 인증 완료 후 Master 권한 부여 | `accept` Edge Function은 Supabase Auth의 이메일 인증 완료 콜백 이후에만 `special_access='master'`를 부여(가입 직후 미인증 상태로 권한을 먼저 주지 않음) |

---

## 4. 초대 흐름

### 4-1. 신규 이메일 초대

```text
[Admin] POST /functions/v1/master-invite { email }
  → is_admin(auth.uid()) 검증
  → email이 auth.users에 이미 존재하는지 확인
      존재 O → §4-2로 분기
      존재 X → 계속
  → 활성 초대(pending/sent) 중복 확인 (유니크 인덱스가 최종 방어선)
  → 토큰 생성(crypto random 32bytes) → SHA-256 해시 → master_invitations INSERT
      (status='pending', expires_at = now() + INVITE_TTL)
  → 이메일 발송(Supabase Auth inviteUserByEmail 또는 자체 이메일 서비스)
      링크: https://moroutine.app/master/accept?token={원문 토큰}
  → 발송 성공 시 status='sent'
  → admin_audit_log INSERT (action='master_invite')
```

### 4-2. 이미 가입된 이메일

```text
[Admin] 동일 이메일로 초대
  → auth.users에 존재 확인됨
  → master_invitations는 그대로 생성하되 accept 단계에서 "비밀번호 생성" 대신
    "기존 계정 로그인 후 확인" 플로우로 분기
  → accept 시 로그인된 사용자의 email이 초대 email과 일치하는지 검증 후 special_access='master' 부여
```

### 4-3. 초대 수락 (신규 가입)

```text
[User] 이메일 링크 클릭 → /master/accept?token=...
  → 클라이언트가 POST /functions/v1/master-accept { token, password }
  → 토큰 SHA-256 해시 후 master_invitations 조회 (status='sent' AND token_hash 일치 AND expires_at > now())
      불일치/만료/이미사용 → 거부 + 사용자 메시지("만료되었거나 이미 사용된 링크입니다")
  → Supabase Auth 계정 생성(auth.admin.createUser, service_role) + 이메일 인증 처리
      (초대 링크 클릭 자체가 이메일 소유 증명이므로 별도 이메일 인증 메일을 추가로 보내지 않는 경로도 가능 — 결정 필요, §7)
  → profiles.special_access = 'master', special_access_granted_at = now(),
     special_access_granted_by = master_invitations.invited_by
  → master_invitations: status='accepted', accepted_at=now(), accepted_user_id=신규 user_id
  → admin_audit_log INSERT (action='master_invite' 완료 로그 또는 별도 'master_accepted')
  → 로컬 Guest 데이터가 있다면 docs/MIGRATION_DESIGN.md §2 절차로 이전 여부 확인
```

### 4-4. 초대 재발송 / 취소

```text
재발송: POST /functions/v1/master-invite-resend { invitation_id }
  → is_admin 검증, 대상이 status='sent'|'expired'인지 확인
  → 신규 토큰 재발급(기존 행 재사용, token_hash/expires_at 갱신) → 재발송
  → admin_audit_log INSERT (action='master_invite_resend')

취소: POST /functions/v1/master-invite-revoke { invitation_id }
  → is_admin 검증 → status='revoked' → admin_audit_log INSERT (action='master_invite_revoke')
```

---

## 5. Master 삭제 (§6.3 원문)

```text
[Admin] Master 삭제 실행
  1. special_access = 'master' 해제 (special_access='none', special_access_revoked_at=now())
  2. 사용자에게 "서버 데이터를 현재 기기로 저장하시겠습니까" 안내 (다음 앱 실행 시 또는 즉시 푸시/이메일)
  3. 사용자가 앱 실행 시 서버 데이터를 현재 기기에 적용 (docs/MIGRATION_DESIGN.md §6 엔진)
  4. 로컬 이전 성공 검증
  5. 로그아웃 (Auth 세션 종료 — Auth 계정 자체는 삭제하지 않음)
  6. Guest Local Mode 전환
  7. 서버 데이터는 3개월간 보관 (subscriptions와 무관한 별도 retention 트리거 — §5-1 참고)
  8. 3개월 후 서버 개인 데이터 삭제 (docs/DATA_RETENTION_DESIGN.md)
```

**구분해야 할 4가지 상태**(원문 요구사항):

| 상태 | Master 해제 시점 처리 |
|---|---|
| Master 권한 해제 | 즉시(`special_access='none'`) |
| 로그인 계정 상태 | 유지(다음 로그인 가능, 세션만 §5의 5번 단계에서 종료) |
| 서버 데이터 보관 | 3개월 유지 |
| Guest 전환 | 로컬 이전 성공 확인 후 |
| Auth 계정 삭제 여부 | **삭제하지 않음** — Master 해제는 계정 삭제가 아니라 등급 강등 |

### 5-1. Master 해제 시 유효 구독 확인 (§6.3 후반부, `docs/SUBSCRIPTION_DESIGN.md` §8-4와 동일 로직 참조)

```text
special_access='none' 처리 직후 get_service_tier() 재평가:
  유효 Premium 구독 있음 → Premium 유지 (위 §5의 2~8단계 전체 스킵, 로그아웃 없음)
  유효 Pro 구독 있음     → Pro 유지 (동일하게 스킵)
  유료 구독 없음          → 위 §5의 2~8단계 전체 진행 (Guest 전환)
```

이 판정은 Master 해제 Edge Function 내부에서 원자적으로 수행하여, "일단 Guest 전환 절차부터 시작했다가 중간에 유효 구독을 발견해 되돌리는" 상황을 피한다.

### 5-2. Master 권한 해제 감사 로그

```sql
-- admin_audit_log (docs/ADMIN_DESIGN.md §4) 재사용
-- action='master_revoke', target_type='user', target_id=대상 user_id,
-- detail={ 'resulting_tier': 'guest'|'pro'|'premium', 'had_active_subscription': bool }
```

---

## 6. Edge Function 목록 요약 ✅ 구현 완료(2026-07-18, `supabase/functions/master-*/`)

| 함수 | 설명 |
|---|---|
| `master-invite` | 신규 초대 생성 + 이메일 발송(신규는 inviteUserByEmail, 기존 가입자는 signInWithOtp 폴백) |
| `master-invite-resend` | 동일 이메일로 재발송 + `expires_at` 갱신 |
| `master-invite-revoke` | 초대 철회 |
| `master-accept` | 세션 인증(§2 편차 참고) → special_access='master' 부여 |
| `master-revoke` | Admin이 기존 Master 권한 해제(§5), 유효 구독 있으면 자동 유지 |

각 함수는 `docs/API_SPEC.md`에 상세 스펙을 추가한다. 공용 헬퍼는 `supabase/functions/_shared/`
(`cors.ts`, `auth.ts`, `masterInvite.ts`) — 이 프로젝트 최초의 `_shared` 모듈.

**부수 발견 및 수정**: 마이그레이션 13의 `prevent_self_privilege_escalation` 트리거가 service_role
Edge Function의 정당한 `special_access` 갱신까지 되돌리는 버그를 발견 — service_role 연결은
`auth.uid()`가 NULL이라 `is_admin(NULL)`이 항상 false를 반환하기 때문. 마이그레이션 28에서
`OR auth.role() = 'service_role'` 조건을 추가해 수정(Phase 20의 관리자 역할 변경 화면에도 동일하게 필요한 선행 수정).

---

## 7. 결정 필요 항목

| 항목 | 비고 |
|---|---|
| ~~초대 링크 유효기간(`INVITE_TTL`)~~ | ✅ 확정(2026-07-18): 7일 |
| ~~초대 수락 시 별도 이메일 인증 메일 발송 여부~~ | ✅ 확정(2026-07-18): 불필요 — 초대/매직 링크 클릭 자체를 이메일 소유 증명으로 간주 |
