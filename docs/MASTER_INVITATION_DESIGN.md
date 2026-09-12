# Master 초대·해제 설계 (Master Invitation Design)

> 작성일: 2026-07-18
> 전제: `docs/PERMISSION_DESIGN.md`(`profiles.special_access`), `docs/ADMIN_DESIGN.md`(감사 로그), `docs/SUBSCRIPTION_DESIGN.md` §8-4/8-5(Master 관련 상태 전이).

---

## 1. 확정 정책

Master는 관리자가 지정한 무료 로그인 회원 — 유료 결제 없이 무제한 이용(Pro의 `personal_word_limit`과 무관하게 항상 `null`, `docs/PERMISSION_DESIGN.md` §4-4). 관리자 기능은 이용 불가. 가입은 **관리자가 이메일을 먼저 등록 → 초대 메일 발송 → 사용자가 링크로 가입 완료**하는 순서로만 진행한다(사용자가 스스로 "Master로 가입"할 방법은 없다).

---

> **2026-07-18~2026-09-12 편차, 이후 원안 복귀**: 한때 아래 §2~§4의 자체 토큰 방식을 Supabase
> `inviteUserByEmail`/세션 인증 방식으로 단순화했었다(신규 이메일은 `inviteUserByEmail`, 이미 가입된
> 이메일은 `signInWithOtp` 폴백, `master-accept`가 토큰 대신 세션의 이메일을 대조). **이 방식은
> `inviteUserByEmail` 호출 시점에 Supabase가 `auth.users` 계정을 즉시 생성해버려, 사용자가 아직
> 아무것도 하지 않았는데도 Supabase Dashboard의 회원 목록에 계정이 뜨는 문제가 있었다**(2026-09-12
> QA에서 발견 — 실제 권한(`special_access`)이나 초대 상태(`master_invitations.status`)는 계속
> `'none'`/`'sent'`로 남아있어 실질적 영향은 없었지만, "수락 전에는 계정 자체가 존재하면 안 된다"는
> 사용자 요구와 맞지 않았다). 그래서 2026-09-12에 **아래 §2~§4 원안(자체 crypto 토큰 → SHA-256 해시
> 저장 → 토큰 직접 검증) 그대로 복귀**했다 — `token_hash` 컬럼도 다시 채운다(마이그레이션 28의 NOT
> NULL 제거는 유지, 어차피 nullable이어도 항상 값을 넣으므로 문제없음). 이메일 발송도
> `inviteUserByEmail`이 아니라 **Resend API를 직접 호출**하는 방식으로 바뀌었다(Supabase Auth의
> 이메일 발송 API는 실제 계정 생성과 분리할 수 없기 때문). 근거는 `docs/DECISION_LOG.md` 2026-09-12
> 항목 참고.
>
> 비밀번호 입력(2026-09-10에 §4-3 원안대로 되돌린 것)은 원안 복귀 후에도 그대로 유지된다 — 다만
> 이제는 세션 확립 후 `updateUser({ password })`로 바꾸는 게 아니라, `master-accept`가 토큰 검증에
> 성공하면 그 자리에서 `auth.admin.createUser({ email, password })`로 **계정을 비밀번호와 함께 한
> 번에 생성**한다(§4-3 원문과 동일한 형태). 계정 생성 후 클라이언트가 그 비밀번호로
> `signInWithPassword()`를 호출해 세션을 확립한다.

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
| 초대 취소 | **행을 실제로 삭제**(2026-09-10 변경, 아래 §4-4 참고). 삭제 전 `admin_audit_log`에 이메일을 기록해두므로 이력은 감사 로그로만 남는다 |
| 만료 후 재발송 | 기존 `expired` 건은 그대로 두고(이력 보존) 신규 `master_invitations` 행을 새 토큰으로 생성. 취소(삭제)된 건은 애초에 행이 없으므로 해당 없음 |
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
  → is_admin 검증 → admin_audit_log INSERT (action='master_invite_delete') → 행 DELETE
```

**2026-09-10 변경(§4-4 원안 수정)**: 원래는 `status='revoked'`로 표시만 하고 행을 영구 보존하는
설계였으나, 취소한 초대는 다시 쓰지 않는데도 목록에 계속 쌓여 나중에 관리 화면이 지저분해지는
문제가 있어 **실제 DELETE로 변경**했다(관리자 화면 버튼 라벨도 "취소" → "삭제"로 변경).
`admin_audit_log.target_id`는 FK가 아닌 `text`라 행이 삭제돼도 감사 로그 자체는 남고,
`detail.email`로 어떤 이메일의 초대였는지는 계속 추적 가능하다 — "이력 보존"이 필요하면 감사
로그를 보면 된다는 판단. 이 변경 이전에 `status='revoked'`로 남아있는 과거 행은 자동으로
정리되지 않는다(필요하면 `delete from master_invitations where status = 'revoked';`로 일괄 정리 가능).

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
  유효 Pro 구독 있음     → Pro 유지 (위 §5의 2~8단계 전체 스킵, 로그아웃 없음)
  유료 구독 없음          → 위 §5의 2~8단계 전체 진행 (Guest 전환)
```

이 판정은 Master 해제 Edge Function 내부에서 원자적으로 수행하여, "일단 Guest 전환 절차부터 시작했다가 중간에 유효 구독을 발견해 되돌리는" 상황을 피한다.

### 5-2. Master 권한 해제 감사 로그

```sql
-- admin_audit_log (docs/ADMIN_DESIGN.md §4) 재사용
-- action='master_revoke', target_type='user', target_id=대상 user_id,
-- detail={ 'resulting_tier': 'guest'|'pro', 'had_active_subscription': bool }
```

---

## 6. Edge Function 목록 요약 ✅ 구현 완료(2026-07-18, 2026-09-12 자체 토큰 방식으로 재작성, `supabase/functions/master-*/`)

| 함수 | 설명 |
|---|---|
| `master-invite` | 이미 가입된 이메일인지 확인(`email_exists`) 후 자체 토큰 생성·해시 저장 + Resend API 직접 호출로 발송 |
| `master-invite-resend` | 토큰 재발급(기존 토큰 폐기) + 재발송 + `expires_at` 갱신 |
| `master-invite-revoke` | 초대 철회 |
| `master-accept` | 세션 없이 `?token=...` 자체 검증 → 통과 시 `auth.admin.createUser()`로 계정 생성 + special_access='master' 부여 |
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
