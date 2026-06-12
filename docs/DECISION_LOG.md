# Decision Log

> 설계 결정 이력. 이유 없이 변경하지 말 것.

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
