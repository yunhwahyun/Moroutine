# Decision Log

> 설계 결정 이력. 이유 없이 변경하지 말 것.

---

## 2026-07-19

### Phase 16 후속 — 회원가입 직후 `/pricing` 강제 라우팅: localStorage 플래그 + DowngradeGate 우선순위 분리

- **결정**: 회원가입 직후를 감지하는 방법으로 "구독 이력이 전혀 없는 사용자 판정"(DB 쿼리 기반, Master 해제자도 함께 포섭) 대신 `LoginPage.tsx`의 `signUp()` 호출 시점에 로컬 스토리지 플래그를 남기는 방식(`web/src/lib/signupFlow.ts`)을 채택. 신규 `SignupPricingGate`가 이 플래그를 보고 `/pricing`으로 강제 이동시키고, 기존 `DowngradeGate`(만료/Master 해제/미결제 가입을 한 트리거로 묶어 처리하던 컴포넌트)는 플래그가 켜진 동안만 자기 자신을 비활성화(`!isSignupPending()`)하도록 조건 하나만 추가.
- **이유**: "구독 이력 없음" 쿼리 기반으로 판정하면 Master 해제자도 동일하게 `/pricing`으로 새로 보내게 되어 `docs/DECISION_LOG.md` 2026-07-18에서 이미 확정한 "만료/Master 해제/미결제 가입은 전부 동일한 downgrade_pending 절차로 흡수" 원칙을 건드리게 된다. 이번 요청은 "회원가입 직후"라는 좁은 시점에 한정된 것이므로, 기존에 이미 검증·배포된 `DowngradeGate`/`useSubscriptionDowngrade`/`remoteToLocalMigration` 인프라를 그대로 재사용하면서 신규 가입 시점에만 우선순위를 끼워 넣는 쪽이 변경 범위와 회귀 위험이 작다고 판단. localStorage를 쓴 이유는 이메일 인증 링크가 가입한 탭이 아닌 새 브라우저 컨텍스트(모바일 메일 앱 등)에서 열려도 같은 기기·브라우저 프로필이면 플래그가 유지되기 때문(sessionStorage는 새 탭에서 유실됨).
- **동반 결정**: `/pricing`에 "무료로 계속 사용하기" 버튼을 추가해 강제 라우팅에 탈출구를 제공. `DowngradeModal`과 동일하게 실패 시에는 플래그를 지우지 않고 재시도만 허용(성공해야만 `clearSignupPending()` 호출) — 두 게이트가 동시에 뜨는 경합을 피하기 위함.
- **한계 인지**: 이 플래그는 "같은 기기·브라우저"를 벗어나면(예: PC에서 가입 후 다른 기기에서 이메일 인증) 사라진다. 이 경우 사용자는 기존과 동일하게 `DowngradeGate`의 "유효한 구독이 없습니다" 모달로 흡수되므로 회귀는 아니지만, `/pricing` 강제 이동은 놓친다. 실제 신규 가입 계정으로 전체 플로우를 검증하지 못했음(Supabase에 실사용자를 만드는 부작용 때문에 이번 세션에서 시도하지 않음) — 배포 후 사후 검증 권장.
- **영향 범위**: `web/src/lib/signupFlow.ts`(신규), `web/src/components/onboarding/SignupPricingGate.tsx`(신규), `web/src/pages/auth/LoginPage.tsx`, `web/src/components/migration/DowngradeGate.tsx`, `web/src/pages/pricing/PricingPage.tsx`, `web/src/App.tsx`, `docs/UI_FLOW.md`, `docs/TODO.md` Phase 16.

---

## 2026-07-18

### 무료·유료·관리자 정책 전면 개편 — Guest/Pro/Premium/Master/Admin 5종 모델 도입

- **결정**: 기존 `plan_type: beta|free|premium` 단일 컬럼 기반 설계(문서 계획 단계, 미구현)를 폐기하고, 인증상태(anonymous/authenticated) / 계정역할(user/admin) / 서비스권한(guest/pro/premium/master) 3축 분리 모델로 전환. Guest는 회원가입 없이 로컬(IndexedDB) 저장, Pro/Premium/Master는 로그인 후 Supabase 저장. Pro는 개인 단어 총등록 수 제한, Premium/Master는 무제한. Admin은 공용 단어장과 Master 계정만 관리하고 사용자 개인 데이터에는 접근하지 않음.
- **이유**: 사업 방향이 "기능 On/Off 기반 과금"에서 "저장 위치·용량 기반 과금"으로 변경됨. 또한 회원가입 장벽 없이 앱을 체험할 수 있는 Guest 티어가 신규 요구됨.
- **영향 범위**: `docs/PERMISSION_DESIGN.md`, `docs/SUBSCRIPTION_DESIGN.md`, `docs/DATA_STORAGE_DESIGN.md`, `docs/MIGRATION_DESIGN.md`, `docs/ADMIN_DESIGN.md`, `docs/MASTER_INVITATION_DESIGN.md`, `docs/DATA_RETENTION_DESIGN.md`, `docs/SPEAKING_DESIGN.md`, `docs/DB_SCHEMA.md`, `docs/API_SPEC.md`, `docs/UI_FLOW.md`, `docs/DESIGN.md` 전체 갱신.
- **구현 착수 전 상태 확인**: 조사 결과 구 계획(마이그레이션 13~17: `profiles_plan`/`speaking_tasks`/`speaking_sessions`/`speaking_recordings`/`pronunciation_evaluations`, `planStore.ts`, Azure 연동, RevenueCat, 관리자 기능)은 **실제 코드/마이그레이션 파일로 구현된 적이 없고 문서 계획 단계에서만 존재**했음이 확인됨. 따라서 이번 개편은 기존 구현을 되돌리는 작업이 아니라 미착수 설계를 교체하는 작업이며, 실제 삭제해야 하는 프로덕션 코드/데이터는 없음.
- **유의**: Pro 개인 단어 한도, Grace Period 기간, 삭제 전 추가 알림 시점, Master 초대 링크 유효기간, 녹음 파일 보관기간, 데이터 내보내기 제공 범위, Admin의 일반 학습 기능 사용 여부는 의도적으로 미확정 상태로 남김(각 문서의 "결정 필요" 항목 참고). 임의로 값을 확정하지 말 것.

### AI 발음 평가 서비스(Azure Pronunciation Assessment) 폐지

- **결정**: 발음/억양/속도/유창성/종합 점수, AI 피드백, 평가 결과 저장, 성장 그래프 등 평가 관련 기능 전체를 서비스 범위에서 제거. 스피킹 기능은 문장 등록/TTS 듣기/녹음/재생/재녹음으로 축소.
- **이유**: 위 정책 개편과 함께 결정된 사업 범위 축소.
- **적용**: `docs/SPEAKING_DESIGN.md` 전면 재작성. `pronunciation_evaluations`/`speaking_tasks`/`speaking_sessions`(구 버전) 테이블 계획 폐기, `speaking_sentences`(개인 데이터)/`speaking_recordings`(평가 없는 단순 버전)로 대체.
- **유의**: 이 기능도 미구현 상태였으므로 실제 코드 삭제 작업은 없음.

### Phase 16 구독/결제 — Grace Period 16일 / billing_retry 최대 30일 확정, §7 복원 병합은 이월

- **결정**: `docs/SUBSCRIPTION_DESIGN.md` §2/§10에 "결정 필요"로 남아 있던 두 값을 확정. Grace Period = 16일(Google Play 기본값 — iOS는 App Store가 자체적으로 최대 60일까지 재시도하므로 서버 값은 상한선 역할만 함), billing_retry 최대 기간 = 30일(스토어 표준 재시도 주기).
- **이유**: RevenueCat 실계정이 아직 없어 실측값을 확인할 수 없는 상태에서 Phase 16 구현(Edge Function/마이그레이션 27)을 진행해야 했음. 두 값 모두 스토어 정책상 널리 쓰이는 기본값이라 채택, 실계정 연동 후 재검토 가능하도록 코드에는 상수로만 반영(DB 하드코딩 최소화).
- **적용**: `supabase/migrations/27_subscription_retry_and_realtime.sql`(billing_retry_started_at 컬럼), `supabase/functions/revenuecat-webhook/index.ts`(GRACE_PERIOD_DAYS=16 fallback 상수).
- **추가 결정**: §7(3개월 이내 Pro/Premium 복원 시 병합) 구현은 이번 세션 범위에서 제외하고 다음 세션으로 이월. 중복 판정 UI와 기기 선택 UX가 설계 문서 자체에 "결정 필요/MVP 범위 아님"으로 남아 있어, Edge Function/다운그레이드 엔진 스캐폴딩과는 별도의 UX 설계 작업이 먼저 필요하다고 판단.
- **영향 범위**: `docs/SUBSCRIPTION_DESIGN.md`(§2, §7, §10), `docs/TODO.md`(Phase 16).

### Phase 17 Master 초대/해제 — 초대 검증 방식을 Supabase 세션 인증으로 단순화, 트리거 버그 수정

- **결정**: `docs/MASTER_INVITATION_DESIGN.md`에 적힌 "자체 crypto 토큰 생성 → SHA-256 해시 저장 → 토큰 직접 검증" 방식을 폐기하고, Supabase Auth의 `inviteUserByEmail`(신규 이메일)/`signInWithOtp`(이미 가입된 이메일, 자동 폴백)이 만드는 세션 인증만으로 초대 수락을 검증하도록 단순화. `master_invitations.token_hash` 컬럼은 NOT NULL 제약을 제거하고 더 이상 채우지 않음(마이그레이션 28).
- **이유**: 사용자가 "Supabase Auth 기본 메일 함수 사용"을 선택했는데, 실제 확인 결과 `inviteUserByEmail`은 이미 가입된 이메일에는 에러를 던져 사용할 수 없고, 초대/매직 링크 모두 Supabase 자체 토큰으로 세션을 만드는 방식이라 문서의 커스텀 토큰 스킴과 근본적으로 맞지 않았음. 세션 인증만으로도 문서의 보안 요구사항(1회성, 만료, 소유 증명)을 동일하게 충족.
- **초대 링크 유효기간 7일, 별도 이메일 인증 메일 불필요**도 함께 확정(`docs/MASTER_INVITATION_DESIGN.md` §7).
- **부수 발견 및 수정**: 마이그레이션 13의 `prevent_self_privilege_escalation` 트리거가 service_role Edge Function의 정당한 `profiles.special_access`/`role` 갱신까지 되돌리는 버그를 발견. service_role 연결은 `auth.uid()`가 NULL이라(서비스 롤 JWT에 `sub` 클레임 없음) `is_admin(NULL)`이 항상 false가 되어 트리거가 매번 값을 되돌렸음 — RLS는 service_role이 우회하지만 트리거는 우회하지 않기 때문. 마이그레이션 28에서 `OR auth.role() = 'service_role'` 조건을 추가해 수정. Phase 20(관리자 역할 변경 화면)에도 동일하게 필요한 선행 수정이라 미리 반영.
- **영향 범위**: `docs/MASTER_INVITATION_DESIGN.md`(§2~§4, §6, §7), `supabase/migrations/28_master_admin_fixes.sql`.

### Phase 18 데이터 보관/삭제 — 삭제 예정 알림을 이메일 대신 앱 내 배너로, 3가지 결정 확정

- **결정**: `docs/DATA_RETENTION_DESIGN.md`가 계획한 `retention-notify`(이메일 발송) Edge Function을 만들지 않고, 클라이언트가 `retention_schedules`를 직접 읽어 표시하는 `RetentionBanner`(앱 내 배너)로 대체.
- **이유**: Supabase Auth의 4개 기본 메일 템플릿(초대/매직링크/비밀번호재설정/가입확인)이 전부 특정 인증 액션에 묶여 있어 "구독이 곧 만료됩니다" 같은 임의 내용의 알림을 보낼 수 없음을 확인. Master 초대 이메일(세션 인증으로 대체 가능했던 케이스)과 달리 이번엔 인증 액션 자체가 없는 순수 정보성 알림이라 같은 우회가 불가능했음. 외부 이메일 서비스 신규 도입 대신 이미 계획돼 있던 "앱 내 알림" 대안(§6-3)을 채택.
- **추가 확정**: `admin_audit_log.actor_id`는 시스템 계정을 새로 만들지 않고 nullable로 완화(마이그레이션 29) — `retention-cleanup`처럼 사람이 아닌 Scheduled Function이 실행하는 작업의 감사 로그를 위함. 삭제 전 알림은 7일 전 1회만(다단계 아님). Push Notification 서버 발신은 이번 범위에서 도입하지 않음(이메일/앱 내 배너로 충분, 추가 인프라 필요성 낮음).
- **영향 범위**: `docs/DATA_RETENTION_DESIGN.md`(§4-2, §6-1~§6-3, §7), `supabase/migrations/29_retention_cleanup_support.sql`.

### Phase 19(1부) 공용 단어장 — 학습/퀴즈 연동 이월, IA 일부 단순화

- **결정**: `docs/ADMIN_DESIGN.md` §3의 세 부분(관리자 CRUD / 사용자 열람·등록 / 학습하기·퀴즈 연동) 중 이번 세션은 앞 두 개만 구현하고, 학습하기/퀴즈 연동은 다음 세션으로 이월.
- **이유**: 학습/퀴즈 연동은 개인 `words` 테이블과 공용 `public_words` 테이블의 스키마가 달라 `LearnPage`/`QuizPage` 내부 로직을 개인/공용 모드로 분기해야 함 — 기존 학습 플로우(복습 사이클, `wrong_count` 등)를 건드리는 위험이 있어 별도 세션에서 신중하게 진행하기로 사용자와 합의.
- **추가 편차**: `/admin/wordbooks/:id/words/new`(별도 라우트)와 "공용 단어장 = 단어장 화면 내 탭" IA는 만들지 않고, 개인 `WordbookDetailPage`와 동일한 인라인 폼 + 별도 화면(`/public-wordbooks`) + 링크로 단순화. 단어 순서 변경 UI(드래그 앤 드롭)도 이번엔 생략(생성 순서만 지원).
- **영향 범위**: `docs/ADMIN_DESIGN.md`(§3, §4), `docs/TODO.md`(Phase 19).

### Phase 19(2부) 학습하기/퀴즈 공용 단어장 연동 — 개인 학습 이력 미기록, 복습 병합은 범위 밖

- **결정**: 공용 단어장 학습/퀴즈는 진행 상태(`user_public_word_progress`)만 저장하고, 개인 `study_sessions`/`study_results`에는 기록하지 않는다. HomePage/`WordbookListPage`의 "오늘의 복습" 가상 컬렉션에 공용 단어를 합치는 것, 여러 공용 단어장 동시 선택 학습은 이번에 구현하지 않는다.
- **이유**: `study_results.word_id`는 개인 `words(id)`를 참조하는 FK라 공용 단어 id로는 애초에 기록이 불가능함 — 두 진행 상태 테이블이 원래 분리 설계된 이유와 일치. 복습 병합은 개인 복습 큐와 공용 진행 상태를 하나의 UI로 합치는 별도 설계가 필요해 범위를 좁힘.
- **재사용 확인**: `Quiz.tsx`(퀴즈 엔진)는 `word.id`의 의미를 몰라도 되도록 이미 완전히 범용적으로 짜여 있었고, `LearnPage.tsx`도 단어별 상태를 쓰지 않고 카드만 보여주는 화면이라 별도 수정 없이 재사용 가능했다 — `wordStatus.ts`의 상태 전이 계산만 `computeQuizAnswerUpdate()` 순수 함수로 추출해 개인/공용 양쪽이 공유하도록 리팩터링.
- **영향 범위**: `docs/ADMIN_DESIGN.md` §3, `web/src/lib/wordStatus.ts`, `web/src/lib/publicWordbooks.ts`, `web/src/pages/{quiz/QuizPage,learn/LearnPage,public-wordbook/PublicWordbookViewPage}.tsx`.

### Phase 21 설정/요금제 화면 — Guest RLS 확장, 가격 플레이스홀더, 구독 관리 단순화

- **결정 1**: `subscription_plans`의 RLS SELECT 정책을 `TO authenticated`에서 `TO anon, authenticated`로 확장(마이그레이션 31).
- **이유**: `/pricing`은 Guest(비로그인)에게 가입을 유도하는 화면인데, 기존 정책이 `authenticated`만 허용해 Guest는 요금제 비교표 자체를 볼 수 없었다. `subscription_plans`는 가격이 아니라 한도/기능 플래그만 담고 있어 익명 공개에 문제가 없다고 판단.
- **결정 2**: 요금제 비교표의 "가격" 항목은 플레이스홀더 텍스트(예: "월 ₩4,900 (예시 — 실제 스토어 가격 확정 전)")로 표시.
- **이유**: `subscription_plans` 테이블에 애초에 가격 컬럼이 없고(한도/기능만 관리, 실제 가격은 App Store/Play Store 소관), RevenueCat 실계정/상품도 아직 없어 동적으로 가져올 방법이 없음. 실제 상품 확정 후 상수만 교체하면 되도록 코드에 주석으로 명시.
- **결정 3**: "구독 관리" 버튼은 새 브리지 메시지를 추가하지 않고, 웹에서는 `window.open`으로 스토어 구독 관리 URL을 열고 네이티브(WebView)에서는 안내 문구만 표시.
- **이유**: 실제 스토어 구독 관리 화면 딥링크는 네이티브에 새 핸들러가 필요해 범위가 늘어남 — 안내 문구만으로도 사용자가 스스로 앱스토어/플레이스토어에서 구독을 관리할 수 있어 MVP 단계에서는 충분하다고 판단.
- **부수 발견**: 설정 화면의 "동기화" 항목("마지막 동기화 시간")은 이 앱이 오프라인 배치 동기화가 아니라 Pro/Premium/Master 모두 Supabase에 직접 실시간으로 쓰는 구조라 애초에 추적 중인 타임스탬프가 없음 — 가짜 시각을 표시하지 않고 "실시간 동기화 중" 정적 문구로 대체.
- **영향 범위**: `docs/UI_FLOW.md`(§3, 요금제 비교), `supabase/migrations/31_subscription_plans_anon_select.sql`, `web/src/pages/{settings/SettingsPage,pricing/PricingPage}.tsx`.

### Phase 22 데이터 내보내기/가져오기 — 가져오기는 Guest 전용, 중복은 항상 덮어쓰기

- **결정 1**: "가져오기" UI는 Guest(로컬)에서만 구현하고 Pro/Premium/Master는 "내보내기"만 제공한다.
- **이유**: `docs/UI_FLOW.md` §3 등급별 표 자체가 이미 이렇게 비대칭으로 설계돼 있었음(Pro/Premium/Master는 Supabase가 이미 정본이라 복구가 계정 자체로 되고, Guest만 백업 파일이 유일한 복구 수단). Remote 가져오기(다른 계정 데이터 이전, 한도 초과 처리 등)는 이미 Phase 15/16의 마이그레이션 엔진이 다루는 문제와 겹쳐 중복 구현을 피함.
- **결정 2**: 백업 JSON의 `studyHistory` 단일 배열(설계 문서 원안)을 `studySessions`/`studyResults` 두 배열로 분리.
- **이유**: 가져오기 시 `session_id`/`word_id` 관계를 보존한 채 복원하려면 두 엔티티를 구분해서 `bulkPut`해야 함.
- **결정 3**: 가져오기 시 중복 데이터는 사용자 선택 없이 항상 덮어쓰기.
- **이유**: Guest 백업 복원의 목적 자체가 "최신 백업 상태로 되돌리기"이므로 덮어쓰기가 자연스러운 기본값. Dexie `bulkPut`이 이 동작을 그대로 구현해줘 추가 로직이 필요 없었음.
- **영향 범위**: `docs/DATA_STORAGE_DESIGN.md` §13, `web/src/lib/dataExport.ts`, `web/src/pages/settings/SettingsPage.tsx`.

---

### 결제 없는 회원가입 미지원 — "Free 회원" 상태 도입 안 함, 강제 전환 문구 일반화

- **배경**: `web/src/pages/auth/LoginPage.tsx`의 회원가입 탭이 상품 선택 없이도 단독으로 Supabase Auth 계정을 생성할 수 있어, "authenticated인데 pro/premium/master/admin 어디에도 해당하지 않는" 전이 상태(§2-1)가 만료/해지 케이스 외에 "애초에 결제한 적이 없는 신규 가입"으로도 발생할 수 있음이 확인됨. 기존 `DowngradeModal.tsx`는 이 상태를 "구독이 종료되었습니다"라는 만료 전제 문구로 안내하고 있어, 결제 이력이 없는 사용자에게는 부정확한 메시지였음.
- **검토한 대안**: Guest와 구분되는 "Free 회원"(로그인은 되지만 서비스 권한은 Guest와 동일한 별도 정착 상태)을 3축 모델에 추가하는 안을 검토했으나 채택하지 않음.
- **결정**: 별도 "Free 회원" 상태를 도입하지 않고 기존 방식을 유지한다 — 결제 없는 회원가입은 만료/해지와 동일하게 "정상 정착 상태가 아닌 전이 상태"로 취급해 `downgrade_pending` 절차로 Guest(anonymous)까지 강제 전환한다. 즉 결제 없는 회원가입 자체를 지원하지 않는 정책을 명문화한다.
- **이유**: 회원가입은 Guest 체험 이후 유료 전환을 위한 단계일 뿐 그 자체로 별도 등급을 정당화할 이유가 없음. "authenticated + 무권한"을 예외 없이 하나의 규칙(§2-1)으로 처리해야 `get_service_tier()`/`buildPermissions()`/`DowngradeGate` 어디에도 새 분기를 추가하지 않고 기존 마이그레이션 인프라(Phase 16 스캐폴딩)를 그대로 재사용할 수 있음.
- **적용**: 강제 전환 모달 문구를 "구독이 종료되었습니다" → "유효한 구독이 없습니다"로 일반화(`DowngradeModal.tsx`, `docs/UI_FLOW.md`)해 만료/미결제 양쪽에 모두 자연스럽게 읽히도록 수정. `docs/PERMISSION_DESIGN.md` §2-1, `docs/SUBSCRIPTION_DESIGN.md` §6에 이 정책과 트리거 조건을 명시.
- **후속 결정 필요(이월)**: "가입 즉시 상품 선택 화면으로 강제 라우팅"할지 여부는 온보딩 라우팅 구조 변경이 필요해 이번 세션 범위에서 제외. 현재는 사후적으로(앱 재실행 시) `DowngradeGate`가 감지해 되돌리는 방식만 구현됨 — `docs/TODO.md`에 후속 작업으로 등록.
- **영향 범위**: `docs/PERMISSION_DESIGN.md` §2-1, `docs/SUBSCRIPTION_DESIGN.md` §6, `docs/UI_FLOW.md`(만료/Master 해제/미결제 가입 → Guest 전환 안내), `web/src/components/migration/DowngradeModal.tsx`, `web/src/components/migration/DowngradeGate.tsx`, `web/src/hooks/useSubscriptionDowngrade.ts`.

---

## 2026-06-11

### quiz/start, quiz/answer Edge Function 미구현 → 클라이언트 직접 처리로 확정

- **결정**: Edge Function 없이 클라이언트에서 Supabase DB를 직접 업데이트
- **이유**: MVP 일정 단축, 클라이언트 RLS로 충분한 보안 보장
- **적용**: `src/lib/wordStatus.ts`의 `applyQuizAnswer`가 상태 전이 담당, `src/lib/studySession.ts`가 세션/결과 로깅 담당
- **유의**: 향후 서버 이전 시 `DESIGN.md` 기존 Edge Function 스펙 참고

---

### Phase 5 설계 변경 — session_type 클라이언트 결정

- **결정**: 원래 서버(`quiz/start`)가 결정하던 `session_type`을 클라이언트에서 직접 결정
- **이유**: Edge Function 미구현
- **적용**: `QuizPage.tsx`에서 진입 source에 따라 `'quiz'` | `'review_quiz'` 결정

---

### WordbookSelector 다중 선택 — `Set<string>` + 가상 `'review'` ID

- **결정**: 복습 단어모음을 DB 레코드 없이 가상 ID `'review'`로 처리
- **이유**: DB 스키마 변경 없이 UI에서 복습+단어장 조합 선택 가능
- **적용**: `WordbookListPage.tsx`의 `selectedIds: Set<string>`, `fetchSelectedWords`에서 분기 처리

---

### study_sessions 생성 타이밍 — QuizPage에서 resumeChoice 확정 후

- **결정**: `resumeChoice !== 'pending'`이 확정된 시점에 세션 생성
- **이유**: 사용자가 이어하기/새시작을 선택하기 전에는 실제 퀴즈 진행이 결정되지 않음
- **적용**: `useEffect([resumeChoice])` + `sessionIdRef = useRef<string | null>(null)` 패턴

---

### 알림 예약 — schedule_exceptions 미반영 (MVP 제한)

- **결정**: `refreshScheduleNotifications`는 exceptions를 반영하지 않고 원본 스케줄로 30일치 계산
- **이유**: MVP 범위 축소. "이 일정만 수정" 시 해당 schedule 전체 알림 취소만 처리
- **유의**: 향후 exceptions 반영 시 `notificationScheduler.ts`의 `refreshScheduleNotifications` 수정 필요

---

### notificationScheduler — useBridgeListener 분리

- **결정**: `NOTIFICATION_RESULT` 처리를 별도 `useBridgeListener` 훅에 격리
- **이유**: App.tsx에서 단일 리스너 등록, 알림 외 bridge 메시지 타입 추가 용이
- **적용**: `src/hooks/useBridgeListener.ts`, `App.tsx`의 `AuthProvider` 내 호출

---

## 2026-06-10

### TanStack Query 도입 — 서버 데이터 캐시 담당

- **결정**: Zustand는 로컬 상태(auth, settings)만 담당, 서버 데이터는 TanStack Query로 분리
- **이유**: 서버 상태와 클라이언트 상태를 명확히 분리하여 캐시 무효화/갱신 단순화
- **적용**: wordbooks, words, schedules, schedule_exceptions 모두 TanStack Query 쿼리 키로 관리

---

### 복습 알고리즘 — first_passed_at 기준 누적 계산

- **결정**: `next_review_at`을 `now + interval`이 아닌 `first_passed_at + interval`로 계산
- **이유**: 복습이 늦어져도 다음 복습 주기가 shift되지 않아 일관된 간격 유지

---

### Bridge pending queue — WEB_READY 기반 동기화

- **결정**: RN에서 `WEB_READY` 수신 전 메시지는 `pendingQueue`에 보관 후 일괄 전송
- **이유**: 앱 콜드 스타트 시 WebView 로드 전 알림 결과가 유실되는 문제 방지
