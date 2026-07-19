# Moroutine — 설계 문서

> 현재 최종 상태만 기록. 변경 이력은 DECISION_LOG.md 참고.

---

## 1. 서비스 개요

하이브리드 WebView 기반 학습 루틴 / 단어 암기 앱.  
Web App(React)을 React Native WebView 안에서 실행하며, 알림·TTS 등 네이티브 기능은 Bridge를 통해 처리한다.

**2026-07-18 무료·유료·관리자 정책 전면 개편**: 사용자 유형을 Guest(비로그인·로컬 저장) / Pro·Premium(유료·서버 저장) / Master(관리자 지정 무료·서버 저장) / Admin(공용 콘텐츠 관리 전용)으로 재정의했다. 상세 설계는 아래 하위 문서 참고 — 이 문서(DESIGN.md)는 SSOT로서 아키텍처 개요만 유지하고, 정책·스키마 상세는 각 문서에 위임한다.

| 문서 | 범위 |
|---|---|
| `docs/PERMISSION_DESIGN.md` | 인증상태/역할/서비스권한 3축 모델, `buildPermissions()`, RLS 판정 함수 |
| `docs/SUBSCRIPTION_DESIGN.md` | 구독 상태 머신, RevenueCat Webhook, Pro 단어 한도, 사용자 상태 전이 26종 |
| `docs/DATA_STORAGE_DESIGN.md` | Repository 계층, Guest 로컬 DB(IndexedDB), Export/Import |
| `docs/MIGRATION_DESIGN.md` | Guest↔Remote 데이터 이전 엔진(Idempotency/청크/롤백) |
| `docs/ADMIN_DESIGN.md` | 공용 단어장 CRUD, 관리자 접근 범위, 감사 로그 |
| `docs/MASTER_INVITATION_DESIGN.md` | Master 초대·해제 |
| `docs/DATA_RETENTION_DESIGN.md` | 3개월 데이터 보관/알림/삭제 |
| `docs/SPEAKING_DESIGN.md` | 스피킹 기능(평가 없음 — 문장/TTS/녹음만) |

> AI 발음 평가 서비스는 제공하지 않는다(폐지, `docs/DECISION_LOG.md` 2026-07-18).

---

## 2. 기술 스택

| 영역 | 선택 |
|------|------|
| 웹 프론트엔드 | React + TypeScript + Vite + Tailwind CSS |
| 상태관리 | Zustand (로컬 UI 상태) + TanStack Query (서버 데이터 + 권한 조회) |
| Guest 로컬 저장 | IndexedDB (Dexie.js) — `docs/DATA_STORAGE_DESIGN.md` |
| 데이터 접근 계층 | Repository 패턴(Local/Remote/AdminContent) — `docs/DATA_STORAGE_DESIGN.md` §6 |
| 네이티브 | React Native + Expo + react-native-webview |
| 알림 | expo-notifications (로컬 알림) |
| 백엔드 | Supabase (Auth + PostgreSQL + PostgREST + Edge Functions) |
| 결제 | RevenueCat (인앱 결제, Webhook → Edge Function) — `docs/SUBSCRIPTION_DESIGN.md` §3 |
| TTS | Web: Web Speech API / Native: expo-speech (Bridge 경유) |

---

## 3. 전체 아키텍처

```
[iOS / Android]
  └── React Native (Expo)
       ├── expo-notifications    ← 로컬 알림
       └── WebView
            ├── onMessage()      ← 웹 → 네이티브
            └── injectJavaScript() ← 네이티브 → 웹

[Web App — React + Vite]
  ├── Zustand              ← authStore, settingsStore (로컬 UI 상태만)
  ├── TanStack Query       ← 서버 데이터 캐시 + usePermissions() (docs/PERMISSION_DESIGN.md §9)
  ├── Repository 계층      ← LocalDataRepository / RemoteDataRepository / AdminContentRepository
  │                           (docs/DATA_STORAGE_DESIGN.md §6, Factory가 serviceTier로 선택)
  ├── Local DB(IndexedDB)  ← Guest 정본 데이터
  └── Supabase Client      ← Auth + PostgREST + RPC(create_words_checked 등)
```

화면 컴포넌트는 `getRepository(tier)`가 반환한 `DataRepository`만 호출한다 — Local/Remote를 직접 분기하지 않는다(`docs/DATA_STORAGE_DESIGN.md` §6).

### 알림 처리 흐름

```
[웹] 일정 저장 (alarm_minutes ≠ null)
  → notifications INSERT
  → Bridge: SCHEDULE_NOTIFICATION { id, title, body, fireAt }

[RN] expo-notifications.scheduleNotificationAsync()
  → Bridge 응답: NOTIFICATION_RESULT { id, nativeId, success }

[웹] NOTIFICATION_RESULT 수신
  → notifications UPDATE SET native_id = nativeId
```

---

## 4. 학습/복습 알고리즘

### 단어 상태

| 컬럼 | 설명 |
|------|------|
| `status` | `unseen` \| `learning` \| `reviewing` \| `mastered` |
| `review_step` | 0: 비복습 / 1~N: 복습 단계 |
| `first_passed_at` | 최초 퀴즈 통과 시각, 이후 갱신 없음 |
| `next_review_at` | mastered 시 NULL |
| `wrong_count` | 오답 누적, 감소 없음 |

> 학습하기(Learn)는 status 변경 없음. 퀴즈(Quiz/ReviewQuiz)만 상태를 전이시킨다.

### 상태 전이 (퀴즈 정답)

복습 주기는 사용자 설정 `reviewIntervals: string[]` (예: `['7d','30d','90d']`)을 따른다.

```
최초 통과 (unseen|learning → reviewing):
  status = 'reviewing', review_step = 1
  first_passed_at = now()  (null일 때만)
  next_review_at  = first_passed_at + intervals[0]

N차 복습 통과 (review_step = N):
  next_step = N + 1
  next_step > intervals.length → mastered (review_step=0, next_review_at=null)
  next_step ≤ intervals.length → review_step=next_step, next_review_at = first_passed_at + intervals[next_step-1]
```

### 복습 정책 (reviewPolicy)

- `keep` (기본): 오답 시 review_step 유지, wrong_count만 증가
- `downgrade`: 오답 시 단계 강등
  - step=1 실패 → 재도전 (next_review_at = now + intervals[0])
  - step=2 실패 → step=1 강등
  - step≥3 실패 → step-1 강등

### 구현 위치

```typescript
// src/lib/wordStatus.ts
applyQuizAnswer(word, isCorrect, { reviewIntervals, reviewPolicy }): Promise<void>
```

---

## 5. WebView Bridge

### 메시지 타입

```typescript
// 웹 → 네이티브 (BridgeOutbound)
SCHEDULE_NOTIFICATION  { id, title, body, fireAt }
CANCEL_NOTIFICATION    { id }   // id = native_id
REQUEST_PERMISSION     { permission }
SPEAK_TEXT             { text, lang }
STOP_SPEECH
WEB_READY
GET_APP_VERSION
START_STT              { lang }
STOP_STT
SET_USER_ID            { userId: string | null }   // Phase 16 — RevenueCat app_user_id를 Supabase user_id와 동기화
PURCHASE_REQUEST       { planCode: 'pro' | 'premium' }   // Phase 16
RESTORE_PURCHASES      // Phase 16
// Phase 10 예정 (WebView 녹음 불가 시 폴백)
START_RECORDING        { signedUrl: string; storagePath: string }
STOP_RECORDING

// 네이티브 → 웹 (BridgeInbound)
NOTIFICATION_RESULT    { id, nativeId, success }
PERMISSION_RESULT      { permission, granted }
APP_VERSION            { version }
STT_RESULT             { transcript, final }
PURCHASE_RESULT        { success, error? }   // Phase 16 — 결제 성공/실패 자체를 권한으로 신뢰하지 않고, 재조회 트리거로만 사용
RESTORE_RESULT         { success, error? }   // Phase 16
// Phase 10 예정
RECORDING_COMPLETE     { storagePath: string; mimeType: string; durationMs: number }
RECORDING_ERROR        { message: string }
```

### 웹 측 구현

- `src/bridge/index.ts`: `bridge.*` 유틸 + `registerBridgeListener`
- `src/hooks/useBridgeListener.ts`: App.tsx에서 호출, NOTIFICATION_RESULT → DB 업데이트, PURCHASE_RESULT/RESTORE_RESULT → `['permissions', userId]` 쿼리 무효화

---

## 6. Zustand Store 구조

```typescript
// authStore.ts
interface AuthState {
  user: User | null
  session: Session | null
  isLoading: boolean
  setSession(session: Session | null): void
  setLoading(v: boolean): void
  signOut(): void
}

// settingsStore.ts
interface SettingsState {
  settings: UserSettings
  isLoaded: boolean
  setSettings(s: UserSettings): void
  patchSettings(partial: Partial<UserSettings>): void
}

// permissions는 Zustand가 아니라 TanStack Query로 관리한다 — 서버 조회 값이므로
// docs/PERMISSION_DESIGN.md §9의 usePermissions() 훅(key: ['permissions']) 참고.
// planStore.ts(Beta/Free/Premium, 구 Phase 10 계획)는 폐기 — 대체: usePermissions()

// speakingSessionStore.ts (신규 스피킹 설계, 평가 없음 — docs/SPEAKING_DESIGN.md)
interface SpeakingSessionState {
  isRecording: boolean
  currentSentenceId: string | null
  setRecording(v: boolean): void
  setCurrentSentence(id: string | null): void
  reset(): void
}
```

---

## 7. TanStack Query 구조

```typescript
// useStudyWords.ts
useTodayStudyWords()           // key: ['todayStudyWords'] — 오늘의 학습 단어
applyQuestionOrder(words, order)  // 순수 함수
buildQuizWords(words)          // Word → QuizWord 변환

// useUserSettings.ts
// key: ['userSettings'] — profiles 로드 + settingsStore 동기화

// studySession.ts  (TanStack Query 없음 — 직접 호출)
createStudySession({ sessionType, wordbookIds, totalCount })
completeStudySession(sessionId, correctCount, wrongCount)
insertStudyResult(sessionId, wordId, isCorrect)

// notificationScheduler.ts  (TanStack Query 없음 — 직접 호출)
refreshScheduleNotifications(schedule)   // 30일치 notifications + bridge 전송
cancelScheduleNotifications(scheduleId) // is_cancelled=true + bridge cancel

// ScheduleListPage 인라인 쿼리
// key: ['schedules', fromDate, toDate]
// key: ['schedule_exceptions', fromDate, toDate]

// WordbookListPage / WordbookDetailPage 인라인 쿼리
// key: ['wordbooks']
// key: ['words', wordbookId]
// key: ['todayWords']
```

---

## 8. 폴더 구조

### 모노레포 루트

```
Moroutine/
├── CLAUDE.md           # Claude Code 작업 규칙 (세션 자동 로드)
├── DESIGN.md           # docs/ 인덱스
├── docs/               # 설계 문서
├── web/                # React + Vite 웹앱
├── mobile/             # Expo React Native 앱
└── supabase/           # Supabase 설정
```

### mobile/ 구조

```
mobile/
├── App.tsx                     # WebView + Bridge 핸들러 (알림, TTS, 권한)
├── app.json                    # Expo 설정 (expo-notifications plugin 포함)
├── index.ts
└── src/
    └── types/
        └── bridge.ts           # BridgeOutbound / BridgeInbound 타입 정의
```

### 웹앱(web/src/) 폴더 구조

```
src/
├── main.tsx
├── App.tsx                            # AuthProvider, QueryClientProvider, useBridgeListener
├── routes/index.tsx                   # React Router + ProtectedRoute
├── pages/
│   ├── auth/LoginPage.tsx
│   ├── home/HomePage.tsx              # 오늘의 단어 카드 + 일정 미리보기
│   ├── learn/LearnPage.tsx            # 카드 스크롤 + TTS + 학습 완료
│   ├── quiz/
│   │   ├── QuizPage.tsx               # Quiz 래핑 + localStorage 이어하기 + 세션 로깅
│   │   └── QuizCompletePage.tsx
│   ├── schedule/
│   │   ├── ScheduleListPage.tsx       # 날짜 범위 검색 + 반복 일정 CRUD + 알림 연동
│   │   └── ScheduleFormPage.tsx       # placeholder
│   ├── wordbook/
│   │   ├── WordbookListPage.tsx       # 다중 선택 + 학습/퀴즈 진입
│   │   ├── WordbookDetailPage.tsx     # 단어 CRUD + 일괄등록(Pro↑)
│   │   ├── WordFormPage.tsx           # placeholder
│   │   └── PublicWordbookListPage.tsx # 신규 — 공용 단어장 열람(Pro/Premium/Master)
│   ├── speaking/                      # 신규 — docs/SPEAKING_DESIGN.md
│   │   ├── SpeakingListPage.tsx
│   │   ├── SpeakingSentenceFormPage.tsx
│   │   └── SpeakingRecordPage.tsx
│   ├── pricing/PricingPage.tsx        # 신규 — 요금제 비교/결제 진입
│   ├── master/MasterAcceptPage.tsx    # 신규 — 초대 수락
│   ├── admin/                         # 신규 — docs/ADMIN_DESIGN.md, role='admin' 전용
│   │   ├── AdminHomePage.tsx
│   │   ├── AdminWordbookListPage.tsx
│   │   ├── AdminWordbookDetailPage.tsx
│   │   ├── AdminWordbookFormPage.tsx
│   │   ├── AdminMasterListPage.tsx
│   │   ├── AdminMasterInvitationsPage.tsx
│   │   └── AdminAuditLogPage.tsx
│   └── settings/SettingsPage.tsx      # 계정/학습/복습/알림 + 등급별 섹션(docs/UI_FLOW.md §3)
├── components/
│   ├── icons.tsx                      # BackIcon, SpeakerIcon, EditIcon, CloseIcon, ChevronRightIcon
│   ├── ui/Spinner.tsx
│   ├── layout/
│   │   ├── AppLayout.tsx
│   │   ├── BottomNav.tsx
│   │   └── ProtectedRoute.tsx         # requireRole 지원으로 확장(docs/UI_FLOW.md §1)
│   └── quiz/
│       ├── Quiz.tsx
│       ├── AnswerOptions.tsx
│       ├── AnswerReveal.tsx
│       └── ProgressBar.tsx
├── repositories/                      # 신규 — docs/DATA_STORAGE_DESIGN.md §6
│   ├── types.ts                       # DataRepository 인터페이스
│   ├── factory.ts                     # getRepository(tier)
│   ├── local/
│   │   ├── schema.ts                  # Dexie LocalDB 정의
│   │   └── LocalDataRepository.ts
│   ├── remote/
│   │   └── RemoteDataRepository.ts    # Supabase + RPC(create_words_checked 등)
│   └── admin/
│       └── AdminContentRepository.ts
├── stores/
│   ├── authStore.ts
│   ├── settingsStore.ts
│   └── speakingSessionStore.ts        # 로컬 UI 상태만(녹음 중 여부 등)
├── hooks/
│   ├── useTTS.ts
│   ├── useSpeechRecognition.ts    # STT Bridge 래퍼
│   ├── useUserSettings.ts
│   ├── useStudyWords.ts
│   ├── usePermissions.ts          # 신규 — docs/PERMISSION_DESIGN.md §9
│   └── useBridgeListener.ts
├── bridge/index.ts
└── lib/
    ├── supabase.ts
    ├── permissions.ts         # 신규 — buildPermissions() (docs/PERMISSION_DESIGN.md §6)
    ├── wordStatus.ts          # applyQuizAnswer (Repository 무관 순수 함수, 변경 없음)
    ├── wordConstants.ts       # STATUS_LABEL, STATUS_COLOR
    ├── studySession.ts        # createStudySession, completeStudySession, insertStudyResult
    ├── quizProgress.ts        # localStorage 이어하기 (TTL 24h, UI 캐시 전용 — 정본 데이터 아님)
    ├── scheduleRepeat.ts      # occurrence 계산
    ├── notificationScheduler.ts  # refreshScheduleNotifications, cancelScheduleNotifications
    └── text.tsx               # renderLineBreaks
```
