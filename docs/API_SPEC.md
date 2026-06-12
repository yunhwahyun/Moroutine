# API Spec

> Edge Function은 미구현 확정. 아래 스펙은 향후 서버 이전 시 참고용.
> 현재 클라이언트 직접 처리 방식은 하단 "Supabase Client 직접 처리" 섹션 참고.

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
