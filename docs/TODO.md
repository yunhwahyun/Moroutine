# TODO

---

## Doing

_현재 진행 중인 작업 없음_

---

## Todo

> **2026-07-18 정책 개편**: 구 "Phase 10 — Speaking MVP"(Beta/Free/Premium + Azure 평가)는 전량 폐기. 아래 Phase 11부터가 신규 계획이다. 배경은 `docs/DECISION_LOG.md` 2026-07-18 항목, 각 Phase의 상세 설계는 괄호 안 문서 참고. 구현 순서는 의존관계(권한→저장→DB/RLS→한도/이전→Master/보관→공용단어장→화면→부가기능)를 반드시 지킨다.

### Phase 11 — 권한 모델 (`docs/PERMISSION_DESIGN.md`) ✅ 완료 2026-07-18
- [x] Migration 13: profiles_role_access (`role`, `special_access` 컬럼 + `is_admin()` + `prevent_self_privilege_escalation` 트리거)
- [x] Migration 14: subscription_plans (+ 시드 데이터, `personal_word_limit`은 NULL 임시값 — 배포 전 확정 필요)
- [x] Migration 15: subscriptions (+ `get_service_tier()` SQL 함수)
- [x] `src/lib/permissions.ts` — `buildPermissions()` 순수 함수 + `GUEST_PERMISSIONS` 상수
- [x] `src/hooks/usePermissions.ts` — TanStack Query 기반 권한 로딩(`['permissions', userId]`)
- [x] `ProtectedRoute`에 `requireRole` prop 추가 (`role !== 'admin'`이면 홈으로 리다이렉트)
- [x] `web/src/types/index.ts`에 `AccountRole`/`SpecialAccess`/`PlanCode`/`SubscriptionStatus`/`Subscription`/`SubscriptionPlan`/`ServiceTier`/`Permissions` 타입 추가
- [x] `tsc -b` / `eslint` / `vite build` 전체 통과 확인
- [x] Supabase 프로젝트에 마이그레이션 13~15 실제 적용 완료(사용자 확인, Dashboard SQL Editor 경유)
- [ ] `/admin` 라우트가 아직 없어 `requireRole="admin"` 실사용처는 Phase 20에서 연결 예정(현재는 훅/컴포넌트만 준비된 상태)

### Phase 12 — Repository 계층 (`docs/DATA_STORAGE_DESIGN.md`) ⚠️ 부분 완료 2026-07-18
- [x] `src/repositories/types.ts` — `DataRepository` 인터페이스(wordbooks/words/studyResult/reviewQueue/schedules/settings)
- [x] `src/repositories/local/schema.ts` — Dexie `LocalDB` 정의(`wordbooks`/`words`/`schedules`/`studyResults`/`settings`/`meta` 스토어)
- [x] `src/repositories/local/LocalDataRepository.ts` — Guest 무제한 등록(한도 없음) 포함 전체 구현
- [x] `src/repositories/remote/RemoteDataRepository.ts` — 기존 페이지의 Supabase 호출 패턴을 그대로 반영해 구현. `bulkCreateWords`는 Phase 14에서 `create_words_checked` RPC로 교체 예정(현재는 무검증 삽입 — 기존 동작과 동일)
- [x] `src/repositories/factory.ts` — `getRepository(tier)` (admin은 `docs/ADMIN_DESIGN.md`의 AdminContentRepository를 Phase 19~20에서 별도 구현 예정이라 현재는 에러 throw)
- [x] `tsc -b` / `eslint` / `vite build` 전체 통과 확인(신규 코드는 아직 어디서도 import되지 않아 번들 크기 변화 없음 — 정상)
- [ ] WebView IndexedDB 검증 5개 항목 (DATA_STORAGE_DESIGN.md §5) — 실기기 필요, 미착수
- [ ] **`WordbookListPage.tsx`/`WordbookDetailPage.tsx`를 Repository 경유로 리팩터링 — 의도적으로 보류.**
      이유: 이 두 화면은 현재 `ProtectedRoute`(로그인 필수)로 막혀 있어 Guest가 애초에 도달할 수 없다.
      `docs/UI_FLOW.md` §0이 요구하는 "홈/단어장/학습/퀴즈/일정/스피킹을 Guest도 접근 가능한 공개 라우트로 전환"이
      아직 `routes/index.tsx`/`ProtectedRoute`에 반영되지 않은 상태에서 페이지 내부만 Repository로 바꾸면
      Guest는 여전히 `/login`으로 리다이렉트되어 실질적으로 아무 효과가 없고, 검증되지 않은 상태로 현재 잘 동작하는
      화면(수정/삭제/일괄등록 등)을 건드리는 리스크만 발생한다. **다음 순서**: 먼저 라우팅 공개 전환 작업(별도 Phase로
      분리 필요, 아래 "Phase 12.5" 참고) → 그 다음 이 두 화면 리팩터링.

### Phase 12.5 — Guest 라우팅 공개 전환 ✅ 완료 2026-07-18 (`docs/UI_FLOW.md` §0)
- [x] `routes/index.tsx` — 홈/단어장/학습/퀴즈/설정을 `ProtectedRoute` 밖 공개 라우트로 이동
      (일정 `/schedules*`은 `ScheduleListPage.tsx`가 `user!.id`를 직접 참조해 비로그인 시 런타임 에러가
      나므로 **의도적으로 계속 로그인 필수**로 남김 — 별도 후속 작업 필요, 아래 "다음 진행 시 참고" 참고)
- [x] `useStudyWords.ts`의 `useTodayStudyWords()` — Guest는 `LocalDataRepository`(전체 단어장 순회), 그 외 등급은
      기존 Supabase 직접 쿼리 유지(성능 회귀 없음)로 tier 분기
- [x] `WordbookListPage.tsx` — 목록/생성/수정/삭제/`mastered_count`/`fetchSelectedWords` 전부 `getRepository(tier)` 경유로 전환
- [x] `WordbookDetailPage.tsx` — 조회/단건등록/수정/일괄등록을 `getRepository(tier)` 경유로 전환.
      일괄등록 버튼은 `permissions.canBulkImport`가 false(Guest)면 숨김(§3.4 정책)
- [x] `HomePage.tsx`의 일정 미리보기 쿼리 — Guest는 아직 미연동이므로 `enabled: tier !== 'guest'`로 스킵(불필요한 401 방지)
- [x] `tsc -b` / `eslint .` / `vite build` 전체 통과
- [x] **Playwright(Chromium headless)로 실제 브라우저 검증** — 익명 상태로 `/` 방문 시 `/login` 리다이렉트 없음 확인,
      `/wordbooks`에서 단어장 생성 → 상세 진입 → 단어 등록까지 전부 IndexedDB(Dexie) 기반으로 성공,
      콘솔 에러 0건 확인(스크린샷 4장 확보)

### Guest 설정 영구 저장 ✅ 완료 2026-07-18
- [x] `useUserSettings.ts`(`useLoadSettings`/`useUserSettings`)를 tier 분기로 재작성 — Guest는 `LocalDataRepository`,
      나머지는 `RemoteDataRepository` 경유. `profiles` row ↔ `UserSettings` 매핑 코드가 이 훅에 중복 정의돼
      있던 것도 제거(RemoteDataRepository가 이미 동일 매핑을 내부에 갖고 있었음)
- [x] `tsc -b` / `eslint .` 통과

### Guest 일정(Schedule) 지원 ✅ 완료 2026-07-18
- [x] `DataRepository`에 `deleteSchedule`/`getScheduleExceptions`/`saveScheduleException`(자연키 upsert)/
      `getActiveNotifications`/`createNotifications`/`cancelNotifications`/`updateNotificationNativeId` 추가.
      `NotificationRecord` 타입 신설(`web/src/types/index.ts`)
- [x] `ScheduleInput`을 discriminated union으로 재정의(id 없으면 전체 필드 필수=생성, id 있으면 부분 필드=수정) —
      기존엔 수정 시에도 전체 필드를 요구해 `truncateFuture`/`splitAndUpdate`의 부분 업데이트를 표현할 수 없었음
- [x] `LocalDataRepository`/`RemoteDataRepository` 양쪽에 위 메서드 전부 구현. Dexie에 `scheduleExceptions`
      (복합 인덱스 `[schedule_id+occurrence_date]`), `notifications` 스토어 신설
- [x] `notificationScheduler.ts`를 `repository` 파라미터를 받도록 재작성(Supabase 직접 호출 제거),
      `useBridgeListener.ts`도 tier-aware하게 수정(`NOTIFICATION_RESULT` 수신 시 `updateNotificationNativeId` 호출)
- [x] `ScheduleListPage.tsx`(8개 mutation 전체: 생성/전체수정/이일정만수정(exception)/이후모두수정(split)/
      전체삭제/이일정만삭제(cancel exception)/이후모두삭제(truncate))를 전부 `getRepository(tier)` 경유로 리팩터링,
      `user!.id` 참조 완전히 제거
- [x] `routes/index.tsx` — `/schedules`, `/schedules/new`, `/schedules/:id/edit`을 공개 라우트로 이동,
      `ProtectedRoute` import 제거(더 이상 쓰이는 곳 없음 — Phase 20에서 `/admin`에 재도입 예정)
- [x] `tsc -b` / `eslint .` / `vite build` 전체 통과
- [x] **Playwright 실브라우저 검증**: Guest로 `/schedules` 방문(리다이렉트 없음) → 단발성 일정 생성(alarm_minutes
      정확히 저장) → 매일 반복 일정 생성 → "이 일정만 수정" 시나리오로 반복 범위 선택 모달 → `schedule_exceptions`에
      `exception_type: 'modified'` 레코드가 정확한 occurrence_date로 생성됨을 IndexedDB에서 직접 확인. 콘솔 에러 0건
- [x] **알려진 테스트 한계(제품 버그 아님)**: Playwright로 시작일(`<input type="date">`)을 미래 날짜로 설정해
      알림(`notifications`) 생성까지 확인하려 했으나, 헤드리스 Chromium에서 네이티브 date input에 대한
      `.fill()`/`.type()` 모두 DOM 값은 바뀌어도 React `onChange`가 반영되지 않는 현상 발견 — 제목 등 다른
      필드는 정상 반영되는 것으로 보아 date input 특유의 자동화 한계로 판단(이 세션에서 `ScheduleFormPanel`/
      `buildStartsAt`/`defaultForm`은 손대지 않음 — 기존 코드 그대로). `createNotifications`/`getActiveNotifications`
      등은 schedules/exceptions와 동일한 패턴으로 구현되어 코드 검토상 정상이나, 미래 날짜 시나리오는
      실기기 또는 별도 날짜 입력 방식으로 재검증 권장

### Guest 학습/복습 상태 저장 ✅ 완료 2026-07-18 (Phase 12.5 후속)
- [x] `DataRepository`에 `createStudySession`/`completeStudySession` 추가, `LocalDataRepository`(Dexie `studySessions` 스토어 신설)·`RemoteDataRepository`(기존 Supabase 로직 이관) 양쪽 구현
- [x] `lib/studySession.ts` 삭제 — repository 메서드와 1:1 중복되는 래퍼였음(QuizPage/LearnPage가 이제 repository를 직접 호출)
- [x] `wordStatus.ts`의 `applyQuizAnswer()`가 `repository.updateWord()`를 경유하도록 수정(Supabase 직접 호출 제거) — Guest의 복습 스케줄(status/review_step/next_review_at/wrong_count)이 이제 IndexedDB에 저장됨
- [x] 부수 발견: `Word.review_step` 타입이 `0 | 1 | 2 | 3`으로 과도하게 좁게 선언되어 있었음(실제로는 `reviewIntervals` 설정이 최대 5단계까지 허용). 타입을 `number`로 수정(pre-existing 버그, `applyQuizAnswer`를 타입 안전한 경로로 바꾸는 과정에서 컴파일 에러로 발견)
- [x] 부수 발견 및 수정: React StrictMode 개발 모드 이중 마운트로 `createStudySession`이 퀴즈/학습 1회당 2번 호출되어 `study_sessions` 중복 생성되는 잠재 버그(정책 개편 이전부터 존재) 발견 → `sessionCreatedRef` 가드로 QuizPage/LearnPage 둘 다 수정
- [x] `tsc -b` / `eslint .` / `vite build` 전체 통과
- [x] **Playwright 실브라우저 검증**: Guest로 단어장 생성 → 단어 4개 등록 → 퀴즈 시작 → 4문제 전부 정답 →
      IndexedDB 직접 조회로 word.status가 `unseen→reviewing`, `review_step=1`, `next_review_at`이 설정된
      `reviewIntervals[0]`(기본 7일) 뒤로 정확히 계산됨을 확인. `study_sessions` 레코드도 정확히 1개만
      생성되고 `correct_count=4`로 완료 처리됨을 확인. 콘솔 에러 0건

**남은 것**: Guest의 "오답" 경로(`reviewPolicy='downgrade'` 강등 로직)는 코드 변경이 없는 순수 로직이라 별도 검증하지
않음(정답 경로로 저장 메커니즘 자체가 동작함을 이미 확인했으므로 로직 정확성은 기존 그대로 신뢰). 필요 시 후속 세션에서
오답 시나리오도 Playwright로 확인 가능.

### Phase 13 — Supabase 스키마/RLS (`docs/DB_SCHEMA.md` 마이그레이션 16~24) ✅ 완료 2026-07-18
- [x] Migration 16: subscription_webhook_support (`processed_webhook_events`, `subscription_audit_log` — 둘 다 RLS enable만, authenticated 정책 없음 = service_role 전용)
- [x] Migration 17: public_wordbooks_words (`public_wordbooks`, `public_words` + `sync_public_word_count` 트리거)
- [x] Migration 18: user_public_progress (`user_public_wordbook_enrollments`, `user_public_word_progress`)
- [x] Migration 19: master_invitations
- [x] Migration 20: admin_audit_log (`actor_id NOT NULL` — 시스템 작업 기록용 nullable 완화는 결정 필요 항목으로 TODO 코멘트만 남김)
- [x] Migration 21: migration_engine (`migration_jobs`/`migration_id_map`/`device_migration_status`. `migration_id_map`은 authenticated 정책 없음 = service_role/RPC 전용)
- [x] Migration 22: retention_schedules
- [x] Migration 23~24: speaking_sentences/speaking_recordings — 원래 Phase 23(스피킹 재구현) 몫이지만 `docs/DB_SCHEMA.md` 마이그레이션 인덱스가 16~24를 한 세트로 묶어놔서 이번에 함께 작성. **클라이언트 연동(Repository/화면)은 여전히 Phase 23에서 진행**
- [x] 참조 순서 검증(grep으로 `is_admin`/`get_service_tier`/`public_wordbooks`/`public_words`/`speaking_sentences`/`migration_jobs` 참조가 전부 정의 이후 마이그레이션에서만 쓰였는지 확인) + 괄호/세미콜론 기본 문법 점검
- [x] Supabase 프로젝트에 마이그레이션 16~24 실제 적용 완료(사용자 확인, Dashboard SQL Editor 경유)
- [x] RLS 정책 전체 적용 후 `docs/PERMISSION_DESIGN.md` §7 요구사항 표(15개 원칙) 대조 — 13개 항목 충족 확인.
      나머지 2개(**Pro 단어 한도는 서버에서 최종 검증**, **초대 토큰은 서버에서만 검증**)는 RLS만으로는 표현할 수 없는
      RPC/Edge Function 로직이라 아직 미충족 — 각각 Phase 14(`create_words_checked` RPC)와 Phase 17(`master-accept`
      Edge Function)에서 자연스럽게 채워질 예정이므로 Phase 13 범위 미비가 아님

### Phase 14 — Pro 단어 한도 ✅ 완료 2026-07-18 (`docs/SUBSCRIPTION_DESIGN.md` §4)
- [x] Migration 25: `create_words_checked` RPC (advisory lock + 원자적 한도 검증, jsonb 반환에 `inserted` 행 포함)
- [x] `DataRepository`에 `getPersonalWordCount()` 추가(Local/Remote), `WordLimitExceededError` 타입 신설
- [x] `RemoteDataRepository.createWord()`/`bulkCreateWords()`를 전부 이 RPC 경유로 전환(직접 `words.insert()` 호출 경로 제거)
- [x] `WordbookDetailPage.tsx` — 일괄등록 사전 계산 미리보기 UI(현재 수/추가 예정/중복 제외/오류 행/등록 후 예상/한도/등록 가능 여부) + "등록"/"취소" 확인 단계 추가(기존엔 파일 선택 즉시 등록되던 것을 미리보기 확인 후 등록으로 변경). 단건 등록 한도 초과 시 폼 에러 메시지 표시
- [x] `WordbookListPage.tsx` — Pro 등급 개인 단어 한도 현황 배너(N/한도, 도달 시 Premium 업그레이드 링크)
- [x] `/pricing` placeholder 페이지 신설(Phase 21에서 실제 내용 채울 예정) + 공개 라우트 등록
- [x] `tsc -b` / `eslint .` / `vite build` 전체 통과
- [x] Supabase 프로젝트에 마이그레이션 25 적용 필요(아래 확인 요망)
- [x] **Playwright 실브라우저 검증**: 미리보기 계산 로직(Guest 게이트 임시 우회 후 즉시 원복)을 기존 단어 1개 +
      업로드 파일(정상 3행/중복 2행/오류 1행)로 검증 — "현재 1개/추가 예정 3개/중복 제외 2개/오류 행 1개/등록 후
      예상 4개" 정확히 계산, 등록 후 실제 결과도 일치. 콘솔 에러 0건
- [ ] **한계**: RPC의 서버측 한도 차단(`blocked=true`)은 실제 Pro 계정이 없어 이 세션에서 직접 검증하지 못함.
      SQL 로직 리뷰로 정확성을 신뢰하나, 실제 Pro 계정 확보 후 사후 검증 권장(특히 `personal_word_limit`을
      임시로 낮은 값 — 예: 5 — 로 설정해 두 대의 브라우저 탭으로 동시 등록해 advisory lock의 Race Condition
      방지도 함께 확인하는 것을 권장)

### Phase 15 — Guest→Remote 이전 엔진 ✅ 완료 2026-07-18 (`docs/MIGRATION_DESIGN.md`)
- [x] Migration 26: `migrate_wordbooks`/`migrate_words`/`migrate_schedules`/`migrate_schedule_exceptions`/
      `migrate_study_sessions`/`migrate_study_results` RPC 6종(설계 문서의 `migrate_guest_words` 단일 함수
      계획을 엔티티별 6개로 구체화 — words 외 다른 엔티티도 이전 대상이라 필요). 각 RPC는 `(migration_id,
      entity_type, local_id)` Idempotency로 재실행 시 중복 없이 이어받고, `TABLE(local_id, server_id)`를
      반환해 클라이언트가 부모→자식 remap에 바로 활용
- [x] `web/src/lib/migration/localSnapshot.ts` — localDB 직접 조회로 로컬 ID 보존한 전체 스냅샷 + 요약 계산
- [x] `web/src/lib/migration/guestToRemoteMigration.ts` — `migration_jobs` 생성/재개, 청크 업로드(200개 단위),
      지수 백오프 재시도(3회), 부모-자식 순서 보장(wordbooks→words→schedules→schedule_exceptions→
      study_sessions→study_results), 이전된 일정 중 알림 설정된 것만 `refreshScheduleNotifications()`로 재예약
- [x] `useGuestMigration` 훅 + `GuestMigrationModal`/`GuestMigrationGate` — `docs/UI_FLOW.md` 스펙대로 요약 카드
      + 진행률 바 + 완료 후 로컬 유지/삭제 선택 + 실패 시 "로컬 데이터는 안전하게 보존되어 있습니다" 안내
- [x] `App.tsx`에 `GuestMigrationGate` 마운트 — `usePermissions()`의 serviceTier가 pro/premium/master로
      확인되고 로컬 데이터가 있으면 모달 트리거(세션당 1회, sessionStorage로 억제)
- [x] `tsc -b` / `eslint .` / `vite build` 전체 통과
- [x] Supabase 프로젝트에 마이그레이션 26 적용 완료(사용자 확인, Dashboard SQL Editor 경유, 2026-07-18)
- [x] **Playwright 실브라우저 검증**: 게이트 조건을 임시로 우회(검증 후 즉시 원복)해 모달 트리거·요약 정확성·
      실패 시 안전장치(로컬 데이터 보존)를 확인. **이 과정에서 실제 버그를 발견해 수정**: `getOrCreateMigrationJob`
      실패 시 `onProgress`가 호출되지 않아 UI가 멈춰 있던 문제. 원복 후 Guest 상태에서 모달이 절대 안 뜨는
      회귀 테스트도 통과(콘솔 에러 0건)
- [ ] **한계**: RPC의 실제 원격 저장 성공 경로(청크 업로드가 정말 wordbooks/words를 정확히 써넣는지)는 실제
      Pro/Premium/Master 계정이 없어 검증 못함. SQL 로직 리뷰로 정확성 신뢰, 실제 계정으로 사후 검증 권장
- [ ] **미구현 스코프**: "나중에 하기" 선택 시 배너 상시 노출(원문 §2) — 지금은 세션당 1회 모달만, 배너는 후속 작업
- [ ] Remote → Local 방향(구독 만료/Master 해제)은 이번 범위 밖 — Phase 16/17에서 트리거 연결 시 이 엔진의
      청크/Idempotency 패턴을 재사용해 구현 예정

### Phase 16 — 구독/결제 (`docs/SUBSCRIPTION_DESIGN.md` §3, §6) ⚠️ 스캐폴딩 완료 2026-07-18 (실계정 연동 전)
- [x] Migration 27: `subscriptions.billing_retry_started_at` 컬럼 + `subscriptions` realtime publication 추가
- [x] Edge Function `revenuecat-webhook` (서명 검증, Idempotency, `subscription_audit_log`, event.type 8종 분기) — `supabase/functions/revenuecat-webhook/index.ts`. `ENTITLEMENT_TO_PLAN` 매핑은 실제 RevenueCat 대시보드 확정 후 재확인 필요
- [x] 브리지 메시지 확장: `SET_USER_ID`/`PURCHASE_REQUEST`/`RESTORE_PURCHASES`(web→native), `PURCHASE_RESULT`/`RESTORE_RESULT`(native→web) — `web/src/types/bridge.ts`, `mobile/src/types/bridge.ts` 양쪽 동기화. `useBridgeListener.ts`가 `PURCHASE_RESULT`/`RESTORE_RESULT` 수신 시 `['permissions', userId]` 쿼리 무효화(네이티브 결과 자체를 권한으로 신뢰하지 않음)
- [x] RevenueCat SDK 연동(모바일): `react-native-purchases` 의존성 추가, `mobile/App.tsx`에 `Purchases.configure()` 초기화 + `SET_USER_ID`/`PURCHASE_REQUEST`/`RESTORE_PURCHASES` 핸들러. `mobile/.env.example` 신규(`EXPO_PUBLIC_REVENUECAT_API_KEY_IOS`/`_ANDROID`)
- [x] 구독 만료/해지 → Guest 전환 엔진(§6 절차) + 강제 안내 모달: `web/src/lib/migration/remoteToLocalMigration.ts`(서버 UUID를 로컬 id로 그대로 사용해 RPC 없이 직접 조회+`bulkPut`), `web/src/lib/deviceId.ts`, `useSubscriptionDowngrade.ts`, `DowngradeGate.tsx`/`DowngradeModal.tsx`(App.tsx 마운트, `docs/UI_FLOW.md` 목업대로 닫기 불가 + "지금 저장하고 계속하기" 버튼)
- [x] `useSubscriptionRealtimeSync.ts` 신설 — `usePermissions()`의 5분 staleTime 한계를 보완해 `subscriptions` 테이블 변경을 postgres_changes로 즉시 감지, `['permissions', userId]` 무효화
- [x] `tsc -b` / `eslint .`(기존 미해결 이슈 3건 제외, Phase 16 변경 파일은 0건) / `vite build`(web), `tsc --noEmit`(mobile) 전체 통과. Edge Function은 로컬에 Deno/Supabase CLI가 없어 문법 검증(괄호 균형 + Node tsc `--noResolve`로 Deno 전용 구문 제외 확인)까지만 수행 — 실제 동작은 실계정 연동 후 검증 필요
- [x] Supabase 프로젝트에 마이그레이션 27 적용 완료(사용자 확인, Dashboard SQL Editor 경유, 2026-07-18)
- [ ] **한계(실계정 미준비)**: RevenueCat 프로젝트 생성, 스토어 상품/Entitlement 설정, `REVENUECAT_WEBHOOK_TOKEN`/`SUPABASE_SERVICE_ROLE_KEY` 시크릿 등록, `supabase functions deploy`, 실기기 결제/복원 테스트, EAS 빌드 — 전부 미착수
- [ ] **한계**: billing_retry 30일 경과 시 자동 `expired` 처리용 스케줄 Edge Function(`subscription-retry-timeout`)은 Phase 18 `retention-cleanup`과 같은 성격(pg_cron 등록 필요)이라 미구현. `billing_retry_started_at` 컬럼만 준비됨
- [ ] **이월**: 3개월 이내 복원 병합 로직(`docs/SUBSCRIPTION_DESIGN.md` §7, `docs/MIGRATION_DESIGN.md` §7) — 중복 판정 UI/기기 선택 UX가 설계 문서 자체에 "결정 필요"로 남아 있어 다음 세션에서 별도 진행
- [x] **정책 명문화(2026-07-19)**: "결제 없는 회원가입 미지원" 정책 확정 — `docs/PERMISSION_DESIGN.md` §2-1 / `docs/SUBSCRIPTION_DESIGN.md` §6 / `docs/UI_FLOW.md`에 반영, `DowngradeModal.tsx` 강제 전환 문구를 "구독이 종료되었습니다" → "유효한 구독이 없습니다"로 일반화(만료/미결제 공통). `docs/DECISION_LOG.md` 2026-07-18 항목 참고
- [x] **회원가입 완료 직후 `/pricing` 강제 라우팅 ✅ 완료 2026-07-19**: `web/src/lib/signupFlow.ts`(localStorage 플래그 `markSignupPending`/`isSignupPending`/`clearSignupPending`) 신설. `LoginPage.tsx`의 `signUp()` 성공 시 플래그를 남기고, 신규 `web/src/components/onboarding/SignupPricingGate.tsx`(App.tsx `AuthProvider`에 `GuestMigrationGate`/`DowngradeGate`와 나란히 마운트)가 `authenticated+guest` 상태에서 이 플래그를 보고 어느 화면이든 `/pricing`으로 되돌린다. **결정 사항**: 세션이 아닌 localStorage 채택(이메일 인증 링크가 새 브라우저 컨텍스트에서 열려도 같은 기기면 유지), "결제 없는 회원가입 없음" 정책의 기존 집행자인 `DowngradeGate`는 건드리지 않고 플래그가 켜진 동안만 스스로 비활성화하도록 조건 추가(`!isSignupPending()`) — 만료/Master 해제 등 기존 경로는 완전히 무변경. `PricingPage.tsx`에 플래그가 켜진 사용자 전용 "무료로 계속 사용하기" 버튼 추가(기존 `useSubscriptionDowngrade` 엔진 재사용, 성공 시에만 플래그 해제, 실패 시 재시도 유지). `tsc -b`/`eslint`(변경 파일 전부 클린, 기존 미해결 이슈 6건은 무관)/`vite build` 통과. **Playwright 실브라우저 검증**: Guest로 `/pricing`·`/`·`/wordbooks` 방문 시 회귀 없음(버튼 미노출, 리다이렉트 없음, 콘솔 에러 0건) 확인. **한계**: 실제 이메일 인증을 거친 신규 가입 계정으로 "가입→인증→`/pricing` 강제 이동→무료로 계속 사용하기 또는 결제" 전체 플로우는 실계정 필요해 미검증(Supabase에 실제 사용자를 생성하는 부작용이 있어 이번 세션에서 시도하지 않음)

### Phase 17 — Master 초대/해제 (`docs/MASTER_INVITATION_DESIGN.md`) ⚠️ 스캐폴딩 완료 2026-07-18 (실계정 이메일 발송 테스트 전)
- [x] Migration 28: `prevent_self_privilege_escalation` 트리거 수정(service_role 예외) + `master_invitations.token_hash` nullable + `list_masters()` RPC + `profiles` realtime publication — 구현 중 발견한 마이그레이션 13의 트리거 버그(service_role의 정당한 `special_access` 갱신까지 되돌리던 문제) 선행 수정 포함
- [x] Edge Function 5종: `master-invite` / `-resend` / `-revoke` / `master-accept` / `master-revoke` — `supabase/functions/master-*/`, 공용 헬퍼는 `supabase/functions/_shared/`(`cors.ts`/`auth.ts`/`masterInvite.ts`, 프로젝트 최초의 `_shared`)
- [x] **편차**: 자체 crypto 토큰 검증 대신 Supabase 세션 인증(`inviteUserByEmail`/`signInWithOtp` 폴백)으로 단순화 — 근거는 `docs/DECISION_LOG.md` 2026-07-18
- [x] `MasterAcceptPage`(`/master/accept`) — 세션 기반, 비밀번호 생성 폼 없음(매직 링크 로그인으로 대체)
- [x] `AdminMastersPage`(`/admin/masters`) — Phase 20 이전 최소 placeholder(초대 폼 + 초대 목록 + 현재 Master 목록 통합), `ProtectedRoute requireRole="admin"`으로 보호
- [x] `useSubscriptionRealtimeSync`에 `profiles` 구독 추가 — Master 부여/해제도 실시간 반영
- [x] `tsc -b`/`eslint .`/`vite build`(web) 통과. Edge Function은 로컬에 Deno/Supabase CLI가 없어(Phase 16과 동일한 한계) Node `tsc --noResolve`로 문법 검증까지만 수행 — 이 과정에서 `!x.ok` negation이 boolean 판별 유니온을 좁혀주지 못하는 TS 타입 버그를 실제로 발견해 `x.ok === false`로 수정
- [x] Supabase 프로젝트에 마이그레이션 28 적용 완료(사용자 확인, Dashboard SQL Editor 경유, 2026-07-18)
- [ ] **한계**: Edge Function 배포(`supabase functions deploy`), `SITE_URL` 시크릿 등록, 실제 초대 이메일 발송/수락/Master 해제 전체 플로우 검증은 Supabase 프로젝트의 이메일(SMTP) 설정 확인 후 사용자가 진행 필요

### Phase 18 — 데이터 보관/알림/삭제 (`docs/DATA_RETENTION_DESIGN.md`) ⚠️ 스캐폴딩 완료 2026-07-18 (pg_cron 미등록)
- [x] Migration 29: `admin_audit_log.actor_id` nullable(시스템 실행 감사 로그용)
- [x] Scheduled Edge Function `retention-cleanup` — `supabase/functions/retention-cleanup/index.ts`. 부모 테이블(`wordbooks`/`schedules`/`study_sessions`/`user_public_wordbook_enrollments`/`user_public_word_progress`/`speaking_sentences`)만 삭제, 자식은 기존 FK CASCADE로 자동 삭제
- [x] `revenuecat-webhook`/`master-revoke`/`master-accept`에 `retention_schedules` 생성/취소 연동 추가 — 마이그레이션 22에서 만들어졌지만 지금까지 아무도 쓰지 않던 테이블을 실제로 채우기 시작
- [x] **편차**: `retention-notify`(이메일 발송) 대신 `RetentionBanner`(앱 내 배너, `web/src/components/retention/RetentionBanner.tsx`, `AppLayout` 마운트) — Supabase Auth 기본 메일 템플릿이 임의 내용 알림에 맞지 않아 채택. 근거는 `docs/DECISION_LOG.md` 2026-07-18
- [x] `tsc -b`/`eslint .`/`vite build`(web) 통과. Edge Function은 Phase 16/17과 동일하게 문법 검증까지만(Deno/Supabase CLI 없음)
- [x] Supabase 프로젝트에 마이그레이션 29 적용 완료(사용자 확인, Dashboard SQL Editor 경유, 2026-07-18)
- [ ] **한계**: `retention-cleanup` 배포(`supabase functions deploy`), pg_cron 확장 활성화 + `cron.schedule` 등록은 사용자가 Dashboard에서 직접 진행 필요. 실제 삭제 동작(3개월 경과 데이터 검증)은 배포 후 사후 검증 권장
- [ ] **미구현(범위 밖)**: Storage(`speaking-recordings/`) 삭제 — Phase 23(스피킹) 미착수라 실제 파일이 없음. 데이터 삭제 고지의 법적 필수 안내 해당 여부는 법무 검토 필요(임의 결정 안 함)

### Phase 19 — 공용 단어장 (`docs/ADMIN_DESIGN.md` §3) ✅ 완료 2026-07-19
- [x] Migration 30: `public_wordbooks`/`public_words` AFTER INSERT/UPDATE 트리거가 `admin_audit_log`에 자동 기록(§4 "트리거 방식" 채택)
- [x] `web/src/lib/publicWordbooks.ts` — Admin/사용자 양쪽 함수, `DataRepository`와 무관한 독립 모듈(Guest 접근 불가, Admin은 tier 시스템 밖)
- [x] Admin CRUD 화면: `AdminWordbookListPage`(`/admin/wordbooks`, 상태 필터)/`AdminWordbookFormPage`(`/admin/wordbooks/new`)/`AdminWordbookDetailPage`(`/admin/wordbooks/:id`, 메타 인라인 수정 + 상태 전환 + 단건/`.txt` 일괄등록 + 단어별 보관). **편차**: `/admin/wordbooks/:id/words/new` 별도 라우트는 만들지 않고 상세 페이지 인라인 폼으로 통합, 순서 변경(드래그 앤 드롭) UI는 생략(생성 순서만 지원)
- [x] 사용자 열람/등록 화면: `PublicWordbookListPage`(`/public-wordbooks`, 게시된 단어장 목록 + 담기/담기해제)/`PublicWordbookViewPage`(`/public-wordbooks/:id`, 단어 목록 열람 + 학습하기/퀴즈 버튼). **편차**: "단어장 내 탭" 대신 `WordbookListPage` 헤더 링크로 단순화
- [x] 학습하기/퀴즈 연동: `web/src/lib/wordStatus.ts`의 상태 전이 계산을 `computeQuizAnswerUpdate()` 순수 함수로 추출(개인/공용 공유) + `publicWordbooks.ts`에 `getPublicWordProgressMap`/`upsertPublicWordProgress`/`applyPublicQuizAnswer`/`toStudyWord`(어댑터) 추가 + `QuizPage.tsx`/`LearnPage.tsx`에 공용 모드 분기(개인 `study_sessions`/`study_results` 기록은 스킵, `user_public_word_progress`에만 저장). `Quiz.tsx`는 애초에 범용적으로 짜여 있어 무수정 재사용. **범위 밖**(`docs/DECISION_LOG.md` 2026-07-19): "오늘의 복습"에 공용 단어 합치기, 여러 공용 단어장 동시 선택 학습
- [x] `tsc -b`/`eslint .`/`vite build`(web) 통과
- [x] Supabase 프로젝트에 마이그레이션 30 적용 완료(사용자 확인, Dashboard SQL Editor 경유, 2026-07-19)
- [ ] **한계**: 실제 Admin/Pro 계정으로 "생성→게시→Pro 열람/등록/학습/퀴즈" 전체 플로우는 실계정 필요해 미검증

### Phase 20 — 관리자 화면 (`docs/ADMIN_DESIGN.md` §2) ✅ 완료 2026-07-19
- [x] `/admin/**` 라우트 + 전용 레이아웃 — `AdminLayout`(하단 탭 없음, 상단 탭 홈/공용 단어장/Master 관리/감사 로그 + "앱으로 돌아가기"), `AdminHomePage`(`/admin`, 3개 섹션 카드) 신규. 기존 Phase 17/19의 `/admin/masters`, `/admin/wordbooks*` placeholder를 이 레이아웃 하위로 재구성(각자 자체 "홈으로" 헤더 링크는 제거)
- [x] `admin_audit_log` 조회 화면 — `AdminAuditLogPage`(`/admin/audit-log`), 최신 200건 직접 조회(RLS 허용, `list_masters()`류 조인 RPC는 만들지 않고 `actor_id` 그대로 표시)
- [x] 일반 사용자 개인 데이터 미노출 검증 — `web/src/pages/admin/`, `web/src/lib/publicWordbooks.ts`, `supabase/functions/master-*` 전체를 개인 데이터 테이블(`words`/`wordbooks`/`study_sessions`/`study_results`/`schedules`/`notifications`)로 grep, 0건 확인(`docs/ADMIN_DESIGN.md` §7-1에 체크리스트로 기록)
- [x] `tsc -b`/`eslint .`/`vite build`(web) 통과
- [ ] **한계**: 실제 Admin 계정으로 `/admin` 진입 → 탭 이동 → 감사 로그 표시 확인은 실계정 필요해 미검증

### Phase 21 — 설정/요금제 화면 (`docs/UI_FLOW.md` §3) ✅ 완료 2026-07-19
- [x] Migration 31: `subscription_plans` SELECT 정책을 `TO anon, authenticated`로 확장 — Guest도 `/pricing` 요금제 비교표를 볼 수 있게(기존 정책은 로그인 사용자만 허용해 Guest가 아예 못 읽던 버그성 제약이었음)
- [x] `SettingsPage` 등급별 계정 섹션 분기(Guest/Pro/Premium/Master/Admin) — 저장 위치 안내, 단어 등록 상태(Pro는 `getPersonalWordCount()`로 실사용량 표시), 결제 CTA, 로그인/로그아웃, Admin 전용 "관리자 화면으로 이동" 링크. **편차**: "동기화" 항목은 추적 중인 동기화 타임스탬프가 없어(실시간 직접 쓰기 구조) "실시간 동기화 중" 정적 문구로 대체. "데이터" 섹션(내보내기/가져오기)은 Phase 22로 이월
- [x] `PricingPage`(`/pricing`) — `subscription_plans` 동적 로드(한도/일괄등록/공용단어장/동기화), 네이티브에서만 `bridge.requestPurchase` 구매 버튼 노출(웹은 안내만), `PURCHASE_RESULT`/`RESTORE_RESULT` 페이지 자체 피드백. **편차**: 가격은 플레이스홀더 텍스트(DB에 가격 컬럼 자체가 없고 RevenueCat 실계정도 없어 동적 로드 불가)
- [x] "구독 관리" 버튼: 새 브리지 메시지 없이 웹은 `window.open`으로 스토어 URL, 네이티브는 안내 문구만(`docs/DECISION_LOG.md` 2026-07-19)
- [x] `tsc -b`/`eslint .`/`vite build` 통과. **Playwright 실브라우저 검증**: Guest로 `/settings`(콘솔 에러 0건) + `/pricing` 방문 — `/pricing`에서 `subscription_plans` 조회가 401(마이그레이션 31 미적용 상태라 예상된 결과, 적용 후 해소됨) 외 정상 렌더링 확인
- [x] Supabase 프로젝트에 마이그레이션 31 적용 완료(사용자 확인, Dashboard SQL Editor 경유, 2026-07-19)
- [ ] **한계**: 실제 Pro/Premium 계정으로 구매/업그레이드 플로우 전체 미검증

### Phase 22 — 데이터 내보내기/가져오기 (`docs/DATA_STORAGE_DESIGN.md` §13) ✅ 완료 2026-07-19
- [x] `web/src/lib/dataExport.ts` — `buildBackup(tier, repository)`(Guest는 `readLocalSnapshot()` 재사용, Remote는 `remoteToLocalMigration.ts`와 동일한 직접 Supabase 조회 패턴) + `downloadJson`/`downloadWordsCsv`(BOM 포함 CSV) + `parseBackupFile`(schemaVersion 검증, 손상 시 전체 거부) + `importBackupToLocal`(Guest 전용, `bulkPut`으로 원본 ID 보존) + `clearAllLocalData`
- [x] `SettingsPage.tsx`에 "데이터" 섹션 신설 — 전 등급(Admin 제외) "전체 백업 다운로드"/"단어 목록 CSV 내보내기", Guest 전용 "백업 파일 가져오기"(개수 미리보기 확인 단계 포함)/"로컬 데이터 초기화"
- [x] **편차**: 가져오기는 Guest 전용(Pro/Premium/Master는 Supabase가 정본이라 내보내기만 필요, `docs/UI_FLOW.md` §3 표에 이미 반영된 비대칭). 중복 데이터는 사용자 선택 없이 항상 덮어쓰기 고정(Dexie `bulkPut`). 청크 처리 불필요(Dexie 단일 호출로 충분)
- [x] `tsc -b`/`eslint .`/`vite build` 통과. **Playwright 실브라우저 검증**: Guest로 단어장/단어 생성 → JSON 백업 다운로드 → 로컬 데이터 초기화(0건 확인) → 방금 받은 백업으로 가져오기 → 원래 데이터 정확히 복원 확인, CSV 내보내기도 헤더/데이터 행 정확 확인, 콘솔 에러 0건
- [ ] **한계**: Pro/Premium/Master의 "내보내기"는 실제 계정이 없어 직접 검증 못함(코드 리뷰로 정확성 신뢰). 녹음 파일 ZIP 내보내기는 스피킹 기능(Phase 23) 미착수라 범위 밖

### Phase 23 — 스피킹 재구현 (`docs/SPEAKING_DESIGN.md`)
- [ ] WebView 녹음 환경 검증 6개 항목(§7, Azure 관련 2개 항목 제거됨)
- [ ] Migration 23~24: speaking_sentences, speaking_recordings
- [ ] `SpeakingListPage` / `SpeakingSentenceFormPage` / `SpeakingRecordPage`
- [ ] `web/src/types/bridge.ts`에 START_RECORDING/STOP_RECORDING/RECORDING_COMPLETE/RECORDING_ERROR 추가
- [ ] Native Bridge 녹음 폴백(§8) — WebView 검증 실패 시에만 착수

### Phase 24 — 동기화 고도화 (MVP 이후)
- [ ] 오프라인 작업 큐, 충돌 해결(§25 검토 항목은 MVP 범위 아님 — 착수 전 재확인)

### QA / 배포

- [x] 웹앱 Vercel 배포
- [x] RN WebView source.uri 프로덕션 URL 연결
- [ ] APK 재빌드 (StatusBar dark 변경 반영)
- [ ] iOS/Android 알림 권한 흐름 기기 테스트
- [ ] RLS 정책 (TO authenticated + WITH CHECK) 최종 점검
- [ ] service_role 키 노출 여부 최종 점검

### 기술 부채

- [x] `STATUS_LABEL` / `STATUS_COLOR` → `src/lib/wordConstants.ts`로 추출 완료
- [ ] `notificationScheduler.ts` — schedule_exceptions 반영 알림 지원 (MVP 이후)
- [ ] Edge Function quiz/start, quiz/answer 구현 (MVP 이후, 현재 클라이언트 직접 처리)

### 테스트 우선순위 (정책 개편, Phase 11~23 완료 후 순차 적용)

> 전체 시나리오는 각 설계 문서 하단 참고. 여기서는 실행 순서(P0=가장 먼저)만 정리.

| 우선순위 | 영역 | 핵심 시나리오 |
|---|---|---|
| P0 | 권한 판정 | Admin/Master/Premium/Pro/Guest 우선순위 정확성, Master 해제 즉시 반영, Admin 자기 자신 role 변경 시도 차단 |
| P0 | Pro 단어 한도 | 단건/일괄/CSV/복사/API 경로 전부 서버 검증, 동시 등록 Race Condition(advisory lock) |
| P0 | Guest 로컬 저장 | 최초 실행, 무제한 등록, 앱 재실행 후 데이터 유지, WebView IndexedDB 검증 |
| P1 | Guest→Pro 전환 | 한도 이하/동일/초과 3케이스, 신규 등록 차단→재허용, 네트워크 중단 재시도 |
| P1 | Guest→Premium 전환 | 무제한 이전, 대량 데이터, 녹음 파일 이전 |
| P1 | 구독 만료→Guest | 로컬 이전 성공/실패, 오프라인 downgrade_pending, 성공 검증 전 삭제/로그아웃 금지 |
| P1 | Master 초대/삭제 | 초대 발송~수락 전체 플로우, 만료/재사용 링크 차단, 유료 구독 있는 상태에서 해제 |
| P2 | 3개월 보관/알림/삭제 | retention-cleanup 멱등성, 삭제 전 알림 발송, 앱 미실행 사용자 삭제 확인 |
| P2 | 공용 단어장 | Admin CRUD, 일반 사용자 수정 차단(RLS), archived 후 학습기록 유지 |
| P2 | Admin 격리 | 사용자 개인 데이터 접근 차단(RLS SELECT 0건 확인), 감사 로그 기록 |
| P3 | 여러 기기 | 기기별 이전 상태 독립성, 3개월 보관 정책만으로 삭제 판단 |

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
- [x] Safe-area 전체 적용 (AppLayout, LearnPage, WordbookDetailPage, Quiz, QuizCompletePage, QuizPage, ScheduleFormPage)
- [x] BottomNav +10px 하단 여백 + fit-content 중앙 정렬 + gap-5 아이콘 간격
- [x] Quiz TTS — 객관식 단어 카드 발음 듣기 버튼
- [x] Quiz STT — useSpeechRecognition + Bridge START_STT/STOP_STT/STT_RESULT
- [x] Quiz 주관식 voice 모드 input 표시 (readOnly + 음성 인식 결과 자동 반영)
- [x] Speaking Feature 전체 설계 (docs/SPEAKING_DESIGN.md)
- [x] dead code 삭제 (reviewSchedule.ts, quizSessionStore.ts)
- [x] icons.tsx 생성 및 각 파일에서 import로 교체
- [x] Quiz.tsx handleNext dead branch 정리
- [x] Spinner 컴포넌트 추출
- [x] LearnPage.tsx MOCK_WORDS 찌꺼기 제거
- [x] ScheduleListPage.tsx 로컬 EditIcon/Spinner → 공용 컴포넌트로 교체
- [x] DESIGN.md → docs/ 8개 파일로 분리
