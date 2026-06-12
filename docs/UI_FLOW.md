# UI Flow

---

## 화면 목록 & 라우팅

| 화면명 | Path | 탭 | 주요 기능 |
|--------|------|----|-----------|
| 로그인 | `/login` | — | 소셜/이메일 로그인 |
| 홈 | `/` | 홈 | 학습영역(오늘의 단어 카드) + Today 일정 |
| 학습하기 | `/learn` | — | 카드 스크롤 + TTS + 학습 완료 버튼 |
| 퀴즈 | `/quiz` | — | QuizPage (Quiz 컴포넌트 래핑) + localStorage 이어하기 |
| 퀴즈 완료 | `/quiz/complete` | — | 정답률 + 완료 개수 |
| 단어장 | `/wordbooks` | 단어장 | 복습컬렉션 + 단어장 다중 선택, 학습/퀴즈 진입 |
| 단어장 상세 | `/wordbooks/:id` | — | 단어 목록 + 추가/수정/삭제 + 일괄등록 |
| 단어 등록 | `/wordbooks/:id/words/new` | — | placeholder (WordFormPage) |
| 단어 수정 | `/wordbooks/:id/words/:wid/edit` | — | placeholder (WordFormPage) |
| 일정 | `/schedules` | 일정 | 날짜 범위 검색, 날짜별 그룹 조회 |
| 일정 등록 | `/schedules/new` | — | placeholder (ScheduleFormPage) |
| 일정 수정 | `/schedules/:id/edit` | — | placeholder (ScheduleFormPage) |
| 설정 | `/settings` | 설정 | 계정/학습/복습/알림 설정 |

### 라우팅 구조

```tsx
<Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route element={<ProtectedRoute />}>
    <Route element={<AppLayout />}>
      <Route path="/"           element={<HomePage />} />
      <Route path="/wordbooks"  element={<WordbookListPage />} />
      <Route path="/schedules"  element={<ScheduleListPage />} />
      <Route path="/settings"   element={<SettingsPage />} />
    </Route>
    <Route path="/learn"                         element={<LearnPage />} />
    <Route path="/quiz"                          element={<QuizPage />} />
    <Route path="/quiz/complete"                 element={<QuizCompletePage />} />
    <Route path="/wordbooks/:id"                 element={<WordbookDetailPage />} />
    <Route path="/wordbooks/:id/words/new"       element={<WordFormPage />} />
    <Route path="/wordbooks/:id/words/:wid/edit" element={<WordFormPage />} />
    <Route path="/schedules/new"                 element={<ScheduleFormPage />} />
    <Route path="/schedules/:id/edit"            element={<ScheduleFormPage />} />
  </Route>
</Routes>
```

---

## 하단 탭

```
[ 홈 ]  [ 단어장 ]  [ 일정 ]  [ 설정 ]
```

---

## 화면별 상세

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

### 설정 (`/settings`)

- **계정**: 닉네임 편집, 이메일 표시, 회원탈퇴
- **학습**: 퀴즈 기본 모드 (객관식/주관식), 문제 순서 (랜덤/오름/내림)
- **복습**: 복습 주기 (`reviewIntervals`), 복습 정책 (`keep`/`downgrade`)
- **알림**: 일정 알림 토글, 복습 알림 토글 + 시간 설정
- DB 동기화: `profiles` 테이블 낙관적 업데이트
