# TODO

---

## Doing

_현재 진행 중인 작업 없음_

---

## Todo

### Phase 10 — QA / 배포

- [ ] 웹앱 Vercel/Netlify 배포
- [ ] RN WebView source.uri 배포 URL 연결
- [ ] iOS/Android 알림 권한 흐름 기기 테스트
- [ ] 복습 상태 전이 E2E 시나리오 테스트
- [ ] RLS 정책 (TO authenticated + WITH CHECK) 최종 점검
- [ ] service_role 키 노출 여부 최종 점검

### RN 연동

- [ ] 실기기 테스트 — iOS/Android 알림 권한 흐름 확인
- [ ] 실기기 테스트 — expo-speech TTS 동작 확인
- [ ] mobile/App.tsx `WEB_APP_URL` 프로덕션 URL 교체 (현재 `moroutine.vercel.app` placeholder)

### 기술 부채

- [ ] `STATUS_LABEL` / `STATUS_COLOR` → `src/lib/wordConstants.ts`로 추출 (현재 각 파일 인라인)
- [ ] `notificationScheduler.ts` — schedule_exceptions 반영 알림 지원 (MVP 이후)
- [ ] Edge Function quiz/start, quiz/answer 구현 (MVP 이후, 현재 클라이언트 직접 처리)

---

## Done

- [x] Phase 0 — 프로젝트 셋업 (웹 + RN Expo 포함)
- [x] Phase 1 — Supabase DB / RLS / Auth
- [x] Phase 2 — 하단 탭 + 레이아웃
- [x] Phase 3 — 단어장/단어 CRUD + WordbookSelector 다중 선택
- [x] Phase 4 — 학습하기 (LearnPage + useTTS + study_sessions 로깅)
- [x] Phase 5 — 문제풀기 (QuizPage + applyQuizAnswer + study_sessions/results 로깅)
- [x] Phase 6 — 복습 퀴즈 (reviewIntervals/reviewPolicy)
- [x] Phase 7 — 홈 화면
- [x] Phase 8 — 일정 CRUD + 반복 일정 + 알림 웹 측 구현
- [x] Phase 9 — 설정 (SettingsPage)
- [x] dead code 삭제 (reviewSchedule.ts, quizSessionStore.ts)
- [x] icons.tsx 생성 및 각 파일에서 import로 교체
- [x] Quiz.tsx handleNext dead branch 정리
- [x] Spinner 컴포넌트 추출
- [x] LearnPage.tsx MOCK_WORDS 찌꺼기 제거
- [x] ScheduleListPage.tsx 로컬 EditIcon/Spinner → 공용 컴포넌트로 교체
- [x] DESIGN.md → docs/ 8개 파일로 분리
