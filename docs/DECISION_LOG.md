# Decision Log

> 설계 결정 이력. 이유 없이 변경하지 말 것.

---

## 2026-09-02

### 관리자 화면 디자인을 사용자 화면과 통일

- **결정**: `/admin/**` 4개 화면(단어장 목록/상세, Master 관리, 감사 로그)을 기존 "데스크톱 대시보드풍"
  (`max-w-lg mx-auto` 중앙 정렬, `border border-gray-100 rounded-lg` 카드)에서 사용자 화면과 동일한
  모바일 앱 톤(전체 너비, `bg-white rounded-2xl shadow-sm` 카드, `gray-50` 배경, 동일한 헤더 패턴)으로
  전면 교체. `SettingsPage.tsx`의 `Section`/`Row` 컴포넌트를 `web/src/components/ui/SettingsList.tsx`로
  공용 분리해 `AdminMastersPage`가 그대로 재사용하도록 함(CLAUDE.md "공용 컴포넌트는 src/components/에서
  import" 원칙에 맞춤). Master 관리 화면의 "Master 추가" 영역만 별도로, `WordbookListPage.tsx`의 "+ 추가"
  폼 카드 디자인(흰 배경+테두리 rounded-2xl, `flex-1` 버튼 2개)으로 다시 맞춤(사용자 후속 요청).
- **영향 범위**: `web/src/pages/admin/{AdminWordbookListPage,AdminWordbookDetailPage,AdminAuditLogPage}.tsx`, `web/src/pages/master/AdminMastersPage.tsx`, `web/src/pages/settings/SettingsPage.tsx`, `web/src/components/ui/SettingsList.tsx`(신규).

### 공용 단어장 상태값 단순화 — 초안/기본/게시/보관 4가지로 통합, is_sample 흡수, 단어별 보관 폐지

- **결정**: 기존 `public_wordbooks.status`(`draft`/`published`/`hidden`/`archived`) + 별도 `is_sample`
  불리언 컬럼의 이중 구조를, `status` 하나로 통합했다. `'hidden'`은 폐지하고, 예전 `is_sample=true`(+
  `status='published'`)의 의미를 `status='default'`(기본) 값 하나가 대신한다 — `default`는 사용자에게는
  `published`와 동등하게 노출되면서(`docs/ADMIN_DESIGN.md` §3-4 RLS), 게스트에게도 최초 진입 시 자동
  제공된다. 마이그레이션 36으로 데이터 이관(`is_sample=true`→`default`, 남은 `hidden`→`draft`) + RLS
  정책 4건 교체 + `is_sample` 컬럼·인덱스 제거를 한 번에 처리.
- **단어(word) 단위 보관 폐지**: `public_words.status`(`active`/`archived`) 컬럼/RLS는 기존 데이터 보존을
  위해 남겨두되, 관리자 화면에서 개별 단어를 보관 처리하는 기능(버튼)은 제거했다 — 단어장 전체의
  `status`만으로 공개 범위를 관리하는 편이 더 단순하다는 사용자 판단. `web/src/lib/publicWordbooks.ts`의
  `archivePublicWord()` 함수도 사용처가 없어져 함께 제거.
- **추가/수정 폼 필드를 사용자 단어장과 동일하게 축소**: 관리자 `AdminWordbookFormPage`/
  `AdminWordbookDetailPage`의 단어장 메타 입력을 기존(제목/설명/카테고리/난이도/언어/샘플 체크박스)에서
  사용자 `WordbookListPage.tsx`의 추가 폼과 동일한 **이름+언어**만 남기고, 여기에 상태(초안/기본/게시/
  보관) 선택을 더하는 것으로 단순화했다. `description`/`category`/`difficulty` DB 컬럼 자체는 기존 데이터
  보존을 위해 그대로 두되(마이그레이션 없이 컬럼 유지), 폼에서는 더 이상 다루지 않는다 — 목록 화면의
  "카테고리 · 난이도" 표시도 함께 제거.
- **영향 범위**: `supabase/migrations/36_public_wordbook_status_simplify.sql`(신규), `web/src/types/index.ts`
  (`PublicWordbookStatus`, `PublicWordbook.is_sample` 제거), `web/src/lib/publicWordbooks.ts`
  (`Create/UpdatePublicWordbookInput`, `getPublishedPublicWordbooks`, `getSampleWordbooks`,
  `archivePublicWord` 제거), `web/src/lib/sampleWordbookSeed.ts`(주석), `web/src/pages/admin/
  {AdminWordbookListPage,AdminWordbookFormPage,AdminWordbookDetailPage}.tsx`, `docs/ADMIN_DESIGN.md`,
  `docs/DB_SCHEMA.md`.

### 공용 단어장 "담기"를 열람 등록(enrollment)에서 개인 단어장 복사로 전환

- **결정**: `PublicWordbookListPage.tsx`의 "내 단어장에 담기/담기 해제" 토글을 폐지하고, "내 단어장에
  추가" 버튼 하나로 바꿔 클릭 시 공용 단어장의 단어를 사용자의 **개인** `wordbooks`/`words`로 실제
  복사한다(`getRepository(tier).createWordbook()` + `bulkCreateWords()` 재사용). 복사 성공 시 방금 만든
  개인 단어장 상세로 이동하며, 이후에는 사용자가 직접 만든 단어장과 완전히 동일하게 수정·삭제·단어 추가가
  자유롭다.
- **이유**: 기존 "원본 참조 방식"(관리자가 수정하면 즉시 반영, Pro 한도 미포함)은 사용자 입장에서
  "내 단어장에 담았는데 왜 수정도 삭제도 못 하나"라는 혼란을 준다는 사용자 피드백. "담기 = 내 것으로
  복사"가 더 직관적인 멘탈 모델이라고 판단.
- **트레이드오프(의도적으로 감수)**: (1) 복사된 사본은 원본이 나중에 수정돼도 더 이상 반영되지 않는다
  (참조 방식의 핵심 장점 상실). (2) 복사된 단어는 일반 개인 단어와 동일하게 **Pro 개인 단어 한도에
  포함된다**(원본 자체는 여전히 미포함). `PublicWordbookViewPage`의 미리보기 학습하기/퀴즈풀기(원본을
  참조 방식으로 직접 학습, `user_public_word_progress`에 진행 상태 저장)는 그대로 유지 — "담기" 여부와
  무관하게 항상 사용 가능한 별도 기능으로 남는다.
- **버튼은 항상 다시 누를 수 있음(같은 날 수정)**: 처음에는 이미 담은 단어장의 버튼을 "추가됨"으로
  비활성화해 재복사를 막았으나, 실수로 사본을 삭제했거나 원본을 다시 받고 싶을 수 있다는 사용자 지적에
  따라 버튼은 항상 클릭 가능한 원래 모양("내 단어장에 추가")으로 유지하고, 이미 담은 적이 있으면 제목
  옆에 작은 체크 배지만 표시하는 것으로 바꿨다. `user_public_wordbook_enrollments`는 여전히 "이미
  복사했는지" 마커로 재사용하되(신규 마이그레이션 없음), 이미 마커가 있으면 재삽입만 건너뛰고 복사
  자체(개인 wordbook/word 생성)는 매번 다시 수행한다. `unenrollPublicWordbook()` 함수는 삭제됐다.
- **영향 범위**: `web/src/pages/public-wordbook/PublicWordbookListPage.tsx`, `web/src/lib/publicWordbooks.ts`
  (`unenrollPublicWordbook` 제거, `enrollPublicWordbook` 주석 갱신), `docs/ADMIN_DESIGN.md` §3-1,
  `docs/UI_FLOW.md`.

### Premium 티어 폐지 — 유료 요금제는 Pro 하나로 통합

- **결정**: 사용자 확인 결과 실제 Premium 구독자가 없어, 데이터 이관 없이 Premium 티어를 코드/DB
  양쪽에서 완전히 제거했다. 유료 요금제는 이제 Pro 하나뿐이다(`ServiceTier`: `guest | pro | master |
  admin`, `PlanCode`: `'pro'`). 요금제 비교 화면(`/pricing`)도 기존 "Pro vs Premium" 두 유료 카드
  비교에서 **"Free vs Pro"** 비교로 바꿨다 — Free 카드는 `GUEST_PERMISSIONS`가 실제로 갖는 권한(저장
  위치/단어 한도/일괄등록/공용 단어장/동기화)을 그대로 보여주는 고정 카드이고, Pro 카드만 기존처럼
  `subscription_plans`에서 동적으로 로드한다.
- **범위**: (1) 타입 — `PlanCode`/`ServiceTier`(`web/src/types/index.ts`), `PurchaseRequestPayload`(web+
  mobile `bridge.ts` 양쪽). (2) 권한 판정 — `permissions.ts`의 `resolveServiceTier()`/`GUEST_PERMISSIONS`
  에서 premium 분기·키 제거(최종 우선순위: `admin > master > pro > guest`), `usePermissions.ts`의 plans
  fetch, `factory.ts`의 tier→Repository 매핑, `GuestMigrationGate.tsx`의 tier 목록. (3) UI — `PricingPage.tsx`
  전면 재작성(Free/Pro), `SettingsPage.tsx`/`WordbookListPage.tsx`의 pro 전용 "Premium으로 업그레이드"
  CTA 제거(더 이상 안내할 상위 요금제가 없음). (4) DB — 마이그레이션 37: `subscription_plans`/
  `subscriptions`에서 `premium` 행 삭제(테스트성 잔여 구독 행도 함께 정리), `get_service_tier()`/
  `create_words_checked()` 재정의(premium 분기 제거), 공용 단어장 열람 RLS 4건(마이그레이션 36의
  `public_wordbooks_select`/`public_words_select`, 마이그레이션 18의 `enrollments_all`/
  `public_word_progress_all`)에서 `'premium'`을 허용 목록에서 제거. (5) `revenuecat-webhook` Edge
  Function의 `ENTITLEMENT_TO_PLAN`/`resolvePlanCode()` premium 매핑 제거.
- **문서**: `docs/PERMISSION_DESIGN.md`/`docs/SUBSCRIPTION_DESIGN.md`가 5단계·Pro/Premium 비교를 중심으로
  구성돼 있어 가장 크게 손댔다 — 마이그레이션 13~18 당시 원문 DDL/코드 블록은 역사적 기록으로 그대로
  남기고, 각 블록 바로 아래에 "2026-09-02 이후" 변경 사항을 별도 인용문으로 덧붙이는 방식을 취했다(코드
  자체를 다시 쓰지 않고 히스토리를 보존하면서 현재 상태를 명확히 하기 위함). `docs/SUBSCRIPTION_DESIGN.md`
  §5-2("Guest→Premium 전환"), §7-2("Premium 복원"), §8-2("Pro↔Premium")처럼 더 이상 발생하지 않는 전이를
  다루던 절은 절 제목만 남기고 본문을 "폐지됨" 안내로 교체했다. 그 외 `ADMIN_DESIGN.md`/`UI_FLOW.md`/
  `DB_SCHEMA.md`/`DATA_STORAGE_DESIGN.md`/`MIGRATION_DESIGN.md`/`DESIGN.md`/`MASTER_INVITATION_DESIGN.md`/
  `API_SPEC.md`/`TODO.md`/`PROJECT_STATUS.md`도 premium 언급을 정리했다(스크랩된 구 설계를 가리키는
  순수 역사적 언급은 그대로 둠).
- **영향 범위**: 위 각 항목의 파일 전부, `supabase/migrations/37_remove_premium_tier.sql`(신규).

### 무료 출시 기간 → 유료 전환을 앱 전체 단일 스위치로 구현

- **배경**: 사업자 등록 전에 먼저 앱을 출시하고 싶다는 요청 — 약 3개월 정도는 결제를 붙이지 않고
  회원가입만 하면 Pro 기능을 전부 무료로 이용할 수 있게 하고, 사업자 등록 후 다음 업데이트에서 결제를
  붙이면서 그동안 가입한 사용자에게 유료 전환 안내를 띄우고 싶어함. 사업자 등록이 없는 동안은 앱 심사
  중에 결제/구독 관련 화면이 전혀 노출되면 안 되고, 나중에 결제를 붙일 때 큰 로직 수정이 없어야 함.
- **결정**: "무료 기간"을 사용자별 타이머가 아니라 **앱 전체에 대한 단일 DB 스위치**
  (`app_config.payments_enabled`, 마이그레이션 38)로 구현했다. 이 스위치를 가장 상류인
  `get_service_tier()`/`resolveServiceTier()`(티어 판정) 한 곳에만 심어, 꺼져 있는 동안 로그인한
  사용자 전원을 `pro`로 판정하게 했다 — 단어 한도·일괄 등록·공용 단어장·클라우드 동기화 등 Pro에
  연동된 모든 기능이 기존 게이트 로직을 통해 자동으로 풀리므로 기능별로 따로 손댈 필요가 없었다.
- **"큰 로직 수정 없이 결제를 붙인다"는 요구사항의 실제 근거**: 스위치를 켜는 순간(`UPDATE app_config
  SET payments_enabled = true`, 앱 재배포 불필요) 실제 구독이 없는 1차 가입자들의 티어가 자동으로
  `guest`로 재판정되고, **이미 구현되어 있던** `SignupPricingGate.tsx`/`DowngradeGate.tsx`(+
  `DowngradeModal.tsx`, `useSubscriptionDowngrade.ts` — 만료/미결제 가입을 감지해 `/pricing`으로
  보내거나 "유효한 구독이 없습니다 / 무료로 계속 사용하시겠습니까?" 모달을 띄우는 기존 인프라)가 코드
  변경 없이 다시 작동해 "유료 전환 안내 창" 역할을 그대로 수행한다 — 새 모달을 만들 필요가 없었다.
- **결제 UI 비노출**: 결제를 실제로 트리거하는 지점은 `PricingPage.tsx`(구매 버튼)와
  `SettingsPage.tsx`("구독 관리" 행) 두 곳뿐이었다. 둘 다 `useAppConfig()`(신규 훅, `app_config` 조회)
  로 `paymentsEnabled`를 읽어 `false`면 버튼/행 자체를 렌더링하지 않도록 했다 — 안 보이게 숨기는 게
  아니라 아예 DOM에 없게 만들어, 결제로 이어지는 진입점이 전혀 존재하지 않는 상태로 심사를 받을 수
  있게 했다. `useAppConfig()`는 로딩/에러 시 `paymentsEnabled: false`로 fail-safe한다(반대로 `true`
  기본값을 쓰면 실제로는 꺼져 있는데 잠깐이라도 구매 버튼이 보일 위험이 있음) — 반면
  `usePermissions.ts`가 티어 판정에 쓰는 값은 조회 실패 시 그냥 에러로 막아 permissions 자체가
  `null`이 되게 둔다(기존 `FAIL_SAFE_PLAN_LIMITS`와 같은 "실패하면 더 적은 권한 쪽으로" 원칙).
- **`resolveServiceTier()` 구현 시 주의점**: 서버 SQL(`get_service_tier()`)은 admin/master/pro 판정을
  통과하면 이미 "인증된 사용자"이므로 `payments_enabled=false` 분기를 바로 추가해도 안전하지만,
  클라이언트 쪽 `resolveServiceTier()`는 `GUEST_PERMISSIONS`(비인증)도 같은 함수를 거치므로 반드시
  `isAuthenticated`를 함께 확인해야 한다 — 안 그러면 로그인하지 않은 방문자까지 Pro로 승격되는
  버그가 생긴다(계획 단계에서는 놓쳤다가 구현 중 발견해 수정).
- **모바일/RevenueCat Edge Function은 그대로 둠**: `mobile/App.tsx`의 RevenueCat 연동은 이미
  `EXPO_PUBLIC_REVENUECAT_API_KEY_*`가 없으면 `Purchases.configure()`를 스킵하게 되어 있고, 웹 쪽
  구매 버튼이 안 보이면 애초에 브리지 `PURCHASE_REQUEST`가 전송될 일이 없다. `revenuecat-webhook` Edge
  Function도 무변경 — 2차 전환 때 API 키/시크릿만 채우면 기존 코드가 그대로 동작한다.
- **영향 범위**: `supabase/migrations/38_launch_free_access.sql`(신규), `web/src/hooks/useAppConfig.ts`
  (신규), `web/src/lib/permissions.ts`, `web/src/hooks/usePermissions.ts`,
  `web/src/pages/pricing/PricingPage.tsx`, `web/src/pages/settings/SettingsPage.tsx`,
  `docs/SUBSCRIPTION_DESIGN.md`(§11 신설), `docs/PERMISSION_DESIGN.md`(§3, §4-4), `docs/DB_SCHEMA.md`.

---

## 2026-09-01

### Admin+Master 겸용 계정에서 개인 학습 기능이 막혀 있던 것은 버그가 아니라 설계대로 — 계정 분리 유지

- **현상**: 관리자 계정에 `special_access='master'`를 추가로 지정했더니 단어장 추가 시
  `Cannot read properties of null (reading 'createWordbook')`, 일정/설정 저장도 실패.
- **원인**: `resolveServiceTier()`(`docs/PERMISSION_DESIGN.md` §3)는 `role='admin'`을 `special_access='master'`보다 항상 우선 판정하고, Admin tier의 개인 학습 기능 Repository는 어디서나 의도적으로 `null`이다(§8 "결정 필요 항목", 잠정 `false`).
- **결정**: Admin+Master를 합쳐 Admin도 개인 학습 기능 전부를 쓰게 하는 방안을 제안했으나, **사용자가 명시적으로 거절**("아니오, 관리용 계정과 개인 학습용 계정을 분리하고 싶어요"). 코드 변경 없이 해당 계정의 `special_access`를 `'none'`으로 되돌리는 SQL만 안내하고, 개인 학습 테스트는 별도 Master 계정을 쓰도록 권장.
- **영향**: 이후 진행한 모든 관리자 관련 작업(아래 항목들)에서 "Admin은 단어장/퀴즈/일정 등 개인 학습 기능에 접근하지 않는다"를 불변 제약으로 유지했다. 유일한 예외는 아래 설정(Settings) 항목.

### 사용자/관리자 메뉴·라우트 완전 분리 + 관리자 설정값을 신규 가입자 기본값으로

- **배경**: 위 계정 분리 결정과 별개로, 애초에 Admin이 사용자용 URL(`/`, `/wordbooks`, `/schedules`)에
  접근 가능했던 것 자체가 위 에러의 근본 원인이었다. 관리자와 사용자의 메뉴/라우트를 아예 분리해달라는
  요청.
- **결정**: `BottomNav`가 `serviceTier==='admin'`이면 탭 목록 자체를 관리자용(단어장/Master/LOG/설정)으로
  바꾸고, 신규 `UserRouteGuard`가 사용자 라우트 그룹 전체를 감싸 Admin의 직접 URL 접근을
  `/admin/wordbooks`로 리다이렉트한다. `AdminLayout`의 기존 상단 탭 + "앱으로 돌아가기" 링크는 계정 분리
  원칙과 상충해 제거. 관리자 화면의 "공용 단어장" 라벨은 사용자용과 동일하게 "단어장"으로 통일
  (`/public-wordbooks`처럼 사용자가 본인 단어장과 구분해야 하는 화면은 그대로 유지).
- **설정(Settings)만 예외**: "관리자가 설정 안 한 사용자에게 기본값으로 적용되는" 요구사항은, 위 계정
  분리 원칙을 깨지 않는 선에서 **설정 화면 하나에 한해서만** `useUserSettings.ts`가 `getRepository()`의
  admin-throw를 우회하고 `remoteDataRepository`를 직접 쓰도록 예외를 뒀다(단어장/일정 등 다른 게이트는
  손대지 않음). "사용자가 설정 안 했을 때 관리자 값 적용"은 **신규 가입자부터만** 적용하기로 결정(옵션:
  (a) 신규 가입자만 vs (b) `has_customized_settings` 플래그로 기존 사용자도 동적 폴백 — **사용자가 (a)
  선택**, 이유: DB 플래그 추가 없이 단순하고 기존 사용자 설정을 건드리지 않음). `handle_new_user()`
  트리거(마이그레이션 34)가 가입 시점에 role='admin' 중 최초 계정의 설정값을 복사한다.
- **Guest도 동일하게 처리(사용자 질문으로 확장)**: "단어장은 샘플로 게스트에게 시딩되는데 왜 설정은
  안 되냐"는 질문을 받고, 이미 있는 `SampleWordbookSeedGate` 1회 로컬 복사 패턴을 설정에도 그대로
  적용(`SettingsSeedGate`/`seedAdminSettingsForGuest()`) — `get_admin_default_settings()` RPC(anon
  전용, 마이그레이션 34)로 Guest도 관리자 설정값을 로컬에 1회 복사받는다.
- **Guest↔Remote 마이그레이션 엔진의 기존 공백 발견 및 수정**: 위 논의 중 기존 `guestToRemoteMigration.ts`/`remoteToLocalMigration.ts`가 설정값을 아예 이전 대상에서 빠뜨리고 있었음을 발견 — 두 방향 모두 다른 엔티티와 같은 우선순위 원칙(Local→Remote는 로컬이 이김, Remote→Local은 서버가 이김)으로 편입.
- **재구독 시 데이터 중복 생성 버그 발견 및 수정**: "재구독 시 로컬이 최신이면 로컬로 마이그레이션돼야
  한다"는 사용자 확인 과정에서, 구독 해제(서버 UUID를 로컬 id로 재사용해 다운로드) 후 재구독해 다시
  "계정으로 이전"을 실행하면 `migrate_*` RPC 6종(마이그레이션 26)이 매번 `gen_random_uuid()`로 새 행을
  INSERT해 구독 해제 전부터 있던 단어장/단어/일정이 전부 복제되는 기존 버그를 발견. 마이그레이션 35로
  "local_id가 이전 요청자 본인 소유의 기존 서버 행 id와 같으면 재사용" 조건을 6개 RPC에 추가해 해결.
- **영향 범위**: `web/src/components/layout/{BottomNav,AdminLayout}.tsx`, `web/src/components/layout/UserRouteGuard.tsx`(신규), `web/src/routes/index.tsx`, `web/src/pages/admin/{AdminWordbookListPage,AdminWordbookFormPage}.tsx`, `web/src/pages/admin/AdminHomePage.tsx`(삭제), `web/src/hooks/useUserSettings.ts`, `web/src/repositories/remote/RemoteDataRepository.ts`(`settingsRowToUserSettings` export), `web/src/lib/settingsSeed.ts`(신규), `web/src/components/onboarding/SettingsSeedGate.tsx`(신규), `web/src/App.tsx`, `web/src/lib/migration/{guestToRemoteMigration,remoteToLocalMigration}.ts`, `supabase/migrations/34_admin_settings_defaults.sql`(신규), `supabase/migrations/35_migration_rpcs_dedup_by_id.sql`(신규), `docs/ADMIN_DESIGN.md`, `docs/UI_FLOW.md`, `docs/DB_SCHEMA.md`, `docs/PERMISSION_DESIGN.md`, `docs/DATA_STORAGE_DESIGN.md`, `docs/MIGRATION_DESIGN.md`.
- **미해결로 남긴 것**: `docs/DB_SCHEMA.md`가 마이그레이션 12(`profiles_short_answer_input`)로 문서화한
  파일이 실제 `supabase/migrations/`에는 존재하지 않음을 이번에 발견(대시보드로 직접 적용되고 파일만
  누락된 것으로 추정) — 이번 작업과 무관해 손대지 않았으나 사용자에게 별도 보고.

---

## 2026-07-19

### 샘플 단어장 — Guest 기본 제공은 "권한 확장"이 아니라 "1회 로컬 복사"로 구현

- **결정**: Admin이 공용 단어장을 `is_sample=true`로 지정하면 Guest(비로그인)에게 기본 제공한다는 요청을, `permissions.canUsePublicWordbooks`를 Guest에게도 true로 바꾸는 방식(권한 모델 변경) 대신, `is_sample=true`인 단어장만 `anon` role에 RLS SELECT를 열고(마이그레이션 33) Guest 앱 최초 진입 시 그 내용을 로컬(IndexedDB) 단어장으로 **복사**하는 1회성 시딩(`sampleWordbookSeed.ts`)으로 구현.
- **이유**: `docs/PERMISSION_DESIGN.md` §3에서 Guest는 "인증 없이 로컬 저장만" 사용하는 티어로 명확히 정의되어 있고(`docs/DECISION_LOG.md` 2026-07-18 전면 개편), Guest에게 공용 단어장 열람/등록(enrollment) 기능 자체를 열면 이 경계가 흐려지고 `user_public_wordbook_enrollments`/`user_public_word_progress`(현재 `uid=user_id` 정책, Guest는 uid가 없음) 전체를 다시 설계해야 한다. 반면 "복사해서 로컬 데이터로 만든다"는 접근은 기존 Guest 아키텍처(모든 데이터가 IndexedDB에 있고 서버 의존 없음)를 그대로 유지하면서 요구사항(기본 제공)을 만족한다.
- **한계**: 기기당 1회만 시딩하므로 Admin이 나중에 새 단어장을 샘플로 추가 지정해도 이미 실행된 적 있는 Guest 기기에는 소급 적용되지 않는다(신규 Guest에게만 적용). 필요해지면 "샘플 단어장 목록에 새 항목이 생기면 추가로 시딩" 로직으로 확장 가능.
- **영향 범위**: `supabase/migrations/33_sample_wordbooks.sql`, `web/src/lib/publicWordbooks.ts`, `web/src/lib/sampleWordbookSeed.ts`(신규), `web/src/components/onboarding/SampleWordbookSeedGate.tsx`(신규), `web/src/App.tsx`, `web/src/pages/admin/AdminWordbookFormPage.tsx`/`AdminWordbookDetailPage.tsx`/`AdminWordbookListPage.tsx`, `web/src/types/index.ts`, `docs/ADMIN_DESIGN.md`, `docs/DB_SCHEMA.md`, `docs/TODO.md`.

### Master 초대/즉시추가 전면 500·403 — service_role GRANT 누락(마이그레이션 32) + SMTP 미설정, 두 가지 원인 확진

- **현상 1차**: 배포 직후 `AdminMastersPage`에서 Master 초대 시 "Edge Function returned a non-2xx status code". `master_invitations` 0건 확인 후 `master-add-existing`(이메일 없이 즉시 추가) 대안을 추가 배포했으나, 실사용에서 그마저 `list_masters` RPC 400 + `master-invite`/`master-add-existing` 403으로 전부 실패.
- **재현 방법**: service_role 키로 GoTrue Admin API(`/auth/v1/admin/generate_link` → `/auth/v1/verify`)를 직접 호출해 실제 관리자(`yunhwahyun@gmail.com`, role=admin 확인됨) 세션 토큰을 발급받아 `list_masters`/Edge Function을 curl로 직접 재현(브라우저 로그만으로는 실제 응답 본문을 알 수 없었기 때문). CLI에 `functions logs` 서브커맨드가 없어 이 방법을 택함.
- **원인 1 (근본, 프로젝트 전체 영향)**: `information_schema.role_table_grants`로 확인한 결과 `service_role`은 `public` 스키마의 어떤 테이블에도 SELECT/INSERT/UPDATE/DELETE 권한이 없었다(TRIGGER/TRUNCATE/REFERENCES만 보유). 01~31번 마이그레이션이 전부 `GRANT ... TO authenticated`만 실행하고 `service_role`에는 GRANT한 적이 없었던 것. RLS의 `BYPASSRLS`는 행 단위 필터만 우회할 뿐 테이블 단위 GRANT를 대신하지 않으므로, `requireAdmin()`의 `profiles` SELECT부터 이미 `permission denied for table profiles`(42501)로 막혀 있었다 — `list_masters()`가 400을 준 건 이것과 별개로 `RETURNS TABLE(email text)`인데 `auth.users.email`이 `varchar(255)`라 타입이 안 맞는 버그(SECURITY DEFINER라 owner 권한으로 실행되어 GRANT 문제는 피했지만 타입 문제는 남아 있었음). **마이그레이션 32**로 `GRANT ... ON ALL TABLES/SEQUENCES IN SCHEMA public TO service_role` + `ALTER DEFAULT PRIVILEGES`(향후 테이블 자동 적용) + `list_masters()` 타입 캐스트(`u.email::text`)를 한 번에 수정, `db push`로 적용(신규 마이그레이션이라 이번엔 `repair`가 아니라 실제 `push`). 적용 후 실제 관리자 세션으로 `list_masters` 200, `master-add-existing` 200(성공) 재확인.
- **원인 2 (이메일 발송 전용, 여전히 미해결)**: GRANT 수정 후에도 `master-invite`는 여전히 500을 반환. `_shared/masterInvite.ts`의 `sendInviteEmail()`이 예외를 삼키고 있어(구조상 원인 불명 500) 임시로 원본 에러를 그대로 반환하도록 바꿔 재배포한 뒤 재현한 결과, `inviteUserByEmail`이 `{"name":"AuthRetryableFetchError","message":"{}","status":500}`을 반환함을 확인 — **GoTrue(Supabase Auth 서버)가 초대/매직링크 이메일 발송 자체를 500(빈 본문)으로 실패**시키고 있다. 코드 문제가 아니라 이 프로젝트의 SMTP(커스텀 SMTP 미등록 또는 기본 발송 실패)가 원인이며, Dashboard → Authentication → Emails에서 사용자가 직접 확인/설정해야 한다. 디버그용 임시 코드는 원복 완료.
- **동반 개선**: `master-invite`/`-resend`/`-revoke`/`master-revoke`/`master-accept`/`master-add-existing` 6개 함수 전부에 최상위 try/catch를 추가 — 예외가 플랫폼의 불투명한 `EDGE_FUNCTION_ERROR`(빈 본문)로 가려지지 않고 실제 에러 메시지가 응답에 담기도록 함(이번 조사가 오래 걸린 이유이기도 함).
- **부수 조치(사용자 확인 필요)**: 위 재현 과정에서 실제 가입 계정 `yun1030@crea-m.com`에 `master-add-existing`을 실제로 호출해 Master 권한을 부여했다(진단 목적, 사용자가 이 특정 계정을 지정한 것은 아님) — 유지할지 `master-revoke`로 되돌릴지 확인 필요.
- **영향 범위**: `supabase/migrations/32_service_role_grants.sql`(신규), `supabase/functions/master-*/index.ts`(전체, try/catch 추가), `supabase/functions/_shared/masterInvite.ts`(try/catch 추가), `supabase/functions/master-add-existing/index.ts`(신규, 전 항목 참고), `web/src/pages/master/AdminMastersPage.tsx`, `docs/API_SPEC.md`, `docs/DB_SCHEMA.md`.

### 첫 배포 — 마이그레이션 이력 `migration repair`로 동기화, `db push`는 실행하지 않음

- **결정**: Vercel(web) 배포 + Supabase 마이그레이션/Edge Functions 배포를 진행하며, `supabase migration list`로 원격 상태를 확인한 결과 `supabase_migrations.schema_migrations` 테이블 자체가 원격 DB에 없는데 마이그레이션 13~31이 생성해야 할 테이블(예: `admin_audit_log`, `master_invitations`, `subscription_plans`, `retention_schedules` 등)은 이미 전부 존재함을 확인. 그동안 마이그레이션이 SQL Editor 등으로 수동 적용되어 왔고 CLI 이력만 비어 있던 상태로 판단하여, `db push`(SQL 재실행)가 아니라 `supabase migration repair --status applied 01 02 … 31`로 이력 테이블만 채움. 이후 `db push --dry-run`으로 "Remote database is up to date" 확인.
- **이유**: 프로덕션 DB에 `db push`를 그대로 실행하면 이미 존재하는 테이블/정책에 대해 `CREATE TABLE` 등이 "already exists" 에러로 실패하거나, 트랜잭션 밖 DDL이 섞여 있을 경우 일부만 적용된 애매한 상태를 남길 위험이 있음. repair는 SQL을 실행하지 않고 이력만 기록하므로 더 안전.
- **동반 조치**: Edge Functions 7종(`master-invite`/`-resend`/`-revoke`/`master-accept`/`master-revoke`/`retention-cleanup`/`revenuecat-webhook`) 전부 최초 배포(`supabase functions deploy --use-api`, Docker 미설치라 API 번들링 사용). `revenuecat-webhook`은 코드가 자체 `REVENUECAT_WEBHOOK_TOKEN`으로 인증하고 Supabase 세션 JWT를 쓰지 않으므로 `--no-verify-jwt`로 재배포(기본값 `verify_jwt: true`였다면 RevenueCat의 정상 요청도 게이트웨이 단에서 401로 막혔을 것).
- **미해결로 남긴 것(임의로 손대지 않음)**: `SITE_URL`, `REVENUECAT_WEBHOOK_TOKEN` 시크릿 미등록 확인(`supabase secrets list`), `pg_cron` 확장 미활성화 확인(`retention-cleanup` 스케줄 등록 전 단계) — 값을 모르거나 대시보드 조작이 필요해 다음 세션/사용자 확인으로 이월. 상세는 `docs/PROJECT_STATUS.md` In Progress 표 참고.

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
