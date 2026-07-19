# UI Flow

> **2026-07-18 정책 개편**: Guest는 로그인 없이 앱을 사용한다. 기존 `ProtectedRoute`의 "비로그인=무조건 `/login`" 전제가 깨지므로 §0을 먼저 확인할 것. 전제 문서: `docs/PERMISSION_DESIGN.md`(권한), `docs/DATA_STORAGE_DESIGN.md`(Repository).

---

## 0. 등급별 접근 정책

```text
anonymous(Guest)
  → 로그인 없이 앱 진입, LocalDataRepository로 즉시 사용 가능
  → 접근 불가: 공용 단어장, 일괄등록, /admin, /speaking(등록/녹음 자체는 가능 — §3.4상 Guest 허용 기능이므로 접근 가능. 저장만 로컬)

authenticated + pro/premium/master
  → 로그인 필요, RemoteDataRepository
  → Pro만 개인 단어 한도 UI 노출

authenticated + admin
  → /admin 진입 가능, 일반 학습 화면 접근 여부는 docs/ADMIN_DESIGN.md §6 결정 필요 항목
```

`ProtectedRoute`는 "로그인 필수 라우트"에만 적용한다(`/settings`의 계정 관리 등 극히 일부, `/admin/**`). 홈/단어장/학습/퀴즈/일정/스피킹은 Guest도 접근 가능한 **공개 라우트**로 전환하고, 내부에서 `usePermissions()`의 `serviceTier`로 Repository만 분기한다(`docs/DATA_STORAGE_DESIGN.md` §6).

---

## 1. 화면 목록 & 라우팅

| 화면명 | Path | 탭 | 접근 | 주요 기능 |
|--------|------|----|----|-----------|
| 홈 | `/` | 홈 | Guest 포함 전체 | 학습영역(오늘의 단어 카드) + Today 일정 |
| 학습하기 | `/learn` | — | Guest 포함 전체 | 카드 스크롤 + TTS + 학습 완료 버튼 |
| 퀴즈 | `/quiz` | — | Guest 포함 전체 | Quiz 컴포넌트 래핑 + 이어하기 |
| 퀴즈 완료 | `/quiz/complete` | — | Guest 포함 전체 | 정답률 + 완료 개수 |
| 단어장 | `/wordbooks` | 단어장 | Guest 포함 전체 | 복습컬렉션 + 단어장 다중 선택, 학습/퀴즈 진입 |
| 단어장 상세 | `/wordbooks/:id` | — | Guest 포함 전체 | 단어 목록 + 추가/수정/삭제, 일괄등록은 Pro↑만 노출 |
| 공용 단어장 ✅ 구현 완료(2026-07-19) | `/public-wordbooks`, `/public-wordbooks/:id` | `WordbookListPage` 헤더 링크(탭 아님, 편차) | Pro/Premium/Master | 열람·담기(enrollment) + 학습하기/퀴즈 연동까지 완료 |
| 스피킹 | `/speaking` | 스피킹 | Guest 포함 전체 | 등록 문장 목록(`docs/SPEAKING_DESIGN.md`) |
| 스피킹 문장 등록 | `/speaking/new` | — | Guest 포함 전체 | 문장 등록/수정 |
| 스피킹 녹음 | `/speaking/:id/record` | — | Guest 포함 전체 | TTS + 녹음 + 재생 |
| 일정 | `/schedules` | 일정 | Guest 포함 전체 | 날짜 범위 검색, 날짜별 그룹 조회 |
| 요금제 비교 | `/pricing` | — | 전체(로그인 유도용) | Guest/Pro/Premium 비교, 결제 진입 |
| 로그인 | `/login` | — | 비로그인 상태에서만 | Pro/Premium 결제 진입 시 또는 "기존 회원 로그인" |
| 설정 | `/settings` | 설정 | Guest 포함 전체 | 등급별 섹션 분기(§4) |
| 관리자 홈 ✅ 구현 완료(2026-07-19) | `/admin` | — | Admin만(`ProtectedRoute` + role 체크) | `AdminLayout` 안 3개 섹션(공용 단어장/Master 관리/감사 로그) 카드 목록 |
| Master 관리 ✅ 구현 완료(2026-07-18) | `/admin/masters` | — | Admin만(`ProtectedRoute requireRole="admin"`) | 초대 폼 + 초대 목록 + 현재 Master 목록을 한 페이지에 |
| 감사 로그 ✅ 구현 완료(2026-07-19) | `/admin/audit-log` | — | Admin만(`ProtectedRoute requireRole="admin"`) | `admin_audit_log` 최신 200건 읽기 전용 조회 |
| Master 초대 수락 ✅ 구현 완료(2026-07-18) | `/master/accept` | — | 세션 기반(§2 편차로 토큰 아님) | `docs/MASTER_INVITATION_DESIGN.md` §4-3, 편차는 상단 참고 |

### 라우팅 구조

> Phase 20까지 완료(2026-07-19). `/master/accept`(세션 기반), `/admin`(`AdminLayout` + `AdminHomePage`),
> `/admin/masters`(`AdminMastersPage` 단일 페이지), `/admin/wordbooks*`(`AdminWordbookListPage`/
> `AdminWordbookFormPage`/`AdminWordbookDetailPage`, `:id/words/new` 별도 라우트 없이 상세 페이지
> 인라인 폼으로 통합), `/admin/audit-log`(`AdminAuditLogPage`), `/public-wordbooks`·
> `/public-wordbooks/:id` 전부 구현 완료. `/admin/masters/invitations`(초대 상태 별도 분리 목록)만
> 편차로 만들지 않음(`AdminMastersPage`에 이미 통합돼 있어 불필요).

```tsx
<Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route path="/master/accept" element={<MasterAcceptPage />} />

  {/* Guest 포함 공개 라우트 — Repository는 usePermissions()로 내부 분기 */}
  <Route element={<AppLayout />}>
    <Route path="/"           element={<HomePage />} />
    <Route path="/wordbooks"  element={<WordbookListPage />} />
    <Route path="/speaking"   element={<SpeakingListPage />} />
    <Route path="/schedules"  element={<ScheduleListPage />} />
    <Route path="/settings"   element={<SettingsPage />} />
  </Route>
  <Route path="/learn"                         element={<LearnPage />} />
  <Route path="/quiz"                          element={<QuizPage />} />
  <Route path="/quiz/complete"                 element={<QuizCompletePage />} />
  <Route path="/wordbooks/:id"                 element={<WordbookDetailPage />} />
  <Route path="/wordbooks/:id/words/new"       element={<WordFormPage />} />
  <Route path="/wordbooks/:id/words/:wid/edit" element={<WordFormPage />} />
  <Route path="/public-wordbooks"              element={<PublicWordbookListPage />} />
  <Route path="/public-wordbooks/:id"          element={<PublicWordbookViewPage />} />
  <Route path="/speaking/new"                  element={<SpeakingSentenceFormPage />} />
  <Route path="/speaking/:id/record"           element={<SpeakingRecordPage />} />
  <Route path="/schedules/new"                 element={<ScheduleFormPage />} />
  <Route path="/schedules/:id/edit"            element={<ScheduleFormPage />} />
  <Route path="/pricing"                       element={<PricingPage />} />

  {/* 관리자 전용 — AdminLayout(하단 탭 없음, 상단 탭 홈/공용 단어장/Master 관리/감사 로그) */}
  <Route element={<ProtectedRoute requireRole="admin" />}>
    <Route element={<AdminLayout />}>
      <Route path="/admin"                        element={<AdminHomePage />} />
      <Route path="/admin/wordbooks"               element={<AdminWordbookListPage />} />
      <Route path="/admin/wordbooks/:id"            element={<AdminWordbookDetailPage />} />
      <Route path="/admin/wordbooks/new"            element={<AdminWordbookFormPage />} />
      <Route path="/admin/masters"                  element={<AdminMastersPage />} />
      <Route path="/admin/audit-log"                element={<AdminAuditLogPage />} />
    </Route>
  </Route>
</Routes>
```

`ProtectedRoute`는 `requireRole` prop을 받아 `role !== 'admin'`이면 홈으로 리다이렉트하도록 확장한다(`docs/DEVELOPMENT_RULES.md`에 위배되지 않는 단순 확장).

---

## 2. 하단 탭

```
[ 홈 ]  [ 단어장 ]  [ 스피킹 ]  [ 일정 ]  [ 설정 ]
```

기존 "Phase 10 이후 추가 예정"이었던 5탭 구성을 이번 개편에서 확정한다(평가 기능이 빠지면서 스피킹 탭 자체의 복잡도는 오히려 낮아짐). Admin은 하단 탭 대신 `/admin` 전용 레이아웃을 사용(§0).

> BottomNav 레이아웃: `w-fit mx-auto` (fit-content 중앙 정렬) + `gap-5` 아이콘 간격 + 하단 `max(calc(env(safe-area-inset-bottom) + 10px), 1.25rem)` 패딩

---

## 3. 화면별 상세

### 홈 (`/`)

```
┌──────────────────────────────────┐  ← 배경색 A (학습영역)
│  [복습 단어 카드] [신규 단어 카드]  │
│      ← 스와이프 →                 │
│  [  학습하기  ]  [ Quiz Start ]   │
└──────────────────────────────────┘
┌──────────────────────────────────┐  ← 배경색 B (Today)
│  Today                           │
│  10:00  팀 미팅                  │
│  ...                             │
└──────────────────────────────────┘
```

- 학습영역: 복습 단어 1개 + 신규(`status = 'unseen'`) 단어 1개 스와이프 카드
- 학습하기 → `/learn`, Quiz Start → `/quiz`
- Today: 오늘 일정 전체 노출 (앞으로 30일, 최대 3건)

---

### 단어장 (`/wordbooks`)

```
┌──────────────────────────────────┐
│  ☐  복습 단어모음  복습 12 / 전체 87  │  ← 가상 컬렉션 (id='review')
├──────────────────────────────────┤
│  ☐  영어 단어장    단어 45개  ✏  >  │
│  ☐  일본어 N3      단어 30개  ✏  >  │
└──────────────────────────────────┘
      [ 학습하기 ]  [ 문제풀기 ]     ← 1개 이상 선택 시 노출
```

- 체크박스 선택 = `selectedIds: Set<string>` 토글
- 행 클릭 = 체크박스 토글 (ChevronRight 클릭만 상세 이동)
- `✏` = 단어장 수정/삭제 인라인 폼
- 학습하기 → `/learn`, 문제풀기 → `/quiz` (선택된 단어 병합 + 중복 제거)
- **일괄등록 버튼**: `permissions.canBulkImport`가 true인 등급(Pro/Premium/Master)에서만 노출. Guest는 버튼 자체를 숨기고, Pro는 한도 초과 상태(`docs/SUBSCRIPTION_DESIGN.md` §5-1)면 버튼은 노출하되 클릭 시 안내 모달로 대체
- **공용 단어장 진입** ✅ 구현 완료(2026-07-19, 편차): 세그먼트 탭 대신 헤더의 "공용 단어장" 링크(`permissions.canUsePublicWordbooks`일 때만 노출)로 `/public-wordbooks`로 이동하는 방식으로 단순화

---

### 학습하기 (`/learn`)

- `navigation.state.words: Word[]`로 단어 수신
- 카드 스크롤 (세로 스와이프)
- 각 카드: term + definition + description + TTS 버튼
- 하단 "학습 완료" 버튼 → `study_sessions.completed_at` 업데이트 → 뒤로

---

### 퀴즈 (`/quiz`)

- `navigation.state.words: Word[]`로 단어 수신
- localStorage 이어하기: 24시간 TTL, 이어하기/새시작 선택 UI
- Quiz 컴포넌트: 객관식(4지선다) 또는 주관식 입력
- 정답 → AnswerReveal (term + definition + description) → 다음
- 오답 → 큐 뒤에 재삽입
- 완료 → `/quiz/complete`

---

### 일정 (`/schedules`)

```
┌──────────────────────────────────┐
│  [ 2026. 06. 04 ] ~ [ 2026. 06. 04 ]  [ 조회 ]
└──────────────────────────────────┘
  프리셋: 오늘 / 이번주 / 이번달 / 3개월

  2026. 06. 04. (Thu)
    10:00  팀 미팅
    14:00  영어 스터디

  2026. 06. 05. (Fri)
    09:00  운동
```

- 기본값: today ~ today
- `expandScheduleOccurrences` → `applyScheduleExceptions` → `groupOccurrencesByDate` 순으로 클라이언트 처리
- 일정 항목 탭 → 인라인 폼 (수정/삭제)
- 반복 일정 수정/삭제 시 범위 선택 모달: **이 일정만 / 이후 모두 / 전체**

#### 반복 일정 수정/삭제 플로우

```
단일 (repeat_type='none'):
  수정 → schedules UPDATE
  삭제 → schedules DELETE

반복 수정:
  이 일정만    → schedule_exceptions UPSERT (modified)
  이후 모두    → 기존 repeat_until = 선택 occurrence 전날 + 새 schedule INSERT
  전체         → schedules UPDATE

반복 삭제:
  이 일정만    → schedule_exceptions UPSERT (cancelled)
  이후 모두    → 기존 repeat_until = 선택 occurrence 전날
  전체         → schedules DELETE (CASCADE)
```

---

### 설정 (`/settings`) ✅ 등급별 섹션 분기 구현 완료(2026-07-19)

공통(전 등급): **학습**(퀴즈 기본 모드, 문제 순서), **복습**(주기/정책), **알림**(일정/복습 토글+시간) — 기존 그대로 유지, `profiles`(Remote) 또는 `settings`(Local) 낙관적 업데이트로 저장소만 분기.

등급별 **계정** 섹션(§23 원문 기준):

| 섹션 | Guest | Pro | Premium | Master | Admin |
|---|---|---|---|---|---|
| 저장 위치 안내 | "현재 기기에 저장 중" | 계정 정보 | 계정 정보 | 계정 정보 + Master 권한 표시 | 관리자 권한 표시 |
| 단어 등록 상태 | 제한 없음 표시 + 로컬 저장 용량 안내 | 현재 수/한도/신규 등록 가능 여부 | 무제한 표시 | 무제한 표시 | — |
| 동기화 | — | ~~마지막 동기화 시간~~ "실시간 동기화 중"(편차, 아래 참고) | 동일 | 동일 | — |
| 결제 | 요금제 보기(`/pricing`) | Premium으로 업그레이드 / 구독 관리 | 구독 관리 | **비노출**(무료 지정 계정) | 비노출 |
| 데이터 ✅ 구현 완료(2026-07-19) | 전체 백업(JSON)/CSV 내보내기 + 가져오기 + 로컬 데이터 초기화 | 전체 백업(JSON)/CSV 내보내기 | 동일 | 동일 | — |
| 로그인/로그아웃 | 로그인 | 로그아웃 / 계정 탈퇴 | 로그아웃 / 계정 탈퇴 | 로그아웃 | 로그아웃 |
| 관리자 진입 | — | — | — | — | 관리자 화면으로 이동(`/admin`) |

**편차**: "마지막 동기화 시간"은 이 앱이 오프라인 배치 동기화가 아니라 Pro/Premium/Master 모두 Supabase에
직접 실시간으로 쓰기 때문에 추적 중인 타임스탬프 자체가 없다 — 가짜 시각을 표시하지 않고 "실시간
동기화 중"이라는 정적 문구로 대체(`docs/DECISION_LOG.md` 2026-07-19). "회원탈퇴"는 실제 Edge
Function 없이 로그아웃만 수행하는 기존 동작 그대로 유지(변경 없음). "구독 관리"는 실제 스토어 딥링크
브리지 메시지가 없어 웹에서는 `window.open`으로 스토어 구독 관리 URL을 열고, 네이티브(WebView)
안에서는 "앱스토어/플레이스토어 계정에서 관리할 수 있어요" 안내 문구만 표시.

Guest 안내 문구(설정 화면 상단 배너, §4 원문 그대로, 구현 완료):

```text
무료 이용 데이터는 현재 기기에만 저장됩니다.
앱을 삭제하거나 기기 데이터를 초기화하면 데이터를 복구할 수 없습니다.
Pro 또는 Premium을 시작하면 데이터를 계정에 저장하고 다른 기기에서도 사용할 수 있습니다.
```

---

### 요금제 비교 / 결제 진입 (`/pricing`) ✅ 구현 완료(2026-07-19)

- Guest가 설정의 "요금제 보기"에서 진입(§0 라우팅상 로그인 없이도 접근 가능한 공개 라우트).
- Pro vs Premium 비교표(단어 한도/일괄 등록/공용 단어장/동기화) — `subscription_plans`에서 동적 로드.
  **마이그레이션 31 필요**: 이 테이블의 기존 RLS SELECT 정책이 `TO authenticated`만 허용해 Guest(비로그인,
  `anon` 롤)는 전혀 읽을 수 없었다 — `TO anon, authenticated`로 확장(`docs/DECISION_LOG.md` 2026-07-19).
- **가격 표시 편차**: `subscription_plans`에는애초에 가격 컬럼이 없다(한도/기능 플래그만 관리, 실제
  가격은 App Store/Play Store 소관). RevenueCat 실계정/상품이 아직 없어 동적으로 가져올 방법이 없으므로
  플레이스홀더 텍스트("월 ₩4,900 (예시 — 실제 스토어 가격 확정 전)")로 표시.
- 구매: 네이티브(WebView)에서만 `bridge.requestPurchase({planCode})` 버튼 노출(웹 브라우저에서는 "모바일
  앱에서 구독을 시작할 수 있어요" 안내만) — 비로그인 상태로 누르면 `/login`으로 이동(§5 절차 "회원가입/
  로그인 먼저"). `PURCHASE_RESULT`/`RESTORE_RESULT` 브리지 메시지를 이 페이지에서도 구독해 성공/실패
  안내 표시(전역 `useBridgeListener`의 permissions 쿼리 무효화와 별개로, 페이지 자체 UI 피드백용).
- 결제(RevenueCat) 완료 → §5 전환 모달로 진입(기존 Phase 15/16 구현 그대로).
- **회원가입 완료 직후 강제 라우팅** ✅ 구현 완료(2026-07-19, `docs/TODO.md` Phase 16 후속): `LoginPage.tsx`에서
  `signUp()` 성공 시 `web/src/lib/signupFlow.ts`의 `markSignupPending()`으로 플래그를 남기고(localStorage —
  이메일 인증 링크가 새 브라우저 컨텍스트에서 열려도 같은 기기라면 유지됨), 이메일 인증 후 세션이 생기면
  `web/src/components/onboarding/SignupPricingGate.tsx`(App.tsx의 `AuthProvider`에 마운트)가 이 플래그를 보고
  `authenticated + serviceTier==='guest'`인 사용자를 어느 화면에 있든 `/pricing`으로 되돌린다(강제 라우팅 —
  결제하거나 아래 "무료로 계속 사용하기"를 선택하기 전까지 계속 되돌아옴). 이 플래그가 켜져 있는 동안은
  아래 "만료/Master 해제/미결제 가입 → Guest 전환 안내" 모달(`DowngradeGate`)이 개입하지 않는다 —
  둘 다 같은 조건(`authenticated + guest`)에서 발동하므로 우선순위를 나눈 것.
- `/pricing`에 `showContinueFree` 섹션 추가 — 위 플래그가 켜진 사용자에게만 "무료로 계속 사용하기" 버튼을
  보여준다. 클릭 시 `useSubscriptionDowngrade`(§6과 동일 엔진)로 로컬 저장 후 로그아웃, 성공했을 때만
  플래그를 지운다(실패 시 플래그를 유지해 재시도 가능하게 함 — `DowngradeModal`과 동일한 재시도 패턴).
  기존 만료/Master 해제 사용자는 이 버튼을 보지 않고 그대로 §6 모달을 거친다(행동 변화 없음).

---

### Guest → Pro/Premium 전환 확인 모달

결제 확정(`docs/SUBSCRIPTION_DESIGN.md` §5) 직후 노출. 전체 절차는 `docs/MIGRATION_DESIGN.md` §2.

```
┌──────────────────────────────────┐
│  이 기기에 저장된 학습 데이터를    │
│  계정으로 이전하시겠습니까?        │
│                                    │
│  개인 단어장 3개 · 단어 128개      │
│  학습 기록 340건 · 복습 대상 12개  │
│  일정 5건 · 로컬 녹음 4개          │
│                                    │
│  [ 계정으로 이전 ]  [ 새로 시작 ]  │
│           [ 나중에 하기 ]          │
└──────────────────────────────────┘
```

이전 중에는 진행률(청크 처리, `docs/MIGRATION_DESIGN.md` §3-3)을 프로그레스바로 표시. 실패 시 "로컬 데이터는 안전하게 보존되어 있습니다" 안내 후 재시도 버튼.

### 만료/Master 해제/미결제 가입 → Guest 전환 안내 ✅ 구독 만료/해지 경로 구현 완료(2026-07-18, `docs/TODO.md` Phase 16), 문구 일반화(2026-07-19)

`docs/SUBSCRIPTION_DESIGN.md` §6, `docs/DATA_RETENTION_DESIGN.md` §6 절차의 클라이언트 표현. 앱 실행 시 서버에서 "인증 상태인데 유효한 서비스 권한 없음"이 확인되면 강제 모달(닫기 불가, 로컬 이전 완료 전까지 다른 화면 이동 차단)로 노출:

- 구현: `web/src/components/migration/DowngradeGate.tsx` + `DowngradeModal.tsx`(App.tsx의 `AuthProvider` 안에 `GuestMigrationGate`와 나란히 마운트), 다운로드 엔진은 `web/src/lib/migration/remoteToLocalMigration.ts`
- Master 해제 경로 ✅ 연결 완료(2026-07-18) — `DowngradeGate`의 트리거 조건(`isAuthenticated && serviceTier==='guest'`)이 구독 만료뿐 아니라 유효 구독 없이 Master가 해제된 경우도 그대로 감지하므로 별도 클라이언트 코드 추가 없이 재사용됨(`docs/MASTER_INVITATION_DESIGN.md` §4)
- 결제 이력이 아예 없는 가입(회원가입만 하고 상품을 구매한 적 없는 경우)도 동일 트리거로 감지된다 — 별도 "Free 회원" 상태를 두지 않고 이 경로로 흡수하는 것이 정책 결정(`docs/DECISION_LOG.md` 2026-07-18 "결제 없는 회원가입 미지원" 참고). 이 때문에 문구를 "구독 만료"가 아닌 "유효한 구독 없음"으로 일반화(아래 목업)했다.
- **단, 회원가입 직후 최초 진입은 이 모달보다 위 "요금제 비교 / 결제 진입"의 `SignupPricingGate`가 먼저
  가로채 `/pricing`으로 보낸다**(2026-07-19 후속 구현). `isSignupPending()` 플래그가 켜져 있는 동안
  `DowngradeGate`는 스스로 비활성화된다. 사용자가 `/pricing`에서 "무료로 계속 사용하기"를 명시적으로
  선택하면(플래그가 꺼지며) 이 모달과 동일한 로컬 저장+로그아웃 엔진이 그 자리에서 실행되고, 결제를
  완료하면 애초에 `serviceTier`가 guest가 아니게 되어 이 모달도 뜨지 않는다. 플래그가 없는 상태(다른
  기기/브라우저에서 인증을 마쳤거나, 이미 결정을 미룬 지 오래된 경우)로 앱에 들어오면 지금까지처럼
  이 모달이 그대로 동작한다.

```
┌──────────────────────────────────┐
│  유효한 구독이 없습니다.           │
│  데이터를 이 기기에 저장하고       │
│  무료로 계속 사용하시겠습니까?     │
│                                    │
│  [ 지금 저장하고 계속하기 ]        │
└──────────────────────────────────┘
```

이전 완료 후에만 로그아웃 처리 + Guest 모드로 전환(§6-3 절대 규칙).

### 데이터 삭제 예정 배너 ✅ 구현 완료(2026-07-18, `docs/TODO.md` Phase 18)

`docs/DATA_RETENTION_DESIGN.md` §6-1, §6-2 편차 — 원안의 이메일(`retention-notify`)을 앱 내 배너로 대체.
`web/src/components/retention/RetentionBanner.tsx`, `AppLayout`(홈/단어장/일정/설정 등) 상단에 항상 마운트.
`retention_schedules.status='active'`인 동안 삭제 예정일까지 상시 노출, 7일 이내로 임박하면 강조 스타일:

```
┌──────────────────────────────────┐
│ 구독이 종료되어 클라우드 데이터가  │
│ 2026.10.18에 삭제될 예정입니다.    │
│ 삭제 전 앱을 열어 데이터를 기기에  │
│ 저장하거나 구독을 복원해주세요.    │
└──────────────────────────────────┘
```

---

### 스피킹 (`/speaking`)

상세는 `docs/SPEAKING_DESIGN.md` §2~§3. 요약: 문장 목록(`SpeakingListPage`) → 문장 등록(`SpeakingSentenceFormPage`) → 녹음 화면(`SpeakingRecordPage`, TTS 듣기 + 녹음 + 내 녹음 재생 + 다시 녹음). 평가 점수/피드백 화면은 존재하지 않는다. Guest 포함 전 등급 접근 가능, 저장 위치만 등급에 따라 분기.

---

### 공용 단어장 (`/public-wordbooks`) ✅ 구현 완료(2026-07-19, `docs/ADMIN_DESIGN.md` §3)

Pro/Premium/Master 전용(`permissions.canUsePublicWordbooks` 아니면 업그레이드 안내 + `/pricing` 유도,
`/public-wordbooks`와 `/public-wordbooks/:id` 둘 다 동일하게 게이트). 게시된(`status='published'`)
공용 단어장 목록 → 단어장별 "내 단어장에 담기/담기 해제" 토글(`user_public_wordbook_enrollments`) →
`/public-wordbooks/:id`(`PublicWordbookViewPage`)에서 원본 참조 방식으로 단어 목록 열람(제목/단어
수정 불가, 원본 삭제 불가) + **"학습하기"/"퀴즈 풀기" 버튼**(2026-07-19 연동 완료) — 클릭 시
`toStudyWord()` 어댑터로 `PublicWord`+`user_public_word_progress`를 `Word` 형태로 변환해 기존
`/learn`, `/quiz` 화면을 그대로 재사용한다(진행 상태는 `user_public_word_progress`에만 저장, 개인
`study_sessions`/`study_results`에는 기록 안 함). **범위 밖**: "오늘의 복습"에 공용 단어 합치기,
여러 공용 단어장 동시 선택 학습(`docs/DECISION_LOG.md` 2026-07-19).

---

### 관리자 화면 (`/admin/**`) ✅ 구현 완료(2026-07-19)

상세는 `docs/ADMIN_DESIGN.md` §2. `AdminLayout`(`web/src/components/layout/AdminLayout.tsx`) — 하단
탭 없음, 상단 탭(홈/공용 단어장/Master 관리/감사 로그) + "앱으로 돌아가기" 링크. 사용자 개인 데이터는
어떤 화면에도 노출하지 않는다(§7-1 코드 리뷰로 확인 완료).

**관리자 홈(`/admin`)** — `AdminHomePage`, 3개 섹션(공용 단어장/Master 관리/감사 로그) 카드 목록.

**공용 단어장 관리(`/admin/wordbooks`, `/admin/wordbooks/new`, `/admin/wordbooks/:id`)** — 목록(상태
필터 탭) → 신규 생성(제목/설명/카테고리/난이도/언어) → 상세(메타 인라인 수정 + 상태 전환 드롭다운 +
단건/`.txt` 일괄등록 + 단어별 "보관" 버튼, 물리 삭제 없음). `public_wordbooks`/`public_words` 쓰기는
마이그레이션 30의 트리거가 `admin_audit_log`에 자동 기록.

**Master 관리(`/admin/masters`)** — `AdminMastersPage`:
- 초대 폼(이메일 입력 → `master-invite` 호출)
- 초대 목록(`master_invitations` 직접 조회 — RLS가 admin에게 SELECT 허용) + 행별 재발송/취소
- 현재 Master 목록(`list_masters()` RPC — profiles 테이블 자체를 열어주지 않고 필요한 컬럼만 반환) + 행별 권한 해제(`master-revoke`)

**감사 로그(`/admin/audit-log`)** — `AdminAuditLogPage`, `admin_audit_log`를 `created_at desc`로
최신 200건 직접 조회(RLS 허용, 조인 RPC 없이 `actor_id` 그대로 표시 — NULL이면 "시스템 자동 실행").

---

### Master 초대 수락 (`/master/accept`) ✅ 구현 완료(2026-07-18, 세션 기반으로 편차)

`docs/MASTER_INVITATION_DESIGN.md` §4-3, 편차는 §2 상단 참고. `?token=...` 쿼리 파라미터는 쓰지 않는다 —
초대/매직 링크를 클릭하면 Supabase가 이미 세션을 확립한 채로 이 페이지에 도착하므로, 세션이 있으면
`master-accept`를 바로 호출(빈 body)해 자동으로 처리한다. 비밀번호 생성 폼은 없음(`LoginPage`의 매직 링크
로그인 탭으로 항상 재로그인 가능). 완료 시 "Master 권한이 부여되었습니다" 표시 후 홈으로 이동, 세션이
없으면 "초대 링크가 유효하지 않습니다" 안내.
