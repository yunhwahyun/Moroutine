# 관리자 설계 (Admin Design)

> 작성일: 2026-07-18
> 전제: `docs/PERMISSION_DESIGN.md`(role='admin' 판정), Master 초대·삭제 상세는 `docs/MASTER_INVITATION_DESIGN.md`.

---

## 1. 확정 정책

Admin은 **공용 학습 콘텐츠와 Master 회원만** 관리한다. 사용자 개인 데이터에는 어떤 형태로도 접근하지 않는다.

### 1-1. 가능

- 공용 단어장 목록 조회 / 생성 / 수정 / 공개·비공개·보관 전환
- 공용 단어 추가 / 수정 / 순서 변경 / 일괄 등록 / CSV 업로드
- 카테고리 관리 / 난이도 관리 / 공개 전 미리보기
- Master 이메일 초대 / 재발송 / 취소 / 목록 조회 / 권한 해제
- 권한 변경 감사 로그 조회

### 1-2. 금지

사용자 개인 단어장 / 개인 단어 / 학습 기록 / 복습 기록 / 정답·오답 기록 / 일정 / 알림 설정 / 앱 설정 / 스피킹 녹음 / 기타 개인 데이터 — 조회·수정·삭제 전부 금지. 관리자 대시보드에는 개인 데이터를 노출하지 않는다. 개인정보가 아닌 **집계 통계**(예: 전체 활성 사용자 수, 등급별 분포)는 별도 검토 항목(§6)으로 남긴다.

---

## 2. IA / 화면 목록 ✅ 구현 완료(2026-07-19)

```
/admin (Admin 전용, role='admin' 아니면 ProtectedRoute requireRole="admin"이 홈으로 리다이렉트)
├── /admin/wordbooks               — 공용 단어장 목록(draft/published/hidden/archived 필터)
├── /admin/wordbooks/:id           — 단어장 상세: 메타 수정 + 단어 목록/순서 관리
├── /admin/wordbooks/new           — 신규 단어장 생성
├── /admin/masters                 — Master 목록 + 초대 폼
└── /admin/audit-log               — 관리자 작업 감사 로그 조회(읽기 전용)
```

일반 사용자 라우트(`/wordbooks`, `/settings` 등)와 완전히 분리된 `AdminLayout`(`web/src/components/layout/AdminLayout.tsx`, 하단 탭 없음, 상단 탭 홈/공용 단어장/Master 관리/감사 로그 + "앱으로 돌아가기")을 사용한다. **편차**: `/admin/wordbooks/:id/words/new`(단어 추가 별도 라우트)와 `/admin/masters/invitations`(초대 상태 분리 목록)는 각각 상세 페이지 인라인 폼과 `AdminMastersPage` 단일 화면으로 통합해 별도 라우트를 만들지 않았다(Phase 19/17에서 이미 확정된 단순화). Admin이 일반 학습 기능에 접근할지는 §6 결정 필요 항목(미해결, `/admin` 홈은 학습 기능과 무관하게 관리 섹션 3개로만 구성).

---

## 3. 공용 단어장 데이터 모델 ✅ 관리자 CRUD + 사용자 열람/등록 구현 완료(2026-07-19)

**구현 편차**: `/admin/wordbooks/:id/words/new`(§2 IA의 별도 라우트)는 만들지 않고 개인
`WordbookDetailPage`와 동일하게 상세 페이지 내 인라인 폼으로 처리. `/public-wordbooks`도 "단어장 내 탭"
대신 별도 화면 + `WordbookListPage` 헤더의 링크로 단순화. 단어 순서 변경(드래그 앤 드롭) UI는 이번엔
만들지 않고 생성 순서(`sort_order` 순차 부여)만 지원 — 필요 시 후속 작업.

**학습하기/퀴즈 연동 ✅ 구현 완료(2026-07-19)**: `/public-wordbooks/:id`(`PublicWordbookViewPage`)에
"학습하기"/"퀴즈 풀기" 버튼 추가. `web/src/lib/publicWordbooks.ts`의 `toStudyWord()` 어댑터가
`PublicWord` + `user_public_word_progress`를 `Word` 형태로 변환해 기존 `LearnPage`/`Quiz.tsx`/
`buildQuizWords`/`applyQuestionOrder`를 전혀 수정하지 않고 그대로 재사용한다(`Quiz.tsx`는 애초에
`word.id`의 의미를 몰라도 되도록 완전히 범용적으로 짜여 있었음). `web/src/lib/wordStatus.ts`의 복습
상태 전이 계산을 `computeQuizAnswerUpdate()` 순수 함수로 추출해 개인(`applyQuizAnswer`)/공용
(`applyPublicQuizAnswer`) 양쪽이 공유. **스코프 컷**: 공용 단어장 학습/퀴즈는 개인 `study_sessions`/
`study_results`에는 기록하지 않음(FK가 개인 `words(id)`를 참조해 애초에 불가능, `user_public_word_progress`에만
저장 — 두 테이블이 분리된 설계 의도와 일치). HomePage/`WordbookListPage`의 "오늘의 복습" 가상 컬렉션에
공용 단어를 합치는 것과 여러 공용 단어장 동시 선택 학습은 범위 밖(`docs/DECISION_LOG.md` 2026-07-19).

- 구현: `web/src/lib/publicWordbooks.ts`(Admin/사용자 양쪽 함수, `DataRepository`와 무관한 독립
  모듈 — Guest는 애초에 접근 불가하고 Admin도 tier 시스템 밖이라 기존 Repository 확장 대신 직접
  Supabase 호출), `web/src/pages/admin/{AdminWordbookListPage,AdminWordbookFormPage,AdminWordbookDetailPage}.tsx`,
  `web/src/pages/public-wordbook/{PublicWordbookListPage,PublicWordbookViewPage}.tsx`

### 3-1. 정책

- Admin이 생성/수정, 사용자는 조회·학습만(제목/설명/단어 수정 불가, 원본 삭제 불가).
- 개인 단어장으로 자동 복제하지 않는다 — **원본 참조 방식**. 사용자별 학습 상태만 별도 저장.
- 공용 단어는 물리 삭제하지 않고 상태값(`archived`)으로 관리 — 관리자가 archived 처리해도 기존 사용자의 학습 기록은 유지.
- 관리자가 단어 내용을 수정하면 기존 사용자에게도 즉시 반영된다(참조 방식이므로 자동 충족).
- 공용 단어는 Pro 개인 단어 한도에 포함하지 않는다(`docs/SUBSCRIPTION_DESIGN.md` §1).

### 3-2. DDL

```sql
-- 마이그레이션 16(신규) — public_wordbooks / public_words
CREATE TABLE public_wordbooks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  description  text,
  category     text,
  difficulty   text NOT NULL DEFAULT 'beginner',
    -- 'beginner' | 'intermediate' | 'advanced'
  language     text NOT NULL DEFAULT 'en-US',
  status       text NOT NULL DEFAULT 'draft',
    -- 'draft' | 'published' | 'hidden' | 'archived'
  word_count   int NOT NULL DEFAULT 0,
  created_by   uuid NOT NULL REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_public_wordbooks_status ON public_wordbooks(status);

CREATE TABLE public_words (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wordbook_id     uuid NOT NULL REFERENCES public_wordbooks(id) ON DELETE CASCADE,
  term            text NOT NULL,
  definition      text NOT NULL,
  description     text,
  example         text,
  sort_order      int NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'active',
    -- 'active' | 'archived'  (물리 삭제 금지)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_public_words_wordbook ON public_words(wordbook_id, sort_order);
CREATE INDEX idx_public_words_status ON public_words(wordbook_id, status);

-- word_count 트리거(기존 sync_word_count와 동일 패턴, 공용 전용으로 별도 함수)
CREATE OR REPLACE FUNCTION sync_public_word_count()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public_wordbooks SET word_count = word_count + 1 WHERE id = NEW.wordbook_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public_wordbooks SET word_count = word_count - 1 WHERE id = OLD.wordbook_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
CREATE TRIGGER trg_public_word_count
  AFTER INSERT OR DELETE ON public_words
  FOR EACH ROW EXECUTE PROCEDURE sync_public_word_count();
```

### 3-3. 사용자 학습 상태 테이블

```sql
-- 마이그레이션 17(신규) — user_public_wordbook_enrollments / user_public_word_progress
CREATE TABLE user_public_wordbook_enrollments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wordbook_id  uuid NOT NULL REFERENCES public_wordbooks(id) ON DELETE CASCADE,
  enrolled_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_enrollments_unique ON user_public_wordbook_enrollments(user_id, wordbook_id);

CREATE TABLE user_public_word_progress (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  public_word_id  uuid NOT NULL REFERENCES public_words(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'unseen',
  review_step     int  NOT NULL DEFAULT 0,
  first_passed_at timestamptz,
  next_review_at  timestamptz,
  wrong_count     int  NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_public_word_progress_unique ON user_public_word_progress(user_id, public_word_id);
CREATE INDEX idx_public_word_progress_review ON user_public_word_progress(user_id, next_review_at) WHERE status = 'reviewing';
```

- `public_words`가 `archived`로 바뀌어도 `user_public_word_progress` 행은 FK `ON DELETE CASCADE`가 아니라 **참조만 유지**(단어 자체를 물리 삭제하지 않으므로 CASCADE가 실제로 발동할 일은 없음 — 관리자가 실수로도 물리 DELETE를 못 하도록 애플리케이션 레이어에서도 UPDATE만 노출).

### 3-4. RLS

```sql
ALTER TABLE public_wordbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_public_wordbook_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_public_word_progress ENABLE ROW LEVEL SECURITY;

-- 조회: Pro/Premium/Master만 published 열람, Admin은 전체(draft 포함, 미리보기용) 열람
CREATE POLICY "public_wordbooks_select" ON public_wordbooks
  FOR SELECT TO authenticated USING (
    status = 'published' AND get_service_tier(auth.uid()) IN ('pro', 'premium', 'master')
    OR is_admin(auth.uid())
  );
CREATE POLICY "public_wordbooks_admin_write" ON public_wordbooks
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "public_words_select" ON public_words
  FOR SELECT TO authenticated USING (
    (status = 'active' AND EXISTS (
       SELECT 1 FROM public_wordbooks pw
       WHERE pw.id = public_words.wordbook_id AND pw.status = 'published'
     ) AND get_service_tier(auth.uid()) IN ('pro', 'premium', 'master'))
    OR is_admin(auth.uid())
  );
CREATE POLICY "public_words_admin_write" ON public_words
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- 등록/진행: 본인 것만, Pro/Premium/Master만 (Guest는 애초에 authenticated가 아니므로 자동 차단)
CREATE POLICY "enrollments_all" ON user_public_wordbook_enrollments
  FOR ALL TO authenticated
  USING (auth.uid() = user_id AND get_service_tier(auth.uid()) IN ('pro', 'premium', 'master'))
  WITH CHECK (auth.uid() = user_id AND get_service_tier(auth.uid()) IN ('pro', 'premium', 'master'));

CREATE POLICY "public_word_progress_all" ON user_public_word_progress
  FOR ALL TO authenticated
  USING (auth.uid() = user_id AND get_service_tier(auth.uid()) IN ('pro', 'premium', 'master'))
  WITH CHECK (auth.uid() = user_id AND get_service_tier(auth.uid()) IN ('pro', 'premium', 'master'));
```

Admin은 개인 데이터 테이블(`wordbooks`/`words`/`study_sessions`/`schedules`/`notifications`/`user_public_word_progress` 등)에 대해 **어떤 정책도 추가하지 않는다** — `is_admin()`을 개인 데이터 RLS에 절대 포함시키지 않는 것이 "Admin도 사용자 개인 데이터 접근 불가" 요구사항의 실제 구현이다.

---

## 4. 감사 로그

Master 초대/해제(`docs/MASTER_INVITATION_DESIGN.md`)와 공용 콘텐츠 변경을 함께 기록하는 공용 테이블.

```sql
CREATE TABLE admin_audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     uuid NOT NULL REFERENCES auth.users(id),
  action       text NOT NULL,
    -- 'public_wordbook_create' | 'public_wordbook_publish' | 'public_word_bulk_import'
    -- | 'master_invite' | 'master_invite_revoke' | 'master_revoke' | 'role_change' | ...
  target_type  text,     -- 'public_wordbook' | 'public_word' | 'user' | 'master_invitation'
  target_id    text,
  detail       jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_audit_log_actor ON admin_audit_log(actor_id, created_at DESC);
CREATE INDEX idx_admin_audit_log_action ON admin_audit_log(action, created_at DESC);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_audit_log_select" ON admin_audit_log
  FOR SELECT TO authenticated USING (is_admin(auth.uid()));
-- INSERT는 서버(RPC/Edge Function, SECURITY DEFINER)에서만 수행 — authenticated INSERT 정책 없음
```

공용 콘텐츠 CRUD는 클라이언트에서 `is_admin()` RLS로 직접 허용되므로, 감사 로그 기록은 각 쓰기 작업을 감싸는 트리거 또는 클라이언트가 명시적으로 `log_admin_action()` RPC를 호출하는 방식 중 하나를 택한다 — **트리거 방식을 권장**(클라이언트가 로그 기록을 누락할 수 없도록 강제).

✅ **구현 완료(2026-07-19)**: 마이그레이션 30(`log_public_wordbook_action()`/`log_public_word_action()`
트리거, `public_wordbooks`/`public_words` 각각의 AFTER INSERT/UPDATE)으로 트리거 방식을 그대로 채택.
일괄 등록(bulk import)은 원안의 단일 `public_word_bulk_import` 액션 대신 행마다 `public_word_create`가
개별 기록된다 — 감사 추적 정확도 측면에서는 더 상세하므로 별도 RPC로 묶지 않고 이 형태를 유지.

**조회 화면 ✅ 구현 완료(2026-07-19)**: `AdminAuditLogPage`(`/admin/audit-log`)가 `admin_audit_log`를
`created_at desc`로 최신 200건 직접 SELECT(RLS가 이미 admin에게 허용, 별도 RPC 불필요)해 시간/액션/
대상/`actor_id`/`detail`을 표시. `actor_id`를 이메일로 조인하는 RPC는 만들지 않고 UUID를 그대로
보여준다(NULL이면 "시스템 자동 실행" — `retention-cleanup` 등 Scheduled Function이 남긴 기록).
이메일 표시가 필요해지면 `list_masters()`(마이그레이션 28)와 같은 패턴의 조인 RPC를 후속 추가하면 된다.

---

## 5. 관리자 대시보드 집계 통계 (검토 항목)

개인 식별 정보를 포함하지 않는 집계만 검토 대상:

```text
- 등급별 사용자 수 (Guest 추정치는 서버에 데이터가 없어 정확 집계 불가 — Remote 등록 계정만 집계 가능)
- 공용 단어장별 등록(enrollment) 수
- 신규 가입 추이
```

개별 사용자를 특정할 수 있는 어떤 통계도(예: "특정 사용자의 학습 진행률") 포함하지 않는다.

---

## 6. 결정 필요 항목

| 항목 | 비고 |
|---|---|
| Admin의 일반 학습 기능(단어장/퀴즈 등) 사용 여부 | 허용 시 Admin도 개인 `wordbooks`/`words` 행을 가져야 하므로, `RemoteDataRepository`를 Admin에게도 열어줄지 결정 필요(`docs/PERMISSION_DESIGN.md` §8과 동일 항목) |
| 집계 통계 제공 범위 | §5 참고, 운영 필요성에 따라 확정 |

---

## 7. 테스트 시나리오 요약

관리자 로그인 / 공용 단어장 등록 / 공용 단어 일괄 등록 / 일반 사용자의 수정 요청 차단(RLS 거부 확인) / 사용자 개인 데이터 접근 차단(Admin 세션으로 타인 `words` SELECT 시 0건 반환 확인) / Master 초대 / Master 삭제 / 감사 로그 확인. 상세는 `docs/PROJECT_STATUS.md`·`docs/TODO.md`의 테스트 체크리스트에 통합.

### 7-1. 개인 데이터 미노출 검증 ✅ 코드 리뷰 완료(2026-07-19)

`web/src/pages/admin/`, `web/src/lib/publicWordbooks.ts`, `supabase/functions/master-*` 전체를
`words`/`wordbooks`/`study_sessions`/`study_results`/`schedules`/`notifications`(개인 데이터 테이블)
참조로 grep — **0건 확인**. 관리자 관련 코드는 `public_wordbooks`/`public_words`/
`user_public_wordbook_enrollments`(자기 자신 것만, 사용자 화면)/`master_invitations`/
`admin_audit_log`/`profiles`(role/special_access 컬럼만)/`subscriptions`(구독 여부 확인용)만
다룬다. **체크리스트**: 향후 관리자 화면/Edge Function에 코드를 추가할 때, 위 개인 데이터 테이블을
참조하는 코드가 없는지 이 방식으로 다시 확인할 것.
