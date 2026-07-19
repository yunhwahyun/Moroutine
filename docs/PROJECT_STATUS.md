# Project Status

> 최종 업데이트: 2026-07-19

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
| Safe-area 전체 적용 | AppLayout·LearnPage·WordbookDetailPage·Quiz·QuizCompletePage·QuizPage·ScheduleFormPage에 `env(safe-area-inset-top)` 적용 |
| BottomNav 개선 | +10px 하단 여백, `w-fit mx-auto` fit-content 중앙 정렬, `gap-5` 아이콘 간격 |
| Quiz TTS | 객관식 단어 카드에 발음 듣기 버튼 (SpeakerIcon + useTTS) |
| Quiz STT | 주관식 음성입력 (useSpeechRecognition + Bridge START_STT/STOP_STT/STT_RESULT), 음성 인식 결과 input 자동 반영 |
| **Guest/Pro/Premium/Master/Admin 정책 설계 완료** | `docs/PERMISSION_DESIGN.md`·`docs/SUBSCRIPTION_DESIGN.md`·`docs/DATA_STORAGE_DESIGN.md`·`docs/MIGRATION_DESIGN.md`·`docs/ADMIN_DESIGN.md`·`docs/MASTER_INVITATION_DESIGN.md`·`docs/DATA_RETENTION_DESIGN.md` 신규 확정. `docs/DB_SCHEMA.md`/`docs/API_SPEC.md`/`docs/UI_FLOW.md`/`docs/DESIGN.md` 갱신 완료. 상세는 `docs/DECISION_LOG.md` 2026-07-18 항목 |
| Speaking 재설계 완료(평가 기능 폐지) | `docs/SPEAKING_DESIGN.md` 전면 개정 — 구 Beta/Free/Premium+Azure 평가 계획 폐기, 문장/TTS/녹음만 유지하는 신규 설계로 대체 |
| **Phase 11 — 권한 모델 구현** | 마이그레이션 13~15(`profiles.role/special_access`, `subscription_plans`, `subscriptions`, `is_admin()`, `get_service_tier()`) **Supabase 프로젝트에 실제 적용 완료**(사용자 확인) + `src/lib/permissions.ts`(`buildPermissions()`) + `src/hooks/usePermissions.ts` + `ProtectedRoute`의 `requireRole` 확장. `tsc -b`/`eslint`/`vite build` 전체 통과 |
| **Phase 12 — Repository 계층** | `DataRepository` 인터페이스, `LocalDataRepository`(Dexie/IndexedDB, Guest 무제한), `RemoteDataRepository`, `getRepository(tier)` Factory 구현 완료 |
| **Phase 12.5 — Guest 라우팅 공개 전환** | 홈/단어장/학습/퀴즈/설정을 로그인 없이 접근 가능하게 전환. `WordbookListPage`/`WordbookDetailPage`/`useTodayStudyWords`/`HomePage`의 일정 미리보기를 Repository·tier 경유로 리팩터링. **Playwright(Chromium headless) 실브라우저 검증 완료**: 익명 사용자가 `/` 방문 시 `/login` 리다이렉트 없이 렌더링, `/wordbooks`에서 단어장 생성→상세 진입→단어 등록까지 IndexedDB 기반으로 성공, 콘솔 에러 0건. `tsc -b`/`eslint .`/`vite build` 전체 통과 |
| **Guest 학습/복습 상태 저장** | `applyQuizAnswer()`가 Repository 경유로 word 상태(status/review_step/next_review_at/wrong_count) 저장, `study_sessions`/`study_results` 로깅도 Repository화(`createStudySession`/`completeStudySession` 신설, `lib/studySession.ts` 삭제). 부수적으로 `Word.review_step` 타입 버그(`0\|1\|2\|3`→`number`)와 React StrictMode로 인한 학습 세션 중복 생성 버그(둘 다 pre-existing)를 함께 발견·수정. **Playwright 실브라우저 검증**: Guest가 단어 4개 등록 후 퀴즈 4문제 전부 정답 → IndexedDB에서 `status: reviewing`, `review_step: 1`, `next_review_at`이 정확히 7일 뒤로 계산되어 저장됨을 확인, `study_sessions` 중복 없이 1건만 생성 확인, 콘솔 에러 0건 |
| **Guest 설정 영구 저장** | `useUserSettings.ts` tier 분기 완료 — Guest는 IndexedDB에 영구 저장, 새로고침해도 유지됨 |
| **Guest 일정(Schedule) 지원** | `DataRepository`에 `deleteSchedule`/`getScheduleExceptions`/`saveScheduleException`/알림 4종 메서드 추가, `ScheduleListPage.tsx`(반복 일정 이 일정만/이후 모두/전체 수정·삭제 8개 mutation 전부) + `notificationScheduler.ts` + `useBridgeListener.ts`를 Repository 경유로 전환. `/schedules*` 공개 라우트 전환 완료. **Playwright 실브라우저 검증**: Guest로 단발 일정(alarm 포함) + 매일 반복 일정 생성 → "이 일정만 수정" 시 `schedule_exceptions`가 정확히 생성됨을 IndexedDB에서 확인, 콘솔 에러 0건. 알림(`notifications`) 생성 경로는 코드 구조상 schedules/exceptions와 동일하나, 헤드리스 브라우저의 네이티브 date input 자동화 한계로 미래 날짜 시나리오 직접 검증은 못함(제품 코드 미변경 영역) |
| **Phase 13 — 신규 스키마 마이그레이션 16~24** | `subscription_webhook_support`/`public_wordbooks_words`/`user_public_progress`/`master_invitations`/`admin_audit_log`/`migration_engine`/`retention_schedules`/`speaking_sentences`/`speaking_recordings` 총 9개 파일, 각 설계 문서(SUBSCRIPTION/ADMIN/MASTER_INVITATION/MIGRATION/DATA_RETENTION/SPEAKING_DESIGN.md)의 확정 DDL을 그대로 반영. 테이블 간 참조 순서(FK) grep 검증 완료. **Supabase 프로젝트에 실제 적용 완료**(사용자 확인). `docs/PERMISSION_DESIGN.md` §7 RLS 요구사항 표 15개 중 13개 충족 확인 — 나머지 2개(Pro 단어 한도 서버 검증, 초대 토큰 서버 검증)는 RPC/Edge Function 몫이라 Phase 14/17에서 자연히 충족 예정 |
| **Phase 14 — Pro 단어 한도** | Migration 25(`create_words_checked` RPC, advisory lock으로 동시 등록 Race Condition 차단, jsonb 응답에 삽입 행 포함) + `RemoteDataRepository.createWord/bulkCreateWords`를 전부 이 RPC 경유로 전환(직접 insert 제거) + `getPersonalWordCount()`/`WordLimitExceededError` 신설. `WordbookDetailPage.tsx`에 일괄등록 미리보기 확인 단계(현재/추가/중복/오류/예상/한도) 추가, `WordbookListPage.tsx`에 Pro 한도 배너 + `/pricing` placeholder 신설. **Supabase 프로젝트에 마이그레이션 25 실제 적용 완료**(사용자 확인). **Playwright 실브라우저 검증**: 미리보기 계산 로직을 기존 단어 1개+업로드 5행(정상 3/중복 2/오류 1) 조합으로 검증, 계산·등록 결과 모두 정확히 일치, 콘솔 에러 0건. **한계**: RPC의 서버측 한도 차단 자체는 실제 Pro 계정이 없어 직접 검증 못함(SQL 리뷰로 정확성 신뢰, 사후 검증 권장) |
| **Phase 15 — Guest→Remote 이전 엔진** | Migration 26(이전 RPC 6종: wordbook/word/schedule/schedule_exception/study_session/study_result, `(migration_id,entity_type,local_id)` Idempotency) + `localSnapshot.ts`(로컬 스냅샷) + `guestToRemoteMigration.ts`(청크 업로드/재시도/부모-자식 순서/알림 재등록) + `useGuestMigration` 훅 + `GuestMigrationModal`/`GuestMigrationGate`(App.tsx 마운트, serviceTier 변화 감지 트리거). **Supabase 프로젝트에 마이그레이션 26 실제 적용 완료**(사용자 확인, 2026-07-18). **Playwright 실브라우저 검증**: 게이트 임시 우회로 모달 트리거·요약 정확성·실패 시 로컬 데이터 보존을 확인하는 과정에서 **실제 버그(실패 시 UI가 멈추는 문제) 1건을 발견해 수정**, 원복 후 Guest 상태 회귀 테스트도 통과. **한계**: RPC의 실제 원격 저장 성공 경로는 실제 Pro/Premium/Master 계정이 없어 검증 못함(SQL 리뷰로 정확성 신뢰). Remote→Local 방향(구독 만료/Master 해제)은 이번 범위 밖, "이전 대기 중" 배너 상시 노출도 미구현(둘 다 후속 Phase에서 처리) |
| **Phase 16 — 구독/결제 스캐폴딩** | Migration 27(`billing_retry_started_at` + `subscriptions` realtime publication) + Edge Function `revenuecat-webhook`(프로젝트 최초의 Edge Function, event.type 8종 분기/Idempotency/audit log) + 브리지 메시지 확장(`SET_USER_ID`/`PURCHASE_REQUEST`/`RESTORE_PURCHASES`/`PURCHASE_RESULT`/`RESTORE_RESULT`, web·mobile 양쪽 동기화) + `react-native-purchases` 연동(`mobile/App.tsx`) + 구독 만료/해지 강제 전환 엔진(`remoteToLocalMigration.ts` — 서버 UUID를 로컬 id로 그대로 써서 RPC 없이 직접 조회+`bulkPut`, `deviceId.ts`, `useSubscriptionDowngrade`, `DowngradeGate`/`DowngradeModal`) + `useSubscriptionRealtimeSync`(usePermissions 5분 staleTime 한계 보완). Grace Period 16일/billing_retry 최대 30일 확정(`docs/DECISION_LOG.md` 2026-07-18). **Supabase 프로젝트에 마이그레이션 27 실제 적용 완료**(사용자 확인, 2026-07-18). `tsc -b`/`eslint .`/`vite build`(web), `tsc --noEmit`(mobile) 통과. **한계**: RevenueCat 실계정이 없어 로컬에 Deno/Supabase CLI도 없는 상태 — Edge Function은 문법 검증까지만, 실제 결제/웹훅/EAS 빌드 테스트는 계정 준비 후 진행 필요. billing_retry 자동 만료 스케줄 함수, §7 3개월 복원 병합(중복 판정/기기 선택 UX 미확정)은 다음 세션으로 이월 |
| **Phase 16 후속 — 회원가입 직후 `/pricing` 강제 라우팅 ✅ 완료 2026-07-19** | `web/src/lib/signupFlow.ts`(localStorage 플래그) 신설 + `LoginPage.tsx`가 `signUp()` 성공 시 플래그 기록 + `SignupPricingGate.tsx`(신규, App.tsx `AuthProvider`에 마운트)가 `authenticated+guest` 상태에서 `/pricing`으로 강제 리다이렉트 + `DowngradeGate.tsx`는 플래그가 켜진 동안 자기비활성화(`!isSignupPending()`)만 추가해 만료/Master 해제 경로는 완전히 무변경 + `PricingPage.tsx`에 "무료로 계속 사용하기" 탈출구(기존 `useSubscriptionDowngrade` 엔진 재사용) 추가. 판정 방식(localStorage 플래그 vs 구독 이력 쿼리)과 `DowngradeGate` 우선순위 분리 근거는 `docs/DECISION_LOG.md` 2026-07-19. `tsc -b`/`eslint`(변경 파일 전부 클린)/`vite build` 통과. **Playwright 실브라우저 검증**: Guest로 `/pricing`·`/`·`/wordbooks` 방문 시 회귀 없음(버튼 미노출, 원치 않는 리다이렉트 없음, 콘솔 에러 0건). **한계**: 실제 이메일 인증을 거친 신규 가입 계정의 전체 플로우는 실계정 생성 부작용 때문에 미검증 |
| **Phase 17 — Master 초대/해제 스캐폴딩** | Migration 28(`prevent_self_privilege_escalation` 트리거 수정 + `master_invitations.token_hash` nullable + `list_masters()` RPC + `profiles` realtime publication) + Edge Function 5종(`master-invite`/`-resend`/`-revoke`/`master-accept`/`master-revoke`, 공용 헬퍼 `supabase/functions/_shared/`) + `MasterAcceptPage`(`/master/accept`) + `AdminMastersPage`(`/admin/masters`, Phase 20 이전 placeholder) + `useSubscriptionRealtimeSync`에 `profiles` 구독 추가. **부수 발견 및 수정 2건**: (1) 마이그레이션 13의 트리거가 service_role Edge Function의 정당한 `special_access` 갱신까지 되돌리는 버그(service_role은 `auth.uid()`가 NULL이라 `is_admin(NULL)`이 항상 false) — Phase 20 관리자 역할 변경 화면에도 필요한 선행 수정. (2) `!x.ok` negation이 boolean 판별 유니온을 좁혀주지 못하는 TypeScript 타입 버그를 Edge Function 문법 검증 중 발견해 `x.ok === false`로 수정. **설계 편차**: 자체 crypto 토큰 검증(설계 문서 원안) 대신 Supabase 세션 인증(`inviteUserByEmail`/`signInWithOtp` 폴백)으로 단순화 — `inviteUserByEmail`이 이미 가입된 이메일에는 쓸 수 없어 발견, 근거는 `docs/DECISION_LOG.md` 2026-07-18. `tsc -b`/`eslint .`/`vite build`(web) 통과, Edge Function은 Phase 16과 동일하게 문법 검증까지만(Deno/Supabase CLI 없음). **Supabase 프로젝트에 마이그레이션 28 실제 적용 완료**(사용자 확인, 2026-07-18). **한계**: Edge Function 미배포, 실제 초대 이메일 발송/수락/Master 해제 전체 플로우 미검증(Supabase 프로젝트 SMTP 설정 확인 필요) |
| **Phase 18 — 데이터 보관/삭제 스캐폴딩** | Migration 29(`admin_audit_log.actor_id` nullable) + Scheduled Edge Function `retention-cleanup`(부모 테이블만 삭제, 자식은 기존 FK CASCADE로 자동 삭제, 실패 시 자동 재시도, `actor_id: null`로 감사 로그) + `revenuecat-webhook`/`master-revoke`/`master-accept` 3개 기존 함수에 `retention_schedules` 생성/취소 연동 추가(마이그레이션 22에서 만들어졌지만 지금까지 아무도 쓰지 않던 테이블을 처음으로 채움) + `RetentionBanner`(`AppLayout` 마운트). **설계 편차**: `retention-notify`(이메일) 대신 앱 내 배너로 대체 — Supabase Auth 기본 메일 템플릿이 임의 내용 알림(구독 만료/삭제 예정 안내)에 맞지 않음을 확인, 근거는 `docs/DECISION_LOG.md` 2026-07-18. `tsc -b`/`eslint .`/`vite build`(web) 통과, Edge Function은 Phase 16/17과 동일하게 문법 검증까지만(Deno/Supabase CLI 없음). **Supabase 프로젝트에 마이그레이션 29 실제 적용 완료**(사용자 확인, 2026-07-18). **한계**: Edge Function 미배포, pg_cron 확장 활성화/등록 미완(사용자가 Dashboard에서 진행 필요), Storage(speaking-recordings) 삭제는 Phase 23 미착수라 범위 밖 |
| **Phase 19 — 공용 단어장 (관리자 CRUD + 사용자 열람/등록 + 학습/퀴즈 연동)** | Migration 30(`public_wordbooks`/`public_words` AFTER INSERT/UPDATE 트리거 → `admin_audit_log` 자동 기록, §4 "트리거 방식" 채택) + `web/src/lib/publicWordbooks.ts`(DataRepository와 무관한 독립 모듈) + Admin CRUD 3화면(`AdminWordbookListPage`/`AdminWordbookFormPage`/`AdminWordbookDetailPage`, 개인 `WordbookDetailPage`의 `.txt` 일괄등록 파서 패턴 재사용) + 사용자 화면 2개(`PublicWordbookListPage`/`PublicWordbookViewPage`, 게시된 단어장 열람 + 담기/담기해제 + 학습하기/퀴즈 버튼) + `WordbookListPage` 헤더에 공용 단어장 링크 추가. **학습/퀴즈 연동**: `wordStatus.ts`의 상태 전이 계산을 `computeQuizAnswerUpdate()` 순수 함수로 추출해 개인/공용 공유, `publicWordbooks.ts`에 `getPublicWordProgressMap`/`upsertPublicWordProgress`/`applyPublicQuizAnswer`/`toStudyWord`(어댑터) 추가, `QuizPage.tsx`/`LearnPage.tsx`에 공용 모드 분기(개인 `study_sessions`/`study_results` 기록 스킵) — `Quiz.tsx`는 애초에 `word.id`의 의미를 몰라도 되도록 완전히 범용적으로 짜여 있어 무수정 재사용. **편차**: `/admin/wordbooks/:id/words/new` 별도 라우트·순서 변경 UI·"단어장 내 탭" IA는 단순화(인라인 폼/생성 순서/헤더 링크로 대체), "오늘의 복습"에 공용 단어 합치기·여러 공용 단어장 동시 선택 학습은 범위 밖(`docs/DECISION_LOG.md` 2026-07-19). `tsc -b`/`eslint .`/`vite build`(web) 통과. **Supabase 프로젝트에 마이그레이션 30 실제 적용 완료**(사용자 확인, 2026-07-19). **한계**: 실제 Admin/Pro 계정 전체 플로우(생성→게시→열람/등록→학습/퀴즈) 미검증 |

| **Phase 20 — 관리자 화면 전체(`/admin/**`)** | `AdminLayout`(하단 탭 없음, 상단 탭 홈/공용 단어장/Master 관리/감사 로그 + "앱으로 돌아가기") + `AdminHomePage`(`/admin`, 3개 섹션 카드) + `AdminAuditLogPage`(`/admin/audit-log`, `admin_audit_log` 최신 200건 직접 조회 — 조인 RPC 없이 `actor_id` 그대로 표시). 기존 Phase 17/19의 `/admin/masters`, `/admin/wordbooks*`를 이 레이아웃 하위로 재구성(자체 "홈으로" 헤더 링크 제거). **개인 데이터 미노출 검증**: 관리자 관련 코드 전체를 개인 데이터 테이블로 grep해 0건 확인, `docs/ADMIN_DESIGN.md` §7-1에 체크리스트로 기록. 새 마이그레이션 없음(`admin_audit_log` RLS가 이미 admin SELECT 허용). `tsc -b`/`eslint .`/`vite build`(web) 통과. **한계**: 실제 Admin 계정 전체 플로우 미검증 |

| **Phase 21 — 설정/요금제 화면** | Migration 31(`subscription_plans` SELECT를 `anon, authenticated`로 확장 — Guest도 `/pricing` 조회 가능) + `SettingsPage` 등급별 계정 섹션 분기(Guest/Pro/Premium/Master/Admin) + `PricingPage` 재작성(동적 플랜 로드 + 네이티브 구매 트리거 + 구매 결과 피드백). **편차**: 동기화 시각은 추적 데이터가 없어 정적 문구로 대체, 가격은 플레이스홀더 텍스트(DB에 가격 컬럼 자체가 없고 RevenueCat 실계정도 없음), "구독 관리"는 새 브리지 메시지 없이 웹 `window.open`/네이티브 안내 문구로 단순화(`docs/DECISION_LOG.md` 2026-07-19). `tsc -b`/`eslint .`/`vite build` 통과. **Playwright 실브라우저 검증**: Guest로 `/settings`(콘솔 에러 0건)·`/pricing`(정상 렌더링, `subscription_plans` 401은 마이그레이션 31 미적용 상태에서 예상된 결과) 확인. **Supabase 프로젝트에 마이그레이션 31 실제 적용 완료**(사용자 확인, 2026-07-19). **한계**: 실제 Pro/Premium 계정 구매 플로우 미검증 |

| **Phase 22 — 데이터 내보내기/가져오기** | `web/src/lib/dataExport.ts` 신설(`buildBackup`은 Guest가 `readLocalSnapshot()`, Remote가 `remoteToLocalMigration.ts`와 동일한 직접 Supabase 조회 패턴 재사용) + `downloadJson`/`downloadWordsCsv`(BOM 포함)/`parseBackupFile`(schemaVersion 검증)/`importBackupToLocal`/`clearAllLocalData` + `SettingsPage`에 "데이터" 섹션 신설(전 등급 내보내기, Guest 전용 가져오기+초기화). **편차**: 가져오기는 Guest 전용(Pro/Premium/Master는 `docs/UI_FLOW.md` §3 표대로 내보내기만 필요), 중복은 항상 덮어쓰기 고정(`docs/DECISION_LOG.md` 2026-07-19). `tsc -b`/`eslint .`/`vite build` 통과. **Playwright 실브라우저 검증**: 단어장/단어 생성 → JSON 백업 → 로컬 초기화(0건) → 가져오기로 원본 데이터 정확히 복원 확인, CSV 내보내기도 정확 확인, 콘솔 에러 0건. **한계**: Pro/Premium/Master 내보내기는 실제 계정 없이 미검증 |

> 구 "Speaking 설계 완료(Azure 평가 포함)" 항목은 위 재설계로 대체되어 제거함. 두 설계 모두 실제 코드/마이그레이션 파일로 구현된 적은 없었음(`docs/DECISION_LOG.md` 참고).

---

## In Progress / Partial

| 항목 | 상태 | 비고 |
|------|------|------|
| Phase 8 — RN 알림 연동 | 구현 완료, 기기 테스트 필요 | mobile/App.tsx Bridge 핸들러 구현됨, 실기기 테스트 미완 |
| Phase 5 — Edge Function | 미구현 확정 | quiz/start, quiz/answer는 클라이언트 직접 DB 처리로 대체(정책 개편과 무관, 유지) |
| APK 빌드 | EAS 빌드 완료(기존), StatusBar dark 변경은 미반영 | 재빌드 필요 |
| Guest 알림(notifications) 미래 날짜 시나리오 검증 | 코드 구현 완료, 직접 검증 미완 | Playwright 헤드리스 환경의 date input 자동화 한계로 재현 못함(위 Completed 표 참고). 실기기 또는 다른 입력 방식으로 재검증 권장 |
| Phase 14 — RPC 서버측 한도 차단 실증 | 코드 구현 완료, 직접 검증 미완 | 실제 Pro 계정 필요(위 Completed 표 참고). `personal_word_limit`을 임시로 낮게 설정해 두 탭 동시 등록으로 advisory lock까지 함께 검증 권장 |
| Phase 15 — RPC 원격 저장 성공 경로 실증 | 코드 구현 완료, 직접 검증 미완 | 실제 Pro/Premium/Master 계정으로 "계정으로 이전" 전체 플로우(청크 업로드→원격 데이터 확인→로컬 삭제 선택) 사후 검증 권장 |
| Phase 15 — "이전 대기 중" 배너 | 미구현 | "나중에 하기" 선택 시 세션당 1회 모달만 뜨고 끝남. 상시 배너는 후속 작업 |
| Phase 16 — RevenueCat 실계정 연동 | 코드 스캐폴딩 완료, 실계정 연동 미착수 | RevenueCat 프로젝트/상품/Entitlement 설정, 시크릿 등록, `supabase functions deploy`, 실기기 결제·복원 테스트, EAS 빌드 전부 필요(위 Completed 표 참고) |
| Phase 16 — billing_retry 자동 만료 스케줄 함수 | 미구현 | `billing_retry_started_at` 컬럼만 준비됨. Phase 18 `retention-cleanup`과 같은 시점에 pg_cron 등록 권장(둘 다 아직 미등록) |
| Phase 16 — §7 3개월 이내 복원 병합 | 미구현(이월) | 중복 판정 UI/기기 선택 UX가 설계 문서에 "결정 필요"로 남아 있어 다음 세션에서 별도 진행 |
| Phase 17 — Edge Function 5종 배포 | 코드 작성 완료, 미배포 | `supabase functions deploy master-invite master-invite-resend master-invite-revoke master-accept master-revoke` + `SITE_URL` 시크릿 등록 필요 |
| Phase 17 — 초대/수락/해제 전체 플로우 실증 | 코드 구현 완료, 직접 검증 미완 | Supabase 프로젝트의 이메일(SMTP) 발송 설정 확인 후 실제 이메일 주소로 초대→수락→해제 전 과정 사후 검증 권장 |
| Phase 18 — `retention-cleanup` 배포/pg_cron 등록 | 마이그레이션 적용 완료, Edge Function 미배포 | `supabase functions deploy retention-cleanup` + pg_cron 확장 활성화 후 `cron.schedule(...)` 실행 필요(`docs/DATA_RETENTION_DESIGN.md` §4-2) |
| Phase 18 — 실제 삭제 동작 실증 | 코드 구현 완료, 직접 검증 미완 | 3개월 경과 `retention_schedules` 행으로 실제 삭제·감사 로그 기록 사후 검증 권장 |
| Phase 18 — Storage(speaking-recordings) 삭제 | 미구현(범위 밖) | Phase 23(스피킹) 구현 후 `retention-cleanup`에 추가 필요 |
| Phase 19 — 생성→게시→열람/등록/학습/퀴즈 전체 플로우 실증 | 코드 구현 완료, 직접 검증 미완 | 실제 Admin/Pro 계정 필요 |
| Phase 19 — "오늘의 복습" 공용 단어 병합 | 미구현(범위 밖) | 개인 복습 큐와 공용 진행 상태를 하나의 UI로 합치는 별도 설계 필요(`docs/DECISION_LOG.md` 2026-07-19) |
| Phase 20 — 실제 Admin 계정 전체 플로우 실증 | 코드 구현 완료, 직접 검증 미완 | `/admin` 진입 → 탭 이동 → 감사 로그 표시 확인 |
| Phase 21 — 실제 Pro/Premium 계정 구매 플로우 실증 | 코드 구현 완료, 직접 검증 미완 | RevenueCat 실계정 준비 후 네이티브 앱에서 구매/업그레이드 전체 플로우 사후 검증 권장 |
| Phase 22 — Pro/Premium/Master 내보내기 실증 | 코드 구현 완료, 직접 검증 미완 | 실제 계정으로 전체 백업/CSV 내보내기 결과 사후 검증 권장 |
| Phase 16 후속 — 회원가입 직후 `/pricing` 강제 라우팅 전체 플로우 실증 | 코드 구현 완료, 직접 검증 미완 | 실제 이메일 인증을 거친 신규 가입 계정으로 "가입→인증→`/pricing` 강제 이동→무료 계속/결제 선택" 전체 시나리오 사후 검증 권장(실계정 생성 부작용 때문에 이번 세션에서 미시도) |

---

## Next — Phase 11 이후 구현 순서 (정책 개편 반영)

> 상세 작업 목록은 `docs/TODO.md` 참고. 순서는 `docs/DESIGN.md` 하위 문서들의 의존관계를 따른다(권한 모델 → 저장 계층 → DB/RLS → 한도/이전 → Master/보관 → 공용 단어장 → 화면 → 부가기능).

| 순서 | Phase | 작업 |
|------|-------|------|
| — | Phase 11 | ✅ 완료 (마이그레이션 13~15 Supabase 적용 완료 + client 구현) |
| — | Phase 12 | ✅ 완료 (Repository 계층) |
| — | Phase 12.5 | ✅ 완료 (Guest 라우팅 공개 전환 + 학습/복습 상태 저장 + 설정 영구 저장 + 일정 지원, 전부 실브라우저 검증) |
| — | Phase 13 | ✅ 완료 (마이그레이션 16~24 Supabase 적용 완료 + RLS 요구사항 대조) |
| — | Phase 14 | ✅ 완료 (Pro 단어 한도 RPC + 클라이언트 연동, 마이그레이션 25 Supabase 적용 완료). **잔여**: 실제 Pro 계정으로 서버측 차단 실증(위 In Progress 참고) |
| — | Phase 15 | ✅ 완료 (Guest→Remote 이전 엔진 + 전환 확인 모달 + 마이그레이션 26 Supabase 적용 완료). **잔여**: 실제 계정으로 원격 저장 성공 경로 실증(위 In Progress 참고) |
| — | Phase 16 | ⚠️ 스캐폴딩 완료 (Webhook Edge Function + 구독 만료→Guest 전환 엔진 + 모바일 SDK 배선 + 마이그레이션 27 Supabase 적용 완료). **잔여**: 실계정 연동, billing_retry 스케줄 함수, §7 복원 병합(위 In Progress 참고) |
| — | Phase 17 | ⚠️ 스캐폴딩 완료 (Edge Function 5종 + MasterAcceptPage + AdminMastersPage + 마이그레이션 28 Supabase 적용 완료). **잔여**: Edge Function 배포, 실제 이메일 발송 플로우 실증(위 In Progress 참고) |
| — | Phase 18 | ⚠️ 스캐폴딩 완료 (`retention-cleanup` + 3개 기존 함수 `retention_schedules` 연동 + `RetentionBanner` + 마이그레이션 29 Supabase 적용 완료). **잔여**: Edge Function 배포, pg_cron 등록, 실제 삭제 동작 실증(위 In Progress 참고) |
| — | Phase 19 | ✅ 완료 (관리자 CRUD + 사용자 열람/등록 + 학습하기/퀴즈 연동, 마이그레이션 30 Supabase 적용 완료). **잔여**: 실제 계정 전체 플로우 실증(위 In Progress 참고) |
| — | Phase 20 | ✅ 완료 (`AdminLayout` + `AdminHomePage` + `AdminAuditLogPage`, 기존 Master/공용 단어장 화면 재구성, 개인 데이터 미노출 검증). **잔여**: 실제 Admin 계정 실증(위 In Progress 참고) |
| — | Phase 21 | ✅ 완료 (`SettingsPage` 등급별 섹션 + `PricingPage` 동적 로드 + 마이그레이션 31 Supabase 적용 완료). **잔여**: 실제 구매 플로우 실증(위 In Progress 참고) |
| — | Phase 22 | ✅ 완료 (`dataExport.ts` + `SettingsPage` "데이터" 섹션, Guest 전용 가져오기). **잔여**: Pro/Premium/Master 내보내기 실증(위 In Progress 참고) |
| 1 | Phase 23 | ▶ 다음 작업 — 스피킹 재구현(평가 없는 신규 버전) — DB는 Phase 13에서 이미 완료, WebView 녹음 환경 검증(`docs/SPEAKING_DESIGN.md` §7) 선행 후 Repository/화면 구현 |
| 2 | Phase 24 | 동기화 고도화(오프라인 큐 등, MVP 이후) |
| — | 병행 | APK 재빌드(StatusBar), iOS/Android 알림 권한 실기기 테스트, 기존 RLS 최종 점검, service_role 키 노출 점검 — 정책 개편과 무관하게 계속 진행 |
