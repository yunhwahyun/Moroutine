# Development Rules

> Claude가 코드 작업 시 반드시 준수해야 하는 규칙.

---

## 보안 — 절대 규칙

1. **service_role 키는 절대 웹앱/RN 앱에 포함하지 않는다.**
   - 클라이언트는 `VITE_SUPABASE_ANON_KEY`만 사용
   - service_role 키는 Edge Function 서버 환경변수에만 존재

2. **모든 Supabase 쿼리는 RLS를 신뢰한다.**
   - 클라이언트에서 `user_id` 필터를 별도로 추가할 필요 없음 (RLS가 처리)
   - 단, 소유권 검증이 필요한 쿼리 (다른 사용자 ID를 파라미터로 받는 경우)는 예외

3. **새 테이블 추가 시 RLS 필수:**
   - `ENABLE ROW LEVEL SECURITY`
   - `SELECT/INSERT/UPDATE/DELETE` 4가지 정책 모두 작성
   - INSERT 시 `WITH CHECK` 반드시 포함

---

## 코드 스타일

4. **컴포넌트 파일에 로컬 전용 컴포넌트를 인라인으로 선언하지 않는다.**
   - `EditIcon`, `Spinner` 등 공용 컴포넌트는 반드시 `src/components/`에서 import
   - 유일한 예외: 파일 내에서만 사용하는 단순 래퍼 (`const Checkbox = ...`)

5. **import 추가 후 실제 사용 코드를 동시에 작성한다.**
   - import만 추가하고 사용 코드를 생략하면 TS 에러 발생

6. **useEffect 내 참조 변수는 해당 변수의 선언 이후에 배치한다.**
   - React의 "선언 전 사용" 오류 방지

7. **주석은 WHY가 비자명한 경우에만 작성. 1줄 최대.**

---

## 상태관리 분리

8. **서버 데이터 → TanStack Query / 로컬 상태 → Zustand**
   - 서버 응답을 Zustand에 저장하지 않는다
   - 낙관적 업데이트(settings)는 예외적으로 Zustand + TanStack Query 병행 허용

9. **훅 외부에서 Zustand 상태를 읽을 때는 `useXxxStore.getState()` 패턴 사용**
   - `studySession.ts`처럼 훅 밖에서 user_id가 필요한 경우에 한정

---

## DB 마이그레이션

10. **마이그레이션 실행 순서를 반드시 지킨다:**
    ```
    1. profiles → 2. schedules → 3. wordbooks → 4. words
    → 5. word_count 트리거 → 6. study_sessions → 7. study_results
    → 8. notifications → 9. schedules_repeat → 10. notifications_occurrence
    → 11. profiles_settings
    ```

11. **트리거는 참조 테이블 생성 이후에만 작성 가능** (`word_count` 트리거 = words 이후)

---

## 알림

12. **`notificationScheduler.ts`의 schedule_exceptions 미반영은 MVP 제한이다.**
    - "이 일정만 수정" 시 해당 schedule 전체 알림 취소만 처리 (개별 occurrence 알림 제외는 구현하지 않음)
    - 향후 구현 시 DECISION_LOG.md에 기록

13. **`bridge.*` 함수는 `isNative() === false`이면 no-op이다.** 브라우저에서 호출해도 안전함.

---

## Phase 완료 시

14. **각 Phase 완료 후 즉시 `docs/PROJECT_STATUS.md`를 업데이트한다.**
15. **설계 변경이 있으면 `docs/DECISION_LOG.md`에 날짜 + 이유 기록 후 `docs/DESIGN.md` 최종 상태 갱신.**
