# UI Flow

> **2026-07-18 정책 개편**: Guest는 로그인 없이 앱을 사용한다. 기존 `ProtectedRoute`의 "비로그인=무조건 `/login`" 전제가 깨지므로 §0을 먼저 확인할 것. 전제 문서: `docs/PERMISSION_DESIGN.md`(권한), `docs/DATA_STORAGE_DESIGN.md`(Repository).

---

## 0. 등급별 접근 정책

```text
anonymous(Guest)
  → 로그인 없이 앱 진입, LocalDataRepository로 즉시 사용 가능
  → 최초 진입 시 Admin이 지정한 샘플 단어장을 로컬 단어장으로 1회 자동 복사(`docs/ADMIN_DESIGN.md` §3, 2026-07-19) — 공용 단어장 화면 접근이 열리는 것은 아니고 복사된 결과만 일반 단어장처럼 보유
  → 최초 진입 시 Admin이 저장해 둔 설정값도 로컬 기본값으로 1회 자동 복사(`docs/ADMIN_DESIGN.md` §2-1, 2026-09-01) — 위 샘플 단어장과 동일한 패턴
  → 접근 불가: 공용 단어장(위 자동 복사 제외), 일괄등록, /admin, /speaking(등록/녹음 자체는 가능 — §3.4상 Guest 허용 기능이므로 접근 가능. 저장만 로컬)

authenticated + pro/master
  → 로그인 필요, RemoteDataRepository
  → Pro만 개인 단어 한도 UI 노출

authenticated + admin
  → /admin(→/admin/wordbooks로 리다이렉트) 진입 가능. UserRouteGuard가 사용자 라우트(/, /wordbooks,
    /schedules 등) 직접 접근을 /admin/wordbooks로 되돌려보낸다(2026-09-01, `docs/ADMIN_DESIGN.md` §2).
  → 일반 학습 화면(단어장/퀴즈/일정) 접근 여부는 docs/ADMIN_DESIGN.md §6 결정 필요 항목(여전히 미해결)
  → 설정(`/settings`)만 예외적으로 사용 가능하고 값이 실제로 저장된다(`docs/ADMIN_DESIGN.md` §2-1)
```

`ProtectedRoute`는 "로그인 필수 라우트"에만 적용한다(`/settings`의 계정 관리 등 극히 일부, `/admin/**`). 홈/단어장/학습/퀴즈/일정/스피킹은 Guest도 접근 가능한 **공개 라우트**로 전환하고, 내부에서 `usePermissions()`의 `serviceTier`로 Repository만 분기한다(`docs/DATA_STORAGE_DESIGN.md` §6). 이 공개 라우트 그룹은 `UserRouteGuard`(`web/src/components/layout/UserRouteGuard.tsx`)로 감싸져 있어, Admin이 이 그룹의 URL에 직접 접근하면 `/admin/wordbooks`로 리다이렉트된다. `/settings`만 `UserRouteGuard` 밖의 별도 라우트로 두어 두 역할이 공유한다.

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
| 공용 단어장 ✅ 구현 완료(2026-07-19, 2026-09-02 "담기"→복사 방식 전환) | `/public-wordbooks`, `/public-wordbooks/:id` | `WordbookListPage` 헤더 링크(탭 아님, 편차) | Pro/Master | 열람·미리보기 학습하기/퀴즈 + 개인 단어장으로 복사("내 단어장에 추가") |
| 책장(개인) ✅ 구현 완료(2026-09-08) | `/books`, `/books/:id` | 책장 | Guest 포함 전체 | 단어장과 동일 구조(+추가/수정/삭제) + 책 다중 선택 → 순차 자동재생, 상세에서 목차 추가/`.txt` 여러 파일 일괄등록/목차별 "듣기"(학습/퀴즈 없음) |
| 공용 책장 ✅ 구현 완료(2026-09-08) | `/public-books`, `/public-books/:id` | `BookshelfListPage` 헤더 링크(탭 아님) | Pro/Master | 열람 전용(다중 선택/복사 없음), 상세에서 목차별 "듣기" |
| 스피킹 | `/speaking` | 스피킹 | Guest 포함 전체 | 등록 문장 목록(`docs/SPEAKING_DESIGN.md`) |
| 스피킹 문장 등록 | `/speaking/new` | — | Guest 포함 전체 | 문장 등록/수정 |
| 스피킹 녹음 | `/speaking/:id/record` | — | Guest 포함 전체 | TTS + 녹음 + 재생 |
| 일정 | `/schedules` | 일정 | Guest 포함 전체 | 날짜 범위 검색, 날짜별 그룹 조회 |
| 요금제 비교 | `/pricing` | — | 전체(로그인 유도용) | Free/Pro 비교, 결제 진입 |
| 로그인 | `/login` | — | 비로그인 상태에서만 | Pro 결제 진입 시 또는 "기존 회원 로그인" |
| 설정 | `/settings` | 설정 | Guest 포함 전체 | 등급별 섹션 분기(§4) |
| 관리자 진입점 ✅ 구현 완료(2026-09-01) | `/admin` | — | Admin만(`ProtectedRoute` + role 체크) | `/admin/wordbooks`로 즉시 리다이렉트("홈" 개념 없음 — 관리자 하단 탭에서도 제외, `docs/ADMIN_DESIGN.md` §2) |
| 단어장(관리자) ✅ 구현 완료(2026-09-01, 라벨 통일) | `/admin/wordbooks` | 단어장 | Admin만(`ProtectedRoute requireRole="admin"`) | 단어장 목록(draft/published/hidden/archived 필터), 라벨을 사용자용과 동일하게 "단어장"으로 통일 |
| 공용 책장(관리자) ✅ 구현 완료(2026-09-08) | `/admin/books`, `/admin/books/new`, `/admin/books/:id` | 책장 | Admin만(`ProtectedRoute requireRole="admin"`) | 책 목록(draft/published/archived 필터), 상세에서 목차 수동 추가 + `.txt` 여러 파일 일괄등록(파일 하나 = 목차 1개) |
| Master 관리 ✅ 구현 완료(2026-07-18) | `/admin/masters` | Master | Admin만(`ProtectedRoute requireRole="admin"`) | 초대 폼 + 초대 목록 + 현재 Master 목록을 한 페이지에 |
| 감사 로그 ✅ 구현 완료(2026-07-19) | `/admin/audit-log` | LOG | Admin만(`ProtectedRoute requireRole="admin"`) | `admin_audit_log` 최신 200건 읽기 전용 조회 |
| Master 초대 수락 ✅ 구현 완료(2026-07-18) | `/master/accept` | — | 세션 기반(§2 편차로 토큰 아님) | `docs/MASTER_INVITATION_DESIGN.md` §4-3, 편차는 상단 참고 |

### 라우팅 구조

> Phase 20까지 완료(2026-07-19), 사용자/관리자 메뉴 분리는 2026-09-01 추가. `/master/accept`(세션 기반),
> `/admin`(→`/admin/wordbooks` 리다이렉트, "홈" 개념 폐지), `/admin/masters`(`AdminMastersPage` 단일
> 페이지), `/admin/wordbooks*`(`AdminWordbookListPage`/`AdminWordbookFormPage`/`AdminWordbookDetailPage`,
> `:id/words/new` 별도 라우트 없이 상세 페이지 인라인 폼으로 통합), `/admin/audit-log`(`AdminAuditLogPage`),
> `/public-wordbooks`·`/public-wordbooks/:id` 전부 구현 완료. `/admin/masters/invitations`(초대 상태
> 별도 분리 목록)만 편차로 만들지 않음(`AdminMastersPage`에 이미 통합돼 있어 불필요).
>
> 아래 코드 블록은 `web/src/routes/index.tsx`의 실제 라우트 구조를 요약한 것이다(`/speaking*`,
> `/wordbooks/:id/words/*`는 아직 구현되지 않은 별도 계획 문서상의 예시라 실제 코드에는 없음 — 이
> 표/코드 블록의 오래된 부분은 이번 작업 범위 밖).
>
> **2026-09-10 P0 갱신**: 공용 단어장/책장 4개 라우트에 `PublicContentGuestGuard`를 추가해 Guest의
> URL 직접 접근을 차단(`docs/launch/PHASE1_POLICY.md` §8, B안). `/privacy`, `/terms` 신설(로그인
> 여부와 무관하게 열람 가능 — Master 가입 전에도 봐야 하므로 `UserRouteGuard` 밖에 둔다).

```tsx
<Routes>
  <Route path="/login" element={<LoginPage />} />

  {/* Guest 포함 공개 라우트 — UserRouteGuard가 Admin을 /admin/wordbooks로 되돌려보낸다 */}
  <Route element={<UserRouteGuard />}>
    <Route element={<AppLayout />}>
      <Route path="/"           element={<HomePage />} />
      <Route path="/wordbooks"  element={<WordbookListPage />} />
      <Route path="/schedules"  element={<ScheduleListPage />} />
      <Route path="/books"      element={<BookshelfListPage />} />
    </Route>
    <Route path="/learn"                 element={<LearnPage />} />
    <Route path="/quiz"                  element={<QuizPage />} />
    <Route path="/quiz/complete"         element={<QuizCompletePage />} />
    <Route path="/wordbooks/:id"         element={<WordbookDetailPage />} />
    <Route path="/books/:id"             element={<BookDetailPage />} />
    <Route path="/schedules/new"         element={<ScheduleFormPage />} />
    <Route path="/schedules/:id/edit"    element={<ScheduleFormPage />} />
    <Route path="/pricing"               element={<PricingPage />} />

    {/* Guest는 메뉴 비노출 + URL 직접 접근도 차단(PublicContentGuestGuard) */}
    <Route element={<PublicContentGuestGuard />}>
      <Route element={<AppLayout />}>
        <Route path="/public-wordbooks" element={<PublicWordbookListPage />} />
        <Route path="/public-books"     element={<PublicBookListPage />} />
      </Route>
      <Route path="/public-wordbooks/:id" element={<PublicWordbookViewPage />} />
      <Route path="/public-books/:id"     element={<PublicBookViewPage />} />
    </Route>
  </Route>

  {/* /settings는 사용자/관리자 공유 — UserRouteGuard 밖 */}
  <Route element={<AppLayout />}>
    <Route path="/settings" element={<SettingsPage />} />
  </Route>

  {/* 로그인 여부와 무관하게 열람 가능(가입 전에도 봐야 함) */}
  <Route path="/privacy" element={<PrivacyPolicyPage />} />
  <Route path="/terms"   element={<TermsPage />} />

  <Route path="/master/accept" element={<MasterAcceptPage />} />

  {/* 관리자 전용 — AdminLayout(AppLayout과 동일 구조, BottomNav가 tier로 관리자 탭 자동 전환) */}
  <Route element={<ProtectedRoute requireRole="admin" />}>
    <Route element={<AdminLayout />}>
      <Route path="/admin"              element={<Navigate to="/admin/wordbooks" replace />} />
      <Route path="/admin/masters"      element={<AdminMastersPage />} />
      <Route path="/admin/wordbooks"    element={<AdminWordbookListPage />} />
      <Route path="/admin/wordbooks/new" element={<AdminWordbookFormPage />} />
      <Route path="/admin/wordbooks/:id" element={<AdminWordbookDetailPage />} />
      <Route path="/admin/books"        element={<AdminBookListPage />} />
      <Route path="/admin/books/new"    element={<AdminBookFormPage />} />
      <Route path="/admin/books/:id"    element={<AdminBookDetailPage />} />
      <Route path="/admin/audit-log"    element={<AdminAuditLogPage />} />
    </Route>
  </Route>
</Routes>
```

`ProtectedRoute`는 `requireRole` prop을 받아 `role !== 'admin'`이면 홈으로 리다이렉트하도록 확장한다(`docs/DEVELOPMENT_RULES.md`에 위배되지 않는 단순 확장).

---

## 2. 하단 탭

```
사용자: [ 홈 ]  [ 단어장 ]  [ 책장 ]  [ 일정 ]  [ 설정 ]
관리자: [ 단어장 ]  [ 책장 ]  [ Master ]  [ LOG ]  [ 설정 ]
```

기존 "Phase 10 이후 추가 예정"이었던 5탭(스피킹 포함) 구성은 아직 스피킹 탭이 구현되지 않아 실제로는
4탭이다. **Admin은 별도 레이아웃이 아니라 같은 `BottomNav`(`web/src/components/layout/BottomNav.tsx`)를
공유하되, `usePermissions().serviceTier==='admin'`이면 탭 목록 자체가 자동으로 관리자용으로 바뀐다**
(2026-09-01) — 홈/일정 대신 Master/LOG를 보여주고, 단어장은 `/admin/wordbooks`로, 설정은 사용자와 동일한
`/settings`를 그대로 가리킨다(§0). Master/LOG 아이콘은 `web/public/menu-master(.svg/-on.svg)`,
`menu-log(.svg/-on.svg)`.

> BottomNav 레이아웃: `w-fit mx-auto` (fit-content 중앙 정렬) + `gap-5` 아이콘 간격 + 하단 `max(calc(env(safe-area-inset-bottom) + 10px), 1.25rem)` 패딩

---

## 3. 화면별 상세

### 홈 (`/`)

```
┌──────────────────────────────────┐  ← 배경색 A (학습영역)
│  [복습 단어 카드] [신규 단어 카드]  │
│      ← 스와이프 →                 │
│  [  학습하기  ] [▶]  [ Quiz Start ]│
└──────────────────────────────────┘
┌──────────────────────────────────┐  ← 배경색 B (Today)
│  Today                           │
│  10:00  팀 미팅                  │
│  ...                             │
└──────────────────────────────────┘
       (자동재생 중에만) 하단에 미니 플레이어 바
```

- 학습영역: 복습 단어 1개 + 신규(`status = 'unseen'`) 단어 1개 스와이프 카드
- 학습하기 → `/learn`, Quiz Start → `/quiz`
- Today: 오늘 일정 전체 노출 (앞으로 30일, 최대 3건)
- **자동재생** ✅ 구현 완료(2026-09-07): "학습하기" 버튼 옆 재생 아이콘 버튼으로 시작(항상 처음부터
  새로 재생만 하는 버튼 — 토글 아님, 일시정지/다음 전환은 미니 플레이어에서). 자세한 동작은 아래
  "자동재생(공통)" 참고.

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
- **일괄등록 버튼**: `permissions.canBulkImport`가 true인 등급(Pro/Master)에서만 노출. Guest는 버튼 자체를 숨기고, Pro는 한도 초과 상태(`docs/SUBSCRIPTION_DESIGN.md` §5-1)면 버튼은 노출하되 클릭 시 안내 모달로 대체
- **공용 단어장 진입** ✅ 구현 완료(2026-07-19, 편차): 세그먼트 탭 대신 헤더의 "공용 단어장" 링크(`permissions.canUsePublicWordbooks`일 때만 노출)로 `/public-wordbooks`로 이동하는 방식으로 단순화
- **자동재생** ✅ 구현 완료(2026-09-07): 1개 이상 선택 시 나오는 학습하기/문제풀기 버튼 사이에 재생
  아이콘 버튼 추가(선택한 단어를 비동기로 불러온 뒤 재생 시작, 항상 새로 시작만 함 — 토글 아님).
  자세한 동작은 아래 "자동재생(공통)" 참고.

---

### 학습하기 (`/learn`)

- `navigation.state.words: Word[]`로 단어 수신
- 카드 스크롤 (세로 스와이프)
- 각 카드: term + definition + description + TTS 버튼
- 하단 "학습 완료" 버튼 → `study_sessions.completed_at` 업데이트 → 뒤로
- **자동재생** ✅ 구현 완료(2026-09-07): 목록 하단에 항상 노출되는 슬림 버튼("자동재생", 토글 아님 —
  항상 첫 단어부터 새로 시작). 재생 중엔 현재 카드가 화면 중앙으로 스크롤 + 테두리 하이라이트된다.
  자세한 동작은 아래 "자동재생(공통)" 참고.

---

### 자동재생(공통) — 홈 캐러셀 / 학습하기 목록 / 단어장 선택

전역 상태(`web/src/stores/autoplayStore.ts`, Zustand)로 구현되어 있어 **특정 페이지에 묶이지 않는다**
— 페이지를 이동해도 재생이 끊기지 않고, 미니 플레이어(`GlobalAutoPlayBar`, 앱 루트에 한 번만 마운트)도
어느 화면에서든 같은 위치에 뜬다.

- **재생 대상**: 각 페이지의 "재생" 버튼은 그 화면의 단어 목록으로 `start(items)`를 호출하는
  진입점일 뿐이다 — 재생/일시정지 전환·이전/다음은 전부 미니 플레이어(`AutoPlayBar`) 버튼에서만
  한다(페이지 버튼은 토글하지 않음).
- **읽는 내용** ✅ 확장 완료(2026-09-07, 2026-09-08 "설명"→"예문" 필드 통합): 단어 하나당
  **단어 → 뜻 → 예문** 순서로 전부 읽는다(`web/src/lib/autoplaySegments.ts`의
  `buildAutoPlaySegments()`). 단어/예문은 원어(`en-US` 등), 뜻은 한국어(`ko-KR`)로 언어를 바꿔가며
  읽고, 세그먼트 사이는 짧게(350ms), 단어와 단어 사이는 좀 더 길게(기본 1초) 쉬며, 배속(0.5x~1.5x,
  아래 참고)도 함께 적용된다. 미니 플레이어에 보이는 캡션(예문 우선, 없으면 뜻)은 표시 전용이고
  실제로 읽는 내용과는 별개다.
- **순서**: 설정 → 학습 → "단어 순서"(기본값 랜덤)를 그대로 따른다 — 퀴즈 문제 순서와 같은 설정을
  공유한다.
- 미니 플레이어 바(`web/src/components/autoplay/AutoPlayBar.tsx`): 어두운 배경, 현재 단어(굵게) +
  "n/전체" 위치 표시 + 캡션 + 배속(0.5x~1.5x) 알약 버튼 + 이전(⏮)/재생·일시정지(⏯)/다음(⏭) 버튼,
  카드 바깥 위에 분리된 닫기(✕) 버튼. 재생이 시작된 순간에만 나타나고, 끝까지 재생하거나 닫기를
  누르면 사라진다(인덱스 0으로 리셋). 이전/다음은 순환한다(마지막에서 다음→첫 단어, 첫 단어에서
  이전→마지막). 배속 알약을 누르면 슬라이더 패널이 펼쳐지며(`autoplayStore.ts`의 `rate`/`setRate()`),
  값은 세션을 닫아도 유지된다.
- **웹(브라우저)**: 백그라운드 보장 없이 `speechSynthesis` 완료 콜백 기반으로 스토어가 직접 순차
  스케줄링한다. 탭이 보이는 동안만 정상 동작.
- **앱(RN 래퍼)**: 재생 시작 시 전체 단어의 세그먼트 목록을 네이티브(`AUTOPLAY_START`)로 한 번에
  전달하고, 이후 순차 재생/타이머는 `mobile/App.tsx`의 RN JS 스레드가 전담해 화면 잠금/백그라운드에서도
  이어진다(iOS `UIBackgroundModes: audio` + Android 잠금화면 컨트롤용 무음 오디오 세션 유지,
  `expo-audio`). 이전/다음은 절대 인덱스가 아니라 상대 이동(`AUTOPLAY_STEP`)만 보내 네이티브가 현재
  위치의 유일한 진실이 되게 한다. 왜 웹뷰가 아니라 네이티브가 시퀀싱하는지, 그리고
  `WEB_READY`(`bridge.ready()`) 누락으로 네이티브→웹 메시지가 전부 유실됐던 근본 원인은
  `docs/DECISION_LOG.md` 2026-09-07 항목 참고.

---

### 퀴즈 (`/quiz`)

- `navigation.state.words: Word[]`로 단어 수신
- localStorage 이어하기: 24시간 TTL, 이어하기/새시작 선택 UI
- Quiz 컴포넌트: 객관식(4지선다) 또는 주관식 입력
- 주관식 음성 입력 ✅ 2026-09-08 변경: 마이크 버튼을 **눌러서 녹음, 손을 떼면 종료**(walkie-talkie
  방식)로 변경 — 무음 감지로 애매하게 자동 종료되던 것 대신 사용자가 직접 시작/끝을 통제한다
  (`onPointerDown`/`onPointerUp`, `continuous: true`)
- 정답 → AnswerReveal (term + definition + example) → 다음
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

공통(전 등급): **학습**(퀴즈 기본 모드, 단어 순서 — 자동재생도 이 설정을 그대로 따름), **복습**(주기/정책), **알림**(일정/복습 토글+시간) — 기존 그대로 유지, `profiles`(Remote) 또는 `settings`(Local) 낙관적 업데이트로 저장소만 분기.

등급별 **계정** 섹션(§23 원문 기준):

| 섹션 | Guest | Pro | Master | Admin |
|---|---|---|---|---|
| 저장 위치 안내 | "현재 기기에 저장 중" | 계정 정보 | 계정 정보 + Master 권한 표시 | 관리자 권한 표시 |
| 단어 등록 상태 | 제한 없음 표시 + 로컬 저장 용량 안내 | 현재 수/한도/신규 등록 가능 여부 | 무제한 표시 | — |
| 동기화 | — | ~~마지막 동기화 시간~~ "실시간 동기화 중"(편차, 아래 참고) | 동일 | — |
| 결제 | 요금제 보기(`/pricing`) | 구독 관리(2026-09-02: Premium 폐지로 업그레이드 CTA 제거, 아래 참고) | **비노출**(무료 지정 계정) | 비노출 |
| 데이터 ✅ 구현 완료(2026-07-19) | 전체 백업(JSON)/CSV 내보내기 + 가져오기 + 로컬 데이터 초기화 | 전체 백업(JSON)/CSV 내보내기 | 동일 | — |
| 로그인/로그아웃 | 로그인 | 로그아웃 / 계정 탈퇴 | 로그아웃 | 로그아웃 |
| 관리자 진입 | — | — | — | ~~관리자 화면으로 이동(`/admin`)~~ 제거됨(2026-09-09) — BottomNav가 이미 admin 전용 탭으로 직접 이동 가능해 중복이었음 |

**편차**: "마지막 동기화 시간"은 이 앱이 오프라인 배치 동기화가 아니라 Pro/Master 모두 Supabase에
직접 실시간으로 쓰기 때문에 추적 중인 타임스탬프 자체가 없다 — 가짜 시각을 표시하지 않고 "실시간
동기화 중"이라는 정적 문구로 대체(`docs/DECISION_LOG.md` 2026-07-19). **"회원탈퇴"는 2026-09-10(P0)부터
`master-delete-account` Edge Function을 호출해 계정(Auth) 자체를 삭제한다** — 이전에는 로그아웃만
수행하는 스텁이었다(`docs/launch/PHASE1_POLICY.md` §3.5). "구독 관리"는 실제 스토어 딥링크
브리지 메시지가 없어 웹에서는 `window.open`으로 스토어 구독 관리 URL을 열고, 네이티브(WebView)
안에서는 "앱스토어/플레이스토어 계정에서 관리할 수 있어요" 안내 문구만 표시.

Guest 안내 문구(설정 화면 상단 배너, §4 원문 그대로, 구현 완료):

```text
무료 이용 데이터는 현재 기기에만 저장됩니다.
앱을 삭제하거나 기기 데이터를 초기화하면 데이터를 복구할 수 없습니다.
Pro를 시작하면 데이터를 계정에 저장하고 다른 기기에서도 사용할 수 있습니다.
```

---

### 요금제 비교 / 결제 진입 (`/pricing`) ✅ 구현 완료(2026-07-19)

- Guest가 설정의 "요금제 보기"에서 진입(§0 라우팅상 로그인 없이도 접근 가능한 공개 라우트).
- Free vs Pro 비교표(2026-09-02: Premium 폐지로 Pro/Premium 비교에서 Free/Pro 비교로 전환,
  `docs/DECISION_LOG.md` 2026-09-02) — Free 카드는 Guest 권한(`GUEST_PERMISSIONS`)을 그대로 보여주는
  고정 카드, Pro 카드만 `subscription_plans`에서 동적 로드(단어 한도/일괄 등록/공용 단어장). "저장 위치"
  한 줄에 동기화 여부까지 함께 표기(이 앱에서는 저장 위치와 동기화가 1:1로 묶여 있어 별도 행으로
  중복 표시하지 않음, 사용자 지적으로 2026-09-02 통합).
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
- **⚠️ 2026-09-10(P0)부터 이 아래 흐름 전체가 도달 불가 상태다.** `LoginPage.tsx`의 회원가입 탭 자체를
  제거했고(`docs/launch/PHASE1_POLICY.md` §1, 1차엔 일반 회원가입이 없음), `resolveServiceTier()`/
  `get_service_tier()`의 "로그인만 하면 Pro" 폴백도 영구 제거해 `authenticated + serviceTier==='guest'`
  조합 자체가 정상적으로는 발생하지 않는다. `SignupPricingGate`/`DowngradeGate`/`markSignupPending` 등
  아래 설명된 코드는 삭제하지 않고 그대로 남겨뒀다(`docs/launch/PHASE1_POLICY.md` §12 — 2차에 다시
  연결). 아래는 2차 재개 시 참고할 기존 설계 그대로다.
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

### Guest → Pro 전환 확인 모달

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

Pro/Master 전용(`permissions.canUsePublicWordbooks` 아니면 업그레이드 안내 + `/pricing` 유도,
`/public-wordbooks`와 `/public-wordbooks/:id` 둘 다 동일하게 게이트). 게시(`published`) 또는 기본
(`default`) 상태인 공용 단어장 목록에 뒤로가기 버튼 + 단어장별 **"내 단어장에 추가"** 버튼
(2026-09-02부터: 등록/해제 토글이 아니라 개인 `wordbooks`/`words`로 실제 **복사** — `docs/ADMIN_DESIGN.md`
§3-1) → 복사 성공 시 `/wordbooks/:id`(방금 만들어진 개인 단어장 상세)로 이동, 이후 일반 단어장과 완전히
동일하게 수정·삭제·단어 추가 가능. 버튼은 항상 다시 누를 수 있고(실수로 삭제했거나 다시 받고 싶은 경우
대비), 이미 담은 적이 있으면 제목 옆에 체크 배지만 표시된다(취소 기능은 없음).
`/public-wordbooks/:id`(`PublicWordbookViewPage`)는 여전히 원본을 참조 방식으로 미리보기 열람(제목/단어
수정 불가, 원본 삭제 불가) + **"학습하기"/"퀴즈 풀기" 버튼**(2026-07-19 연동 완료, "담기" 여부와 무관하게
항상 사용 가능) — 클릭 시 `toStudyWord()` 어댑터로 `PublicWord`+`user_public_word_progress`를 `Word`
형태로 변환해 기존 `/learn`, `/quiz` 화면을 그대로 재사용한다(진행 상태는 `user_public_word_progress`에만
저장, 개인 `study_sessions`/`study_results`에는 기록 안 함 — "담기"로 복사된 사본의 학습은 반대로 일반
개인 단어장과 동일하게 이 경로를 탄다). **범위 밖**: "오늘의 복습"에 공용 단어 합치기, 여러 공용 단어장
동시 선택 학습(`docs/DECISION_LOG.md` 2026-07-19).

---

### 책장 (`/books`) ✅ 구현 완료(2026-09-08, `docs/ADMIN_DESIGN.md` §8)

단어장과 동일하게 **Guest 포함 전체 등급**이 자기 책을 직접 만들 수 있다(개인 소유,
`DataRepository` 경유). 헤더에 **"+추가"**(이름+언어, 단어장 추가 폼과 동일) 버튼과, Pro/Master
에게만 보이는 **"공용 책장"** 링크(`/public-books`로 이동, 단어장의 "공용 단어장" 링크와 동일
위치/패턴)가 있다. 목록은 체크박스로 **다중 선택**할 수 있고(`WordbookListPage`의 선택 패턴 재사용),
하나 이상 선택하면 하단 액션바에 **"선택한 책 자동재생"** 버튼 하나만 뜬다(학습/퀴즈 버튼 없음) —
선택 순서 → 책 안에서는 목차 순서로 이어 붙여 순차 재생(랜덤 아님). `/books/:id`(`BookDetailPage`)는
단어장 상세와 동일하게 목차 추가/수정/삭제 + **`.txt` 여러 파일 일괄등록**(파일 하나 = 목차 1개,
`permissions.canBulkImport` 게이트)을 지원하고, 목차별 **"듣기"** 버튼을 누르면 그 책의 전체 목차를
탭한 지점부터 재생목록으로 시작한다(미니 플레이어 이전/다음으로 같은 책의 다른 목차 이동). 제목/내용은
책의 언어 설정과 무관하게 항상 **영어 원음**으로 읽는다. 학습하기·퀴즈·복습 진행률 추적은 전혀
없다 — 순수 읽기·듣기 콘텐츠.

### 공용 책장 (`/public-books`) ✅ 구현 완료(2026-09-08, `docs/ADMIN_DESIGN.md` §8)

공용 단어장과 동일한 게이트(Pro/Master, `permissions.canUsePublicWordbooks`) + 동일한 열람 전용
패턴 — `BookshelfListPage` 헤더의 "공용 책장" 링크로 진입, 게시된 책 목록을 하나씩 탭해 상세로
이동(다중 선택/자동재생/개인 책장으로 복사 없음 — 공용 단어장의 "담기"에 해당하는 기능은 책장에는
없다). `/public-books/:id`(`PublicBookViewPage`)는 목차 목록을 읽기 전용으로 보여주고(제목 탭하면
내용 펼침/접힘), 목차별 "듣기"는 개인 책장과 동일하게 동작한다.

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

**공용 책장 관리(`/admin/books`, `/admin/books/new`, `/admin/books/:id`)** ✅ 구현 완료(2026-09-08) —
목록(초안/게시/보관 필터) → 신규 생성(제목/언어(선택)/상태) → 상세(메타 인라인 수정 + 목차 수동
추가(제목+내용) + **`.txt` 여러 파일 일괄등록**). 여기서 관리하는 건 "공용 책장"(`public_books`/
`public_book_chapters`)이고, 사용자가 직접 만드는 개인 책장(`books`/`book_chapters`)과는 완전히
별개 테이블이다. 일괄등록은 공용 단어장과 방식이 다르다 — 파일 하나 = 목차 1개, 제목은 파일명
(확장자 제외), 파일명 순서(자연 정렬)대로 등록(`docs/ADMIN_DESIGN.md` §8-4). `public_books`/
`public_book_chapters` 쓰기도 마이그레이션 41의 트리거가 `admin_audit_log`에 자동 기록.

**Master 관리(`/admin/masters`)** — `AdminMastersPage`:
- 초대 폼(이메일 입력 → `master-invite` 호출)
- 초대 목록(`master_invitations` 직접 조회 — RLS가 admin에게 SELECT 허용) + 행별 재발송/취소
- 현재 Master 목록(`list_masters()` RPC — profiles 테이블 자체를 열어주지 않고 필요한 컬럼만 반환) + 행별 권한 해제(`master-revoke`)

**감사 로그(`/admin/audit-log`)** — `AdminAuditLogPage`, `admin_audit_log`를 `created_at desc`로
최신 200건 직접 조회(RLS 허용, 조인 RPC 없이 `actor_id` 그대로 표시 — NULL이면 "시스템 자동 실행").

---

### Master 초대 수락 (`/master/accept`) ✅ 구현 완료(2026-07-18, 세션 기반으로 편차 / 2026-09-10 동의 폼+비밀번호 추가)

`docs/MASTER_INVITATION_DESIGN.md` §4-3, 편차는 §2 상단 참고. `?token=...` 쿼리 파라미터는 쓰지 않는다 —
초대/매직 링크를 클릭하면 Supabase가 이미 세션을 확립한 채로 이 페이지에 도착한다.

**2026-09-10(P0) 변경**: 세션이 확인되면 더 이상 `master-accept`를 곧바로 호출하지 않는다. 대신
① 비밀번호 / 비밀번호 확인 입력(6자 이상, 둘이 일치해야 함) ② `[필수] 이용약관에 동의합니다`(체크박스,
`/terms`로 링크) ③ `[필수] 만 14세 이상입니다`(체크박스)와, 체크박스가 아닌 개인정보처리방침 안내
문구 + `/privacy` 링크를 먼저 보여주고, 비밀번호 2칸 + 체크박스 2개를 모두 채워야 "가입 완료하기"
버튼이 활성화된다(`docs/launch/PHASE1_POLICY.md` §3.2, §5). 제출 시 먼저
`supabase.auth.updateUser({ password })`로 비밀번호를 설정한 뒤, `master-accept`를
`{ agreedTerms: true, agreedAge: true, policyVersion }` body로 호출 — 서버가 다시 검증 후
`user_policy_agreements`에 `terms`/`age_eligibility` 두 행을 기록한다. 실패하면 폼으로 돌아가 인라인
에러만 보여준다(입력값 유지). 완료 시 "Master 권한이 부여되었습니다" 표시 후 홈으로 이동, 세션이 없으면
"초대 링크가 유효하지 않습니다" 안내.

**2026-09-10 추가 수정**: 원래 "비밀번호 생성 폼 없음"(LoginPage 매직 링크로만 재로그인)으로 편차를
뒀었으나, 이건 `docs/launch/PHASE1_POLICY.md` §3.2가 이미 5번 단계로 "비밀번호 설정"을 명시하고 있던
것과 어긋난 상태였다 — 최초 P0 구현 때 놓친 부분을 이번에 바로잡았다. 비밀번호를 설정해도 매직 링크
로그인은 계속 가능(두 방식 모두 지원, 배타적이지 않음).

---

### 비밀번호 재설정/변경 ✅ 구현 완료(2026-09-10)

Master/Admin 대상(비밀번호로 로그인하는 계정 전부, Guest는 계정이 없어 해당 없음). Pro는 2차에
공유 코드로 자동 적용되나 1차 기능 명세엔 노출하지 않는다.

**로그인 상태에서 변경(`SettingsPage` "계정" 섹션 "비밀번호 변경")**: 현재 비밀번호 / 새 비밀번호 /
새 비밀번호 확인 3칸을 인라인으로 펼쳐서 입력받고, `supabase.auth.updateUser({ password,
current_password })`(`current_password` 방식, `@supabase/supabase-js` 2.107.0 지원) 호출. **서버
(Supabase Dashboard)의 "Secure password change" 옵션이 꺼져 있으면 `current_password` 검증이 실제로
강제되지 않을 수 있어** 실기기 QA로 확인 필요.

**로그인 못 하는 상태에서 재설정(`LoginPage` "로그인" 탭 하단 "비밀번호를 잊으셨나요?")**: 클릭하면
탭 대신 이메일 입력 + "재설정 메일 보내기" 폼으로 전환("로그인으로 돌아가기" 링크로 복귀).

**2026-09-10 방침 변경**: 처음엔 "계정 존재 여부를 추론할 수 없도록 성공/실패 관계없이 항상 동일한
문구"로 구현했으나(Supabase의 `resetPasswordForEmail()`이 원래 그렇게 설계돼 있음 — 항상 성공
응답), 사용자가 이를 뒤집어 **가입된 이메일에만 메일을 보내고 아니면 명확한 에러를 보여달라**고
재요청했다. `resetPasswordForEmail()` 자체는 여전히 존재 여부를 노출하지 않으므로, 먼저
`email_exists(p_email)` RPC(마이그레이션 47, `is_admin()`/`list_masters()`와 같은 SQL
SECURITY DEFINER 패턴, `anon`도 호출 가능)로 가입 여부를 확인한 뒤에만
`resetPasswordForEmail(email, { redirectTo: origin + '/reset-password' })`를 호출한다.
- 가입 안 된 이메일 → "가입되지 않은 이메일입니다. 메일 주소를 확인해주세요."
- 가입된 이메일 → 메일 발송 후 "입력하신 이메일로 비밀번호 재설정 안내를 보냈습니다."
- 이 방식 자체가 이메일 가입 여부를 노출하는 선택(account enumeration)이라는 점은 인지된 트레이드오프
  — 지난번 링크 로그인(`shouldCreateUser: false`)과 동일한 사용자 판단(초대 전용 서비스라 리스크 낮음).

**신규 라우트 `/reset-password`(`ResetPasswordPage`)**: `UserRouteGuard` 밖에 위치(`/master/accept`,
`/privacy`, `/terms`와 동일). 단순히 세션 존재 여부만으로 폼을 열지 않는다 — 이미 로그인된 사용자가
URL을 직접 입력해 들어온 경우와 실제 재설정 메일 링크로 들어온 경우를 구분해야 하므로,
`App.tsx`의 `AuthProvider`가 `supabase.auth.onAuthStateChange()`의 `'PASSWORD_RECOVERY'` 이벤트를
감지해 `authStore.isPasswordRecovery`에 기록하고, 이 값이 true일 때만 새 비밀번호 폼을 연다(이
프로젝트는 `flowType` 기본값 `implicit` — URL 해시 기반 세션 확립, `MasterAcceptPage`와 동일한
메커니즘). `isPasswordRecovery`가 false면 "비밀번호 재설정 링크가 유효하지 않습니다" 안내.
`DowngradeGate`의 예외 경로 목록에도 추가(다른 세 라우트와 동일한 이유).

**`web/src/lib/authErrors.ts`** — `LoginPage`/`MasterAcceptPage`/`SettingsPage`/`ResetPasswordPage`가
전부 공유하는 GoTrue 에러 한국어 번역 테이블(2026-09-10 통합).

---

### 개인정보처리방침 / 이용약관 (`/privacy`, `/terms`) ✅ 구현 완료(2026-09-10, P0 §6)

`SettingsPage`의 "정보" 섹션과 `MasterAcceptPage`의 동의 폼에서 링크로 진입. 로그인 여부와 무관하게
열람 가능(`UserRouteGuard` 밖 라우트). 마크다운 렌더러를 새로 들이지 않고, `docs/legal/PRIVACY_POLICY_
PHASE1.md`/`TERMS_PHASE1.md` 원문(내부 검토용 상태 배너·체크리스트·수정이력은 제외, 본문과
`[확인 필요]` 표시는 그대로 보존)을 `web/public/legal/privacy-policy.md`/`terms.md`로 복사해 두고
`fetch()`로 읽어 `<pre>`로 그대로 보여주는 최소 구현(`LegalDocumentPage` 공용 컴포넌트). **docs/legal
원문이 갱신되면 `web/public/legal/*.md` 사본도 함께 수동으로 갱신해야 한다**(빌드 산출물이 `docs/`
디렉토리 밖 파일을 직접 참조할 수 없어 자동 동기화가 아님 — 2차에서 빌드 스텝으로 자동화 검토 여지).
