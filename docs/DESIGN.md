# Moroutine — 설계 문서

> 현재 최종 상태만 기록. 변경 이력은 DECISION_LOG.md 참고.

---

## 1. 서비스 개요

하이브리드 WebView 기반 학습 루틴 / 단어 암기 앱.  
Web App(React)을 React Native WebView 안에서 실행하며, 알림·TTS 등 네이티브 기능은 Bridge를 통해 처리한다.

---

## 2. 기술 스택

| 영역 | 선택 |
|------|------|
| 웹 프론트엔드 | React + TypeScript + Vite + Tailwind CSS |
| 상태관리 | Zustand (로컬) + TanStack Query (서버) |
| 네이티브 | React Native + Expo + react-native-webview |
| 알림 | expo-notifications (로컬 알림) |
| 백엔드 | Supabase (Auth + PostgreSQL + PostgREST) |
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
  ├── Zustand              ← authStore, settingsStore
  ├── TanStack Query       ← 서버 데이터 캐시
  └── Supabase Client      ← Auth + PostgREST
```

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

// 네이티브 → 웹 (BridgeInbound)
NOTIFICATION_RESULT    { id, nativeId, success }
PERMISSION_RESULT      { permission, granted }
APP_VERSION            { version }
```

### 웹 측 구현

- `src/bridge/index.ts`: `bridge.*` 유틸 + `registerBridgeListener`
- `src/hooks/useBridgeListener.ts`: App.tsx에서 호출, NOTIFICATION_RESULT → DB 업데이트

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
│   │   ├── WordbookDetailPage.tsx     # 단어 CRUD + 일괄등록
│   │   └── WordFormPage.tsx           # placeholder
│   └── settings/SettingsPage.tsx      # 계정/학습/복습/알림 설정
├── components/
│   ├── icons.tsx                      # BackIcon, SpeakerIcon, EditIcon, CloseIcon, ChevronRightIcon
│   ├── ui/Spinner.tsx
│   ├── layout/
│   │   ├── AppLayout.tsx
│   │   ├── BottomNav.tsx
│   │   └── ProtectedRoute.tsx
│   └── quiz/
│       ├── Quiz.tsx
│       ├── AnswerOptions.tsx
│       ├── AnswerReveal.tsx
│       └── ProgressBar.tsx
├── stores/
│   ├── authStore.ts
│   └── settingsStore.ts
├── hooks/
│   ├── useTTS.ts
│   ├── useUserSettings.ts
│   ├── useStudyWords.ts
│   └── useBridgeListener.ts
├── bridge/index.ts
└── lib/
    ├── supabase.ts
    ├── wordStatus.ts          # applyQuizAnswer
    ├── wordConstants.ts       # STATUS_LABEL, STATUS_COLOR
    ├── studySession.ts        # createStudySession, completeStudySession, insertStudyResult
    ├── quizProgress.ts        # localStorage 이어하기 (TTL 24h)
    ├── scheduleRepeat.ts      # occurrence 계산
    ├── notificationScheduler.ts  # refreshScheduleNotifications, cancelScheduleNotifications
    └── text.tsx               # renderLineBreaks
```
