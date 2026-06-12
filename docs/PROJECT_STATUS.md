# Project Status

> 최종 업데이트: 2026-06-12

---

## Completed

| Phase | 내용 |
|-------|------|
| Phase 0 | 프로젝트 셋업 전체 완료 (웹: Vite+React+TS+Tailwind, RN: Expo+react-native-webview+expo-notifications+expo-speech) |
| Phase 1 | Supabase DB / RLS / Auth (마이그레이션 전체, authStore, ProtectedRoute, LoginPage) |
| Phase 2 | 하단 탭 + AppLayout + BottomNav + 라우팅 |
| Phase 3 | 단어장/단어 CRUD + WordbookSelector 다중 선택 UI + 복습 단어모음 가상 컬렉션 |
| Phase 4 | 학습하기 (LearnPage + useTTS + study_sessions 로깅) |
| Phase 5 | 문제풀기 (QuizPage + Quiz 컴포넌트 + applyQuizAnswer + study_sessions/results 로깅) |
| Phase 6 | 복습 퀴즈 (useTodayStudyWords + reviewIntervals/reviewPolicy 설정 적용) |
| Phase 7 | 홈 화면 (오늘의 단어 카드 + 일정 미리보기) |
| Phase 8 | 일정 CRUD + 반복 일정 + 알림 웹 측 구현 (notificationScheduler + useBridgeListener) |
| Phase 9 | 설정 (SettingsPage: 계정/학습/복습/알림) |

---

## In Progress / Partial

| 항목 | 상태 | 비고 |
|------|------|------|
| Phase 8 — RN 알림 연동 | 구현 완료, 기기 테스트 필요 | mobile/App.tsx Bridge 핸들러 구현됨, 실기기 테스트 미완 |
| Phase 5 — Edge Function | 미구현 확정 | quiz/start, quiz/answer는 클라이언트 직접 DB 처리로 대체 |

---

## Next

| 순서 | 작업 |
|------|------|
| 1 | Phase 10 — 웹앱 배포 (Vercel/Netlify) + RN WebView source.uri 배포 URL 연결 |
| 2 | iOS/Android 알림 권한 흐름 실기기 테스트 |
| 3 | 복습 상태 전이 E2E 시나리오 테스트 |
| 4 | RLS 정책 최종 점검 |
| 5 | service_role 키 노출 여부 최종 점검 |
