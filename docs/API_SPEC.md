# API Spec

> quiz/start, quiz/answer Edge Function은 여전히 미구현 확정(클라이언트 직접 처리 유지, `docs/DECISION_LOG.md` 2026-06-11 항목).
> 단, **2026-07-18 정책 개편으로 구독/Master/보관 관련 Edge Function은 신규로 실제 구현 대상**이 되었다(§2 이하). service_role 키를 다루는 로직이 처음 등장하므로 `docs/DEVELOPMENT_RULES.md` 보안 규칙을 반드시 준수한다.

---

## SelectionTarget 타입

```typescript
// DB에 존재하지 않음 — 화면 레벨에서만 사용
type SelectionTarget =
  | { type: 'review' }                  // 복습 단어: status='reviewing' & next_review_at <= today
  | { type: 'wordbook'; id: string }    // 단어장: status IN ('unseen', 'learning')
  | { type: 'word'; id: string }        // 특정 단어 (홈 학습영역 2장 진입)
```

---

## Supabase Client 직접 처리 (현재 구현)

```typescript
// schedules — 날짜 범위 조회
supabase.from('schedules').select('*').eq('user_id', userId)
  .gte('starts_at', startOfDay(startDate).toISOString())
  .lte('starts_at', endOfDay(endDate).toISOString())
  .order('starts_at')

// wordbooks
supabase.from('wordbooks').select('*').order('created_at', { ascending: false })
supabase.from('wordbooks').insert({ name, description, language })
supabase.from('wordbooks').update({ name, description }).eq('id', id)
supabase.from('wordbooks').delete().eq('id', id)

// words
supabase.from('words').select('*').eq('wordbook_id', wordbookId).order('created_at')
supabase.from('words').insert({ wordbook_id, term, definition, description, example, memo })
supabase.from('words').update({ term, definition, description, example, memo }).eq('id', id)
supabase.from('words').delete().eq('id', id)

// 홈 복습 단어 1개
supabase.from('words').select('id, term, definition, description')
  .eq('user_id', userId).eq('status', 'reviewing')
  .lte('next_review_at', endOfDay(new Date()).toISOString()).limit(1).single()

// 홈 신규 단어 1개
supabase.from('words').select('id, term, definition, description')
  .eq('user_id', userId).eq('status', 'unseen').limit(1).single()

// notifications
supabase.from('notifications').insert({ schedule_id, fire_at, native_id: null })
supabase.from('notifications').update({ native_id }).eq('id', notificationId)
supabase.from('notifications').update({ is_cancelled: true }).eq('schedule_id', scheduleId)
```

---

## Edge Function 스펙 (미구현 — 참고용)

### 공통 유틸 (`_shared/auth.ts`)

```typescript
export async function requireUser(supabase, req): Promise<{ userId: string }>
export class AuthError extends Error { readonly status = 401 }
export class ForbiddenError extends Error { readonly status = 403 }
export class ValidationError extends Error { readonly status = 400 }
```

---

### POST /functions/v1/quiz/start

**요청**
```typescript
{ targets: SelectionTarget[] }
```

**처리 로직**
1. JWT → userId 추출
2. `targets.length === 0` → 400
3. targets별 단어 조회 + 중복 제거
4. session_type 서버 결정:
   ```typescript
   targets.length === 1 && targets[0].type === 'review' ? 'review_quiz' : 'quiz'
   ```
5. 전체 ≥ 4 → `multiple_choice`, 미만 → `short_answer`
6. `study_sessions` INSERT
7. 단어 셔플 후 응답

**응답**
```typescript
{
  session_id: string
  quiz_mode: 'multiple_choice' | 'short_answer'
  words: Array<{
    id: string
    term: string
    definition: string
    description: string | null
    distractors: Array<{ id: string; definition: string }>
  }>
}
```

---

### POST /functions/v1/quiz/answer

**요청**
```typescript
{
  session_id: string
  word_id: string
  is_correct: boolean
  had_wrong_in_session: boolean
  is_last_word?: boolean
}
```

**처리 로직**
- 오답 → `wrong_count +1`, `{ requeue: true }`
- 정답 + `had_wrong_in_session = false` → 상태 전이
- 정답 + `had_wrong_in_session = true` → 상태 유지, `next_review_at = 내일`

**응답**
```typescript
{
  requeue: boolean
  word_status: {
    status: string
    review_step: number
    next_review_at: string | null
  }
}
```

**세션 완료**: 클라이언트가 큐 소진 후 직접 UPDATE

```typescript
supabase.from('study_sessions')
  .update({ completed_at: new Date().toISOString(), correct_count, wrong_count })
  .eq('id', sessionId)
```

---

## 신규 Edge Function / RPC 스펙 (2026-07-18 정책 개편)

> 아래는 모두 실제 구현 대상. RPC는 Postgres 함수(`SECURITY DEFINER`, PostgREST `rpc/` 경유), Edge Function은 Deno 런타임 + service_role.

### RPC `create_words_checked` (Pro 한도 원자적 검증)

DDL·로직 전문은 `docs/SUBSCRIPTION_DESIGN.md` §4-2.

```typescript
const { data, error } = await supabase.rpc('create_words_checked', {
  p_wordbook_id: wordbookId,
  p_words: [{ term, definition, description, example, memo }, ...],
})
// data: { inserted_count, current_total, limit_value, blocked }[]
```

호출 위치: 단건 등록 / 일괄 등록 / CSV 등록 / 공용 단어 개인 복사 — Pro/Premium/Master 전 경로 공통(Guest는 LocalDataRepository가 처리하므로 호출하지 않음).

### RPC `migrate_guest_words` (Guest→Remote 이전 전용, 한도 미검증)

```typescript
const { data, error } = await supabase.rpc('migrate_guest_words', {
  p_migration_id: migrationId,
  p_wordbook_id: serverWordbookId,
  p_words: [{ local_id, term, definition, description, example, memo, status, review_step, first_passed_at, next_review_at, wrong_count }, ...],
})
// data: { migrated_count, id_map: { local_id: server_id }[] }
```

`docs/MIGRATION_DESIGN.md` §3-3 — 한도를 무시하고 전량 삽입, Idempotency Key(`migration_id` + `local_id`)로 재실행 안전성 보장.

### POST /functions/v1/revenuecat-webhook ✅ 구현 완료(`supabase/functions/revenuecat-webhook/index.ts`, 2026-07-18)

RevenueCat 결제 이벤트 수신. 스펙 전문 `docs/SUBSCRIPTION_DESIGN.md` §3-1.

```
Headers: Authorization: Bearer {RevenueCat Webhook Auth Token}
Body: RevenueCat Webhook 표준 payload (event.type, event.app_user_id, event.id, ...)
Response: 200 (idempotent — 중복 event.id는 no-op 후에도 200)
```

실계정 준비 전 스캐폴딩 단계 — `ENTITLEMENT_TO_PLAN` 매핑(entitlement_id → `pro`/`premium`)은 실제 RevenueCat
대시보드에서 Entitlement/Product ID를 확정한 뒤 코드와 대조 필요. `REVENUECAT_WEBHOOK_TOKEN`/
`SUPABASE_SERVICE_ROLE_KEY`는 `supabase secrets set`으로 등록해야 한다.

### POST /functions/v1/master-invite / master-invite-resend / master-invite-revoke / master-accept / master-revoke ✅ 구현 완료(`supabase/functions/master-*/`, 2026-07-18)

스펙 전문 `docs/MASTER_INVITATION_DESIGN.md` §4, §6. 자체 토큰 대신 Supabase 세션 인증으로 단순화한
편차는 §2 상단 참고.

```typescript
// master-invite (Authorization: 관리자 세션 JWT)
{ email: string } → { invitation_id: string, status: 'sent' }

// master-invite-resend / master-invite-revoke (Authorization: 관리자 세션 JWT)
{ invitation_id: string } → { status: string }

// master-accept (Authorization: 초대/매직 링크로 확립된 사용자 세션 JWT, body 없음)
→ { success: true }

// master-revoke (Authorization: 관리자 세션 JWT)
{ userId: string } → { success: true, resultingTier: 'guest' | 'pro' | 'premium' }
```

`master-invite`/`-resend`/`-revoke`/`master-revoke`는 `Authorization` 헤더의 세션으로 호출자를 식별한 뒤
`profiles.role === 'admin'`을 확인(`supabase/functions/_shared/auth.ts`의 `requireAdmin`). `master-accept`는
Admin 검증 없이 호출자의 이메일이 `master_invitations`의 활성 초대와 일치하는지만 확인한다. 5개 함수 모두
CORS 처리 필요(브라우저가 직접 호출) — `supabase/functions/_shared/cors.ts` 공용.

### POST /functions/v1/retention-cleanup (Scheduled, service_role) ✅ 구현 완료(`supabase/functions/retention-cleanup/index.ts`, 2026-07-18)

스펙 전문 `docs/DATA_RETENTION_DESIGN.md` §4-2. pg_cron이 매일 호출, 사용자 요청 경로 아님(`Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY}`로 인증). `retention_schedules WHERE status='active' AND retention_expires_at < now()`를 조회해 사용자별 부모 테이블(`wordbooks`/`schedules`/`study_sessions`/`user_public_wordbook_enrollments`/`user_public_word_progress`/`speaking_sentences`)만 삭제(자식 테이블은 기존 FK CASCADE로 자동 삭제) → `admin_audit_log` 기록(`actor_id: null`). Storage 삭제는 Phase 23(스피킹) 미착수라 이번엔 생략. 실제 pg_cron 등록은 사용자가 Dashboard에서 진행.

### POST /functions/v1/retention-notify ❌ 이번 범위에서 구현 안 함(2026-07-18)

`docs/DATA_RETENTION_DESIGN.md` §6-2 원안은 이 Edge Function이 삭제 예정 이메일을 발송하는 것이었으나, Supabase Auth 기본 메일 템플릿이 임의 내용의 알림에 맞지 않아 채택하지 않음(`docs/DECISION_LOG.md` 2026-07-18). 대신 클라이언트가 `retention_schedules`를 직접 조회하는 `RetentionBanner`(`web/src/components/retention/RetentionBanner.tsx`)로 대체 — 별도 Edge Function/스케줄 불필요.

### 데이터 내보내기/가져오기 (클라이언트 로컬 처리, Edge Function 아님)

Guest는 LocalDataRepository에서, Pro/Premium/Master는 RemoteDataRepository에서 조회한 데이터를 클라이언트에서 JSON으로 직렬화(`docs/DATA_STORAGE_DESIGN.md` §13). 서버 라운드트립이 필요 없으므로 별도 Edge Function을 두지 않는다 — 단, Remote의 경우 대량 조회 시 페이지네이션은 기존 PostgREST range 헤더로 처리.
