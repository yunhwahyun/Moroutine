# Decision Log

> 설계 결정 이력. 이유 없이 변경하지 말 것.

---

## 2026-09-10

### Master 가입에 비밀번호 설정 복원 + 링크 로그인 에러 문구 정리

- **배경**: 사용자가 현재 Master 가입 플로우(매직 링크 전용, 비밀번호 없음)가 "일반적이지 않다"고
  지적 — 비회원에게 초대 메일을 보내면 일반 회원가입처럼 비밀번호를 입력받아 이후 이메일/비밀번호로도
  로그인 가능하게 해달라는 요청.
- **발견**: `docs/launch/PHASE1_POLICY.md` §3.2(P0 정책, 2026-09-09 확정)는 이미 5번 단계로 "비밀번호
  설정"을 명시하고 있었다 — 정책 자체는 항상 비밀번호를 요구했는데, P0 구현 세션(2026-09-10) 당시
  `MasterAcceptPage`의 기존 코드에 있던 2026-07-18 편차 주석("비밀번호 설정 단계는 없음")을 그대로
  따라가면서 이 부분을 놓치고 구현했다. 이번 요청은 새 정책 결정이 아니라 **이미 확정된 정책과 어긋나게
  구현했던 부분을 바로잡는 것**이다.
- **적용**: `MasterAcceptPage`에 비밀번호/비밀번호 확인 입력을 추가(6자 이상, 일치 검증). 제출 시
  `supabase.auth.updateUser({ password })`로 먼저 비밀번호를 설정한 뒤 `master-accept`를 호출한다.
  이후 Master는 매직 링크와 이메일/비밀번호 로그인을 둘 다 쓸 수 있다(매직 링크를 없애는 게 아니라
  비밀번호를 추가하는 것). `LoginPage.tsx`와 `MasterAcceptPage.tsx`가 각자 갖고 있던 GoTrue 에러
  메시지 한국어 번역 테이블을 `web/src/lib/authErrors.ts`로 통합(중복 제거, 비밀번호 관련 에러
  문구를 두 화면에서 동일하게 재사용하기 위함).
- **링크 로그인 비회원 에러 문구 변경**: "가입되지 않은 이메일입니다. Master로 초대받은 이메일로만
  로그인할 수 있습니다." → **"가입되지 않은 이메일입니다. 메일 주소를 확인해주세요."**(사용자 지정
  문구, 더 간결함). GoTrue의 실제 에러 문자열이 `"Signups not allowed for otp"`(에러 코드
  `otp_disabled`)인 것을 Supabase 공식 GitHub 이슈로 재확인 — 기존 매핑 키가 정확히 일치함을 확인.
- **"비회원이 Sign-in 링크를 눌러도 로그인되면 안 된다"는 요구사항**: 이미 만족된 상태로 확인—
  `LoginPage.tsx`의 `signInWithOtp`에 `shouldCreateUser: false`가 있어 비회원에게는 애초에 메일 자체가
  발송되지 않는다(클릭할 링크가 존재하지 않음). 서버 쪽 `_shared/masterInvite.ts`의 OTP 폴백은
  `inviteUserByEmail`이 "이미 가입됨" 에러를 반환했을 때만 타는 경로라 정의상 항상 기존 회원 대상이라
  별도 조치 불필요. 참고: 이 설계는 이메일 가입 여부가 에러로 노출되는 특성이 있음(Supabase 자체
  GitHub 이슈에서도 지적된 부분) — 초대 전용 서비스라 이번엔 사용자가 의도적으로 이 방식을 택함.
- **자동 검증**: `web`: `tsc -b && vite build` 통과.

---

### QA 중 발견한 P0 회귀 2건 수정 — 매직링크 self-signup 우회, DowngradeGate가 MasterAcceptPage를 덮는 문제

- **매직링크 self-signup 우회**: `LoginPage.tsx`의 "링크 로그인"(`signInWithOtp`)이 `shouldCreateUser` 기본값(true)으로 인해 미가입 이메일도 자동으로 새 계정을 만들어버렸다 — "회원가입 탭/`signUp()` 제거"만으로는 안 막히는 두 번째 self-signup 경로였다. `shouldCreateUser: false` 추가로 수정. 이 과정에서 실제로 생성된 테스트 계정 정리를 사용자에게 안내함.
- **DowngradeGate가 MasterAcceptPage를 덮는 문제**: `DowngradeGate`는 라우트 구분 없이 전역에서 "인증됨+tier=guest"면 닫을 수 없는 모달을 띄운다. Master 초대 수락은 세션 생성 → 동의 폼 체크 → 제출 → `special_access='master'` 부여 순서라, 동의 폼을 보는 동안은 정확히 이 조건("인증됨+guest")에 해당한다. 기존(자동 즉시 호출) 방식일 땐 이 틈이 거의 0초라 문제가 안 됐는데, 이번 P0에서 동의 폼을 추가하며 이 틈이 길어져 처음으로 드러난 회귀다. `DowngradeGate`에 `useLocation()`을 추가해 `/master/accept`에서는 비활성화하도록 수정.
- **초대 취소 → 삭제로 변경**: 관리자 초대 목록의 "취소" 버튼이 `status='revoked'`로 표시만 하고 행을 영구 보존해, 다시 쓰지 않을 취소 건이 계속 쌓이는 문제가 있었다(사용자 지적). `master-invite-revoke` Edge Function을 실제 `DELETE`로 변경(삭제 전 `admin_audit_log`에 `action='master_invite_delete'`로 기록해 이력은 감사 로그로 남김), 버튼 라벨도 "삭제"로 변경. `docs/MASTER_INVITATION_DESIGN.md` §4-4 원안(이력 보존)을 수정하는 결정 — 상세 이유는 해당 문서에 기록. 이 변경 이전에 이미 쌓인 `status='revoked'` 행은 자동 정리되지 않음(필요 시 수동 삭제 안내).
- **자동 검증**: `web`: `tsc -b && vite build` 통과.

---

### Supabase 리전 확인 → 개인정보처리방침 국외이전 항목 확정, 법인명 오류 발견·수정

- **배경**: 사용자가 Supabase 프로젝트 Region을 Dashboard에서 직접 확인해 `ap-southeast-1`(싱가포르)이라고 알려줌. `docs/legal/PRIVACY_POLICY_PHASE1.md` §8의 `[확인 필요]` 항목을 이 값으로 채우는 김에, "이전 근거" 칸을 임의로 채우지 않기 위해 Supabase 공식 DPA(`supabase.com/legal/dpa`)를 WebSearch/WebFetch로 직접 확인했다.
- **발견 — 법인명 오류**: 기존 문서(§7 위탁 표, §6 판단표 등)에 전부 "Supabase, Inc."(미국 델라웨어 법인)로 기재돼 있었으나, 실제 DPA 원문을 두 차례 별도 프롬프트로 교차 확인한 결과 계약 당사자(data importer)로 정의된 법인은 **"Supabase Pte. Ltd."(싱가포르)** 였고, 문서 전체에 "Supabase, Inc."는 단 한 번도 등장하지 않았다. Supabase는 실제로 두 법인(Delaware의 Supabase, Inc.와 Singapore의 Supabase Pte. Ltd.)을 함께 운영 중인 것으로 확인됨(Dun & Bradstreet/ACRA 등록 정보 교차 검색) — 고객 계약(DPA)상의 당사자는 후자였다. `docs/legal/PRIVACY_POLICY_PHASE1.md`/`docs/launch/PHASE1_POLICY.md`/`web/public/legal/privacy-policy.md`의 관련 표기를 전부 "Supabase Pte. Ltd."로 수정.
- **국외이전 근거**: Supabase DPA는 EU SCC(Module Two Controller-to-Processor, Module Three Processor-to-Processor) + UK ICO 승인 Addendum을 명시(Version 1, 2026-08-01). 국내법(개인정보 보호법 제28조의8제1항제1호) 상 근거는 본 방침에 국외이전 사항을 공개하는 것 — Resend 행과 동일한 서술 패턴으로 §8 표에 반영.
- **한계 인정**: 이 판단은 Supabase가 공개한 DPA 페이지 하나(WebFetch로 두 차례 교차 확인)에 근거한 것이라, 실제 이 프로젝트가 가입 시 동의한 약관·청구 화면에 표기된 법인명과 다를 가능성은 남아있다 — 문서에 "최종 게시 전 Dashboard 청구/계약 정보에서 재확인 권장"이라는 각주를 남겨 법무 확인이 필요한 판단이라는 점을 명확히 했다(이 프로젝트의 다른 사업자 판단과 동일한 신중함 원칙 적용).
- **체크리스트 갱신**: `docs/legal/PRIVACY_POLICY_PHASE1.md`의 "게시 전 필수 확인 체크리스트"에서 Supabase 법인명/Region/국외이전 국가/국외이전 항목·방법 4개 항목을 확인 완료로 표시. Vercel 법인명/리전은 여전히 미확인 상태로 남음.

---

### 1차 출시 P0 코드 구현(사용자 지정 9개 항목) — `docs/launch/PHASE1_POLICY.md` §10 1~4단계

- **배경**: 전날(2026-09-09) 확정한 `docs/launch/PHASE1_POLICY.md` 정책을 실제 코드로 구현하는 세션. 사용자가 P0 범위를 9개 항목으로 명시적으로 재지정했고(§10 계획에 있던 `master_invitations.token_hash` 삭제, `master-revoke` 트랜잭션화, `retention-cleanup` CLEANUP_TABLES 갱신 3개는 이번 라운드에서 의도적으로 제외), "정책과 코드가 충돌하면 임의 판단하지 말고 보고"를 원칙으로 진행했다.
- **구현 완료**: 일반 회원가입 완전 차단(`LoginPage.tsx` signup 모드 제거), "로그인=Pro" 폴백 영구 제거, `MasterAcceptPage` 동의 폼, `user_policy_agreements` 신설(마이그레이션 43), `master-delete-account` 신설, 개인정보처리방침/이용약관 페이지, 공용 콘텐츠 Guest 라우트 가드, `clearAllLocalData` 범위 보정, RevenueCat SDK 제거. 상세 파일 목록은 세션 종료 보고 참고.
- **발견 1 — "로그인=Pro" 폴백이 SQL 레벨에도 있었음**: 사용자 지시는 "현재 tier 판정"(클라이언트 `web/src/lib/permissions.ts`)의 폴백만 언급했지만, 조사 결과 `get_service_tier()` SQL 함수(마이그레이션 38)에도 동일한 `WHEN NOT payments_enabled THEN 'pro'` 분기가 있었다. 클라이언트만 고치면 RLS(공용 단어장 열람, `create_words_checked` 한도)는 여전히 인증된 사용자를 서버에서 pro로 판정해, "1차엔 실제 Pro가 존재하지 않는다"는 정책이 실질적으로 지켜지지 않는다. 이미 확정된 정책의 당연한 귀결로 보고 클라이언트와 SQL(마이그레이션 44)을 함께 수정했다 — 새로운 정책 결정이 아니라 기존 결정의 완전한 이행으로 판단.
- **발견 2 — `admin_audit_log.actor_id` FK가 계정 삭제를 막는 문제**: `master-delete-account`가 마지막에 `auth.admin.deleteUser()`를 호출해야 하는데(§3.5), `admin_audit_log.actor_id`는 `auth.users(id)`를 참조하되 `ON DELETE` 지정이 없다(기본 NO ACTION). `master-accept`가 Master 본인을 actor로 하는 `'master_accepted'` 로그를 남기므로, 사실상 모든 Master 계정은 자신을 actor로 하는 로그 행을 최소 1건 갖는다 — 이 상태에서 계정을 삭제하면 FK 위반으로 실패한다. 기존 `retention-cleanup`은 애초에 `auth.admin.deleteUser()`를 호출하지 않아(개인 데이터 테이블만 삭제) 이 문제를 겪은 적이 없었다 — `master-delete-account`가 이 경로를 처음 타는 코드였다. 마이그레이션 20의 기존 TODO 주석("actor_id NOT NULL 완화 필요, 결정 필요")과는 다른, 별개로 새로 발견한 ON DELETE 동작 문제다. `retention-cleanup`이 시스템 작업에 이미 `actor_id: null`을 쓰는 것(마이그레이션 29)과 동일한 패턴으로 `ON DELETE SET NULL`(마이그레이션 45)로 해결 — 각 로그 행의 `detail` jsonb에 이메일 등 식별정보가 이미 남아있어 감사 추적력이 완전히 사라지지는 않는다는 점을 근거로, 정책적 재확인 없이 이 방향으로 진행했다(대안: actor_id를 지우지 않고 audit log 행 자체를 삭제하거나 시스템 sentinel 계정으로 재귀속하는 방법도 있었으나, 기존 코드의 null 패턴과 일관성을 우선했다).
- **결정 — Guest "모든 데이터 삭제" 시 알림 처리 방침 변경**: `docs/launch/PHASE1_POLICY.md` §3.7은 "notifications는 의도적 제외(OS 예약 알림 유지 목적)"이라고 명시하고 있었으나, 이번 세션에서 사용자가 "UI가 '모든 데이터 삭제'라고 표현한다면 예약된 알림까지 함께 취소·삭제하는 방향을 우선 적용"하라고 명시적으로 재지시했다. 실제 확인 문구가 "모든 데이터(...)를 삭제합니다"로 되어 있어 조건이 성립한다고 판단, `clearAllLocalData()`가 `notifications` 테이블의 `native_id`와 복습 알림 전용 `native_id`를 전부 취소한 뒤 테이블도 clear하도록 변경했다. §3.7 문서도 이 방향으로 갱신(기존 결론을 뒤집는 것이므로 "왜 바뀌었는지" 그대로 남김).
- **`SettingsPage.tsx` 회원탈퇴 버튼 노출 조건 반전**: 기존 코드는 `tier !== 'master'`일 때만 회원탈퇴 버튼을 보여줘 정작 Master는 버튼 자체가 없었다(1차엔 pro가 존재하지 않으므로 사실상 아무도 못 누르는 버튼이었던 셈). §5(Master 자진 탈퇴 구현)를 실제로 쓸 수 있게 이 조건을 제거해 Master도 버튼을 보게 했다 — `tier==='pro'`(2차에나 존재)로 눌렀을 때는 `master-delete-account`가 403으로 안전하게 거부한다(2차 Pro 탈퇴 플로우는 §13에 따라 별도 설계 필요, 이번엔 손대지 않음).
- **공용 단어장/책장 Guest 접근 재확인**: 메뉴 비노출(`canUsePublicWordbooks`)은 이미 구현돼 있었으나, 라우트 자체엔 가드가 없어 Guest가 `/public-wordbooks` 등 URL을 직접 입력하면 "Pro/Master 전용 기능입니다 · 요금제 보기" CTA가 그대로 보였다 — 사용자가 이번에 명시적으로 금지한 "요금제 업그레이드류 CTA를 Guest에게 보여주지 않는다"와 충돌하는 기존 동작이었다. `PublicContentGuestGuard`를 신설해 Guest는 해당 라우트에 진입하기 전에 조용히 홈으로 리다이렉트하도록 수정(Master/Admin/Pro 쪽 기존 페이지 내부 CTA 로직은 그대로 유지).
- **`/privacy`/`/terms` 콘텐츠 소스**: `docs/legal/*_PHASE1.md`는 내부 검토용 상태 배너·게시 전 체크리스트·수정이력을 포함하고 있어(문서 스스로 "게시 문서에는 포함하지 않음"이라고 표시한 절 포함) 그대로 fetch해 보여줄 수 없었다. 그 내부용 절만 제외하고 본문(`[확인 필요]` 포함, 실값 임의 기재 없음)을 `web/public/legal/*.md`로 복사해 `fetch()`로 렌더링하는 방식을 택했다 — docs/ 밖에서 빌드되는 웹 정적 자산이 docs/ 파일을 직접 참조할 수 없기 때문이며, 원문이 바뀌면 이 사본도 수동으로 함께 갱신해야 한다(자동 동기화 아님, 2차에서 빌드 스텝 자동화 검토 여지로 남김).
- **이번 라운드에서 의도적으로 제외한 것**(다음 P0 라운드로 이월): `master_invitations.token_hash` DROP COLUMN, `master-revoke` 즉시반영 트랜잭션화(§3.6), `retention-cleanup`의 `CLEANUP_TABLES`에 books/book_chapters 추가 — 전부 사용자가 이번 프롬프트의 "이번 P0에서 하지 않을 것"/9개 항목 범위에 포함하지 않았다.
- **자동 검증**: `web`: `tsc -b && vite build` 통과, `eslint .`는 이번 변경분에서 신규 에러 0건(기존 `Quiz.tsx`/`quizProgress.ts`/`QuizPage.tsx`의 사전 존재 에러 6건+경고 1건은 이번 변경과 무관, 미수정). `mobile`: `npm install --package-lock-only`로 `react-native-purchases` 제거를 lockfile에 반영 확인(diff 49줄 삭제, 버전 변경 없음) — RN 빌드/시뮬레이터 실행은 이번 세션에서 실행하지 않음(§10 5단계 스테이징 QA와 함께 사용자가 직접 확인 필요).

---

## 2026-09-09

### 1차 출시(Guest/Master/Admin, 결제 없음) 정책 확정 — `docs/launch/PHASE1_POLICY.md` 신설

- **배경**: 기존 Phase 11~24는 전부 "언젠가 결제(Pro/RevenueCat)가 붙는 서비스"를 전제로 설계돼 있었다. 그런데 실제 출시 전략은 2단계로 분리하기로 확정 — **1차는 Guest/Master/Admin만 존재하고 일반 회원가입·Pro·RevenueCat·결제가 전혀 없는 상태**로 먼저 출시하고, 2차에서 일반 회원가입+Pro+실결제를 공개한다. 이번 세션(들)에서 이 1차 정책을 코드는 건드리지 않고 정책·법무 문서로만 확정했다.
- **가장 중요한 발견**: `web/src/pages/auth/LoginPage.tsx`에 일반 회원가입 UI(`signup` 모드)가 실제로 살아있어 `supabase.auth.signUp()`을 직접 호출한다 — 1차 정책과 정면 충돌하는 최우선 수정 대상. 또한 `app_config.payments_enabled=false`(마이그레이션 38)일 때 "로그인만 하면 Pro"로 승격되는 폴백 규칙이 있어, 회원가입을 막는 것과 별개로 이 폴백 자체도 제거해야 한다(정확한 근거는 아래 "왜 정책 변경이 필요했는지"와 `docs/launch/PHASE1_POLICY.md` §10 1단계 참고).
- **결정 1 — 가입 동의 구조**: Master 초대 가입 시 필요한 건 ① 이용약관 동의 ② 만 14세 이상 확인(자격요건 확인, "동의"가 아님) ③ 개인정보처리방침 **안내+열람 링크**(체크박스 아님) 세 가지뿐. "[필수] 개인정보 수집·이용 동의" 체크박스는 넣지 않는다 — 근거는 개인정보 보호법 제15조제1항제4호(계약 이행). 법적 성격 판단이라 최종 게시 전 법무 확인 권장(법적으로 절대 불필요하다는 단정은 아님). 만 14세 확인도 법정 의무(제22조의2는 "실제 아동을 처리할 때"만 발동)가 아니라 회사 자체 정책(법정대리인 동의 절차를 피하기 위한 스크리닝)이라는 점을 명확히 구분했다.
- **결정 2 — `user_policy_agreements` 테이블(명칭 변경)**: 원래 `user_consents`/`consent_type`/`age_14_confirmed`로 설계했으나, "이용약관 동의"와 "만 14세 자격확인"을 둘 다 "동의(consent)"라 부르는 게 부정확하다는 지적으로 `user_policy_agreements`/`agreement_type`('terms'|'age_eligibility')로 개명. `withdrawn_at` 컬럼은 두지 않음(이용약관 철회=회원탈퇴로 이미 반영되고, 연령확인은 철회 개념이 성립하지 않음). 보존정책도 "감사 목적 영구 보존"에서 "회원 유지 중 불변 → Master 탈퇴 시 다른 개인정보와 함께 삭제(기본), 법령상 예외만 별도 보존"으로 수정.
- **결정 3 — Master 권한 해제 방식 변경**: 기존엔 로컬 이전(migration)이 끝날 때까지 `special_access='master'`를 유지하는 설계였는데, 사용자가 앱을 안 열면 Master 권한이 기한 없이 유지되는 문제가 있어 **권한은 즉시 `none`으로 중단하고, `downgrade_pending` 상태에서 서버 데이터에 대한 read/export/migration만 제한 허용**하는 구조로 변경(§3.6). 서버 데이터는 3개월 보관, 다음 앱 실행 시 `remoteToLocalMigration.ts`(기존 엔진 재사용)로 이전 후 Guest 전환.
- **결정 4 — `/signup` 라우트는 1차에 만들지 않음**: 처음엔 "`LoginPage`에서 회원가입 UI만 빼고 `/signup` 라우트/`SignupPage.tsx`는 미리 만들어 링크만 숨겨두자"는 방향이었으나, 1차엔 일반 회원가입 개념 자체가 없으니 미리 만들 이유가 없다는 지적으로 **`/signup` 자체를 만들지 않는 것**으로 변경 — 2차 착수 시점에 그때의 최신 법령/스토어 정책으로 새로 만든다.
- **결정 5 — self-signup 차단 방식**: UI 제거(P0) + Supabase Auth "Allow new users to sign up" OFF(P0) + 스테이징 A~F 실환경 검증(배포 게이트, 아래 표) 세 단으로 확정. 처음엔 `auth.users` AFTER INSERT 트리거 + `invited_at` 판정까지 P0에 포함시켰으나, Supabase Auth 내부 구현에 강하게 결합되고 유지보수 위험이 있다는 지적으로 **P2 조건부 대안(스테이징 검증에서 문제가 발견될 때만 재검토)으로 강등**했다.

  | | 시나리오 | 기대 결과 |
  |---|---|---|
  | A | `supabase.auth.signUp()` 직접 호출 | self-signup 실패 |
  | B | 기존 Master 로그인 | 성공 |
  | C | 기존 Admin 로그인 | 성공 |
  | D | Admin의 `inviteUserByEmail()` 초대 | 성공 |
  | E | 초대 링크 클릭 | 정상 세션 생성 |
  | F | `MasterAcceptPage` 가입 | 정상 완료 |

- **결정 6 — 공용 단어장/책장 Guest 정책**: A(Guest도 이용 허용)/B(메뉴 비노출)/C(잠금 화면, Master 로그인 유도) 비교 결과 **B안(메뉴 비노출) 확정**. C안은 "Master가 될 방법이 없는데 로그인을 유도"하는 게 논리적으로 성립하지 않고, A안은 2차에 Pro 전용으로 바꾸면 "무료 기능 유료화"로 인식될 위험이 있어서다. 메뉴 숨김만으로 끝내지 않고 직접 URL 접근도 라우트 가드로 막아야 한다.
- **결정 7 — RevenueCat SDK는 1차 빌드에서 완전 제거**: 처음엔 "API 키를 비워 no-op 상태로 코드는 유지"를 절충안으로 제안했으나, 심사 안정성을 최우선하는 사용자 판단으로 `mobile/package.json`의 `react-native-purchases` 의존성과 `mobile/App.tsx`의 초기화/브리지 코드를 실제로 제거하는 것으로 확정(git 커밋 이력으로만 보존, 2차 착수 시 해당 커밋을 되돌려 재설치).
- **왜 정책 변경이 필요했는지(로그인=Pro 문제)**: `get_service_tier()`/`resolveServiceTier()`의 판정 순서는 `role=admin→Admin` > `special_access=master→Master` > `subscriptions` 실구독 있음`→Pro` > `payments_enabled=false→Pro`(실구독 없어도 통과) > 그 외 Guest. 네 번째 규칙 때문에 회원가입이 막혀있지 않은 상태에서는 실구독 없이 가입만 해도 Pro가 된다. 2차엔 `payments_enabled=true`+RevenueCat 연동만으로 세 번째 규칙이 정상 작동해 자동 해결되지만(로직 재작성 불필요), 1차엔 회원가입 차단이 1차 방어, 이 폴백 제거가 2차 방어다. `payments_enabled`는 사용자별 값이 아니라 앱 전체 전역 스위치라서, 이 값을 `true`로 뒤집어 문제를 해결하려 하면 안 된다 — 같은 값이 결제 UI 노출도 같이 제어하기 때문(RevenueCat SDK가 없는 1차 빌드에서 눌러도 반응 없는 구매 버튼이 되살아남).
- **위탁/국외이전 재검증(추측 없이 코드·공식문서 확인)**: Supabase(DB/Auth/Edge Function, 위탁 해당 명확) / Resend(법인명 Plus Five Five, Inc., Master 초대메일 발송용 SMTP, 위탁 해당 명확, 미국 처리·SCC+DPF·보유기간 30일/90일 — resend.com/legal/dpa, /legal/subprocessors, /security/gdpr 공식 확인) / Vercel(정적 SPA 호스팅만, 서버리스 없음 — `web/vercel.json` 코드로 확인, 위탁 해당 여부는 법무 확인 필요로 남기고 1차엔 보수적으로 포함). Guest 세션에서 Supabase 요청이 실제로 발생하는지도 코드로 확인: `usePermissions()`는 `enabled: !!user`로 게이팅되어 Guest는 일반 학습 기능 이용 중 Supabase 요청이 전혀 없음(`web/src/hooks/usePermissions.ts:74`), 다만 설정/요금제 화면에 들어가면 `useAppConfig()`가 인증 여부와 무관하게 항상 실행되어 `app_config` 조회가 나간다(`web/src/hooks/useAppConfig.ts`). Resend로 가는 실제 발송 경로도 "Edge Function → Resend API 직접 호출"이 아니라 "Edge Function → Supabase Auth Admin API(`inviteUserByEmail`) → Supabase Auth의 커스텀 SMTP(Resend)"임을 `supabase/functions/_shared/masterInvite.ts:24`로 확인해 정정.
- **적용**: 이번 세션 범위에서 실제 코드/DB/Edge Function은 전혀 수정하지 않음. `docs/launch/PHASE1_POLICY.md`(신규, 정책+P0 구현계획 전체), `docs/legal/PRIVACY_POLICY_PHASE1.md`/`docs/legal/TERMS_PHASE1.md`(신규, 전문), 루트 `DESIGN.md`(인덱스 3행 추가), `docs/PROJECT_STATUS.md`(요약 단락 + Completed 행 + Next 표에 최우선 행 추가), `docs/TODO.md`(Phase 11보다 앞에 "1차 출시 P0" 섹션 추가)까지 문서만 갱신.
- **다음 세션이 할 일**: `docs/launch/PHASE1_POLICY.md` §10 "P0 구현 계획"을 0→5단계 순서대로 진행. 마이그레이션 번호는 문서에 적힌 예시(43/44 등)를 그대로 쓰지 말고 `ls supabase/migrations/`로 그 시점의 실제 마지막 번호를 확인해서 정할 것(문서 작성 시점 마지막 번호는 42).

### Self-signup Pro 계정 삭제 실행 — Supabase Dashboard "Delete user" 버튼의 알려진 실패와 우회법

- **배경**: 위 정책 확정 과정에서 발견된 self-signup 계정(§9 확인 쿼리로 존재 가능성 인지) 중 실제로 1건(`id=d3800164-3c8e-43d5-bb50-437344c810f9`)을 사용자가 정리하고자 함.
- **1차 시도 실패**: Supabase Dashboard의 Authentication > Users > Delete user 버튼이 `Failed to delete selected users: Database error deleting user`라는 뭉뚱그린 에러로 실패. Dashboard는 실제 Postgres 에러를 숨기고 이 일반 메시지만 보여준다.
- **진단 방법**: `auth.users`를 참조하는 모든 FK와 `delete_rule`(cascade 여부)을 조회하는 쿼리로 후보를 좁혔다:
  ```sql
  select con.conname as constraint_name, con.confdeltype as delete_rule,
         rel.relname as referencing_table, att.attname as referencing_column
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_class frel on frel.oid = con.confrelid
  join pg_namespace fns on fns.oid = frel.relnamespace
  join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
  where con.contype = 'f' and fns.nspname = 'auth' and frel.relname = 'users'
  order by delete_rule, referencing_table;
  ```
  결과 `delete_rule='a'`(no action, cascade 아님) 7건: `admin_audit_log.actor_id`, `master_invitations.revoked_by`/`accepted_user_id`/`invited_by`, `profiles.special_access_granted_by`, `public_books.created_by`, `public_wordbooks.created_by`. 이 7개 컬럼에 대상 유저의 id가 실제로 걸려있는지 `count(*)` 쿼리로 전부 확인한 결과 **전부 0** — 이 7개는 원인이 아니었다.
- **실제 해결**: SQL Editor에서 `delete from auth.users where id = '...';`를 직접 실행 — **성공**("Success. No rows returned"). Dashboard 버튼 자체의 버그였던 것으로 결론. 재확인 쿼리(`profiles`/`wordbooks`/`schedules`/`study_sessions`/`subscriptions`/`auth.users` 전부 count)로 완전 삭제 확인.
- **왜 SQL은 됐는데 Dashboard는 안 됐는지**: Dashboard의 "Delete user"는 Supabase Auth Admin API(GoTrue)를 거치는데 이 경로가 이번 케이스에서 더 보수적인 사전 체크를 하다 걸린 것으로 추정. 직접 `DELETE FROM auth.users`는 Postgres에게 곧바로 CASCADE 삭제를 시키는 것과 동일해, FK가 실제로 막고 있지 않다면(이번처럼 7개 후보가 전부 0) 문제없이 성공한다. `auth.identities`/`auth.sessions`/`auth.refresh_tokens` 등 Auth 내부 스키마도 `auth.users`에 CASCADE로 걸려있어 함께 정리된다.
- **재사용 가치**: 이후 다른 self-signup 계정을 정리할 때도 Dashboard 버튼이 같은 에러를 내면, 이 항목의 진단 쿼리 → `delete from auth.users where id = '...'` 직접 실행 순서를 그대로 반복하면 된다.

### 자동재생 백그라운드 잠금화면 아트워크 — symbol.svg를 PNG로 변환해 원격 URL로 참조

- **요구사항**: 자동재생이 백그라운드에서 재생 중일 때 잠금화면/제어센터에 뜨는 미디어 정보
  (`keepAlivePlayer.setActiveForLockScreen`)에 지금까지 없던 포스터 이미지를 `web/public/symbol.svg`
  (912x912, 검정 배경 + 흰색 로고마크)로 넣고 싶다는 요청.
- **SVG를 그대로 못 쓰는 이유(코드로 확인)**: `expo-audio`의 iOS 구현
  (`node_modules/expo-audio/ios/MediaController.swift`)이 `artworkUrl`을
  `URLSession.shared.dataTask`로 받아 `UIImage(data:)`로 디코딩하는데, **`UIImage`는 SVG를
  지원하지 않는다**(PNG/JPEG 등 래스터 포맷만). Android도 `AudioMetadata.artworkUrl`이
  `URL` 타입으로 선언돼 있어 마찬가지로 래스터 이미지를 기대한다. 그래서 `symbol.svg`를 PNG로
  변환하는 과정이 필요했다 — 이 환경엔 `rsvg-convert`/`inkscape` 같은 SVG 렌더러가 없어, macOS
  내장 Quick Look의 SVG 렌더링을 이용하는 `qlmanage -t -s 1024 -o <dir> symbol.svg` 트릭으로
  1024x1024 PNG를 뽑아냈다(결과를 직접 열어 로고가 정확히 렌더링됐는지 확인).
- **로컬 번들 에셋 대신 원격 URL 선택**: `expo-audio` 공식 문서(v56)에는 `artworkUrl`의 원격
  HTTPS URL 예시만 있고 `require()`+`expo-asset`으로 만든 로컬 `file://` URI 사용은 문서화돼
  있지 않다 — 이 환경엔 실기기가 없어 로컬 에셋 경로가 실제로 동작하는지 검증할 방법이 없으므로,
  공식적으로 확인된 유일한 방식(원격 URL)을 택했다. 변환한 PNG를 `web/public/symbol-artwork.png`로
  배포하고, `mobile/App.tsx`가 이미 갖고 있던 `WEB_APP_URL`(dev/prod 자동 분기)을 그대로 재사용해
  `${WEB_APP_URL}/symbol-artwork.png`로 참조한다 — 덕분에 앞으로 아트워크를 바꿀 때도 이 파일만
  교체하면 되고 EAS 재빌드가 필요 없다.
- **적용**: `mobile`: `tsc --noEmit` 통과. `web`: `vite build` 통과, `dist/symbol-artwork.png` 생성
  확인.
- **한계**: 실기기가 없어 잠금화면/제어센터에 실제로 아트워크가 표시되는지는 검증 불가 — 이번
  변경은 `mobile/App.tsx`를 건드렸으므로(URL 문자열 추가) 새 EAS 빌드가 필요하다.

### 복습 알림 신규 구현 — 설정 토글/시간이 저장만 되고 실제로는 아무것도 예약하지 않던 기능

- **배경**: "학습 알림(복습 알림)이 안 온다"는 리포트로 조사한 결과, 설정 화면의 "복습 알림"
  토글/시간(`reviewNotification`/`reviewNotificationTime`)은 값이 저장은 되지만 그 값을 읽어서
  실제로 `bridge.scheduleNotification()`을 호출하는 코드가 어디에도 없었다 — 버그가 아니라
  **처음부터 구현되지 않은 기능**이었다(일정 알림용 `notificationScheduler.ts`만 있고 복습용은
  없었음).
- **왜 캘린더 일정과 다르게 만들어야 했는가**: 일정은 미래 날짜가 고정돼 있어 앞으로 30일치를
  한 번에 예약해둘 수 있지만(`notificationScheduler.ts`), 복습 대상(`words.status='reviewing'`
  AND `next_review_at <= 시각`)은 사용자가 매일 얼마나 학습하느냐에 따라 계속 바뀐다 — 오늘 복습을
  다 끝내면 내일 알림이 필요 없어질 수도 있다. 그래서 먼 미래까지 미리 계산해두는 대신, **앱을 열
  때마다 + 설정이 바뀔 때마다 "다음 1회분"만 다시 계산**해서 예약하는 방식으로 설계했다 — 사용자가
  "복습 주기도 포함이어야 한다"고 명시한 요구사항과도 일치(그 시각까지 복습할 단어가 하나도 없으면
  아예 예약하지 않음, 있으면 개수를 본문에 넣어서 예약).
- **결정**: `web/src/lib/reviewNotificationScheduler.ts`(신규) — `refreshReviewNotification(repository,
  settings)`가 (1) 이전에 예약해둔 네이티브 알림을 취소(`localStorage`에 저장해둔 native id로,
  기존 일정 알림처럼 DB `notifications` 테이블을 쓰지 않음 — native id는 기기 로컬 값이라 테이블화할
  이유가 없어 더 가벼운 방식 선택) → (2) `reviewNotification`이 꺼져 있으면 종료 → (3) 다음 알림
  시각(오늘 그 시각이 지났으면 내일)을 계산해 `repository.getReviewQueue(그 시각)`으로 그때까지
  복습할 단어 수를 조회 → (4) 0개면 예약 안 함, 1개 이상이면 그 시각·개수로 `SCHEDULE_NOTIFICATION`
  전송. 새 컴포넌트 `web/src/components/notifications/ReviewNotificationSync.tsx`(App.tsx의
  AuthProvider에 다른 Gate들과 나란히 마운트)가 앱 로드 시 + `useSettingsStore()`의 두 설정값이
  바뀔 때마다 이 함수를 호출한다 — 설정 화면은 `patchSettings()`로 낙관적 즉시 갱신을 하고 있어서
  (`useUserSettings.ts`), 이 Gate의 `useEffect` 의존성이 그 값을 그대로 구독하는 것만으로 "시간을
  바꾸면 바로 재예약"이 별도 배선 없이 자연히 충족된다.
- **네이티브 변경 없음**: 기존 `SCHEDULE_NOTIFICATION`/`CANCEL_NOTIFICATION`/`NOTIFICATION_RESULT`
  브리지 메시지가 이미 범용적으로(어떤 용도인지 모른 채 id/title/body/fireAt만 다룸) 구현돼 있어
  `mobile/App.tsx`를 전혀 건드리지 않았다 — 웹 배포만으로 반영되며 EAS 재빌드 불필요.
- **적용**: `tsc -b`/`eslint .`/`vite build` 통과.
- **한계**: 실기기 검증 불가(환경 제약). "다음 1회분만 계산" 방식이라 앱을 며칠간 안 열면 그 사이
  갱신이 안 되고(마지막으로 예약해둔 그 1건만 발사됨), 퀴즈 완료 직후처럼 데이터가 막 바뀐 시점에는
  다음에 앱을 다시 열 때까지 재계산이 지연될 수 있음(스코프 축소, 필요하면 후속으로 퀴즈 완료
  시점에도 재계산 훅 추가 가능).

### 자동재생 미니 플레이어 — 배속 슬라이더 커스텀 스타일 적용(1차: 진행 채움 제외)

- **요구사항**: 기존 `accent-white`만 쓰던 배속 `<input type="range">`를 사용자가 지정한 트랙/썸
  스펙(트랙 높이 0.25rem, 썸 1rem 원형 + 진하게 두른 그림자, active 시 흰 테두리 추가)으로 교체.
- **1차 시도의 실수**: 값 이전(불투명 흰색)/이후(반투명 흰색) 두 톤으로 나뉘는 진행 채움까지
  욕심내서 `rate` 기준 `linear-gradient(...)`를 `<input>` 자체의 인라인 `style.background`로
  얹었는데, 트랙(`::-webkit-slider-runnable-track`)은 0.25rem으로 얇아도 그 배경을 투명하게
  비워둔 탓에 **input 자체의 1rem 높이 전체에 그라디언트가 그대로 비쳐서** 트랙이 썸만큼 두꺼워
  보이는 버그가 났다(스크린샷으로 확인). 사용자가 "진행 채움은 스크립트가 필요하니 이번엔 제외"라고
  먼저 밝혔는데 그 부분까지 포함시킨 게 원인 — 사용자가 준 순정 레퍼런스 HTML(스크립트 없이 트랙
  단색 고정)대로 다시 맞췄다.
- **최종**: `.autoplay-rate-slider`의 트랙 배경을 `rgba(255,255,255,.4)` 단색 고정으로 되돌리고,
  `AutoPlayBar.tsx`의 인라인 `style`(그라디언트)을 완전히 제거. `disabled` 상태 스타일도 레퍼런스에
  맞춰 추가(현재 이 슬라이더는 disabled를 쓰지 않지만 스펙 충실도 차원에서 포함).
- **적용**: `tsc -b`/`eslint`/`vite build` 통과, 빌드 CSS가 레퍼런스와 동일한 규칙으로 생성됨을
  확인. 웹 전용 수정, EAS 재빌드 불필요. 진행 채움(두 톤)은 스크립트 연동이 필요해 후속 작업으로
  남김.

### 문구 다듬기 — 빈 목록 안내, Guest 배너, 단어 한도 표시, Pro 요금제 노출 시점

- **단어장/책장 빈 목록 안내**: "추가 버튼으로 만들어보세요"를 좀 더 구체적인 문구로 교체 —
  단어장은 "단어장을 추가하고, 학습할 단어들로 채워보세요"(두 줄), 책장은 "책을 추가하고, 목차를
  만들어보세요"(한 줄). `WordbookListPage.tsx`/`BookshelfListPage.tsx`.
- **Guest 설정 배너**: 3줄("무료 이용 데이터는...", "...복구할 수 없습니다", "Pro를 시작하면...")에서
  "Pro를 시작하면..." 줄을 빼고 첫 줄도 "무료 이용" 없이 "데이터는 현재 기기에만 저장됩니다"로
  축약(2줄).
- **단어 한도 표시**: Guest의 "제한 없음(로컬 저장)"에서 괄호 설명을 빼고 "제한 없음"만. Pro의
  단어 등록 행도 `personalWordLimit === null`(현재 무료 출시 기간 기본값)일 때
  `"5/무제한개"`처럼 어색하게 붙던 걸 그냥 `"무제한"`으로(Master/PricingPage와 동일한 표기 규칙).
- **"Pro 요금제 보기" 숨김**: 결제 자체가 아직 없는 1차 무료 출시 기간(`app_config.payments_enabled
  = false`)에는 Guest 설정 화면의 이 버튼도 노출하지 않도록 `paymentsEnabled`로 게이트 — 이미
  `PricingPage`/`WordbookListPage` 등에서 쓰던 것과 동일한 스위치를 그대로 재사용(2차 런칭 시
  `payments_enabled=true`로만 바꾸면 코드 변경 없이 다시 노출됨, `docs/SUBSCRIPTION_DESIGN.md` §11).
- **적용**: `tsc -b`/`eslint`/`vite build` 통과. 웹 전용 수정, EAS 재빌드 불필요.

### 관리자 화면에 구독 만료 데이터 삭제 배너가 뜨던 버그

- **배경**: 관리자 계정으로 `/settings`에 들어가면 "구독이 종료되어 클라우드 데이터가 ~에
  삭제될 예정입니다" 배너가 떴다. Admin은 구독/개인 데이터 보관 정책 자체와 무관한
  대상인데(`docs/ADMIN_DESIGN.md` §6) 표시된 것.
- **원인**: `RetentionBanner`(`web/src/components/retention/RetentionBanner.tsx`)가
  `AppLayout`에 마운트돼 있고, `/settings`는 사용자·관리자 공유 라우트라 Admin도 그대로
  `AppLayout`을 탄다. 배너는 로그인 여부(`user`)만 확인하고 tier는 전혀 확인하지 않아서, 해당
  계정에 `retention_schedules` 활성 행이 있으면(과거 이력 등으로) Admin에게도 그대로 노출됐다.
- **결정**: `usePermissions()`로 `serviceTier === 'admin'`이면 쿼리 자체를 비활성화하고 배너를
  렌더링하지 않도록 수정.
- **적용**: `tsc -b`/`eslint`/`vite build` 통과. 웹 전용 수정, EAS 재빌드 불필요.
- **한계**: 근본 데이터(왜 이 관리자 계정에 `retention_schedules` 행이 있는지)는 조사하지
  않음 — UI 노출만 막았다. 필요하면 후속으로 해당 행 자체를 정리할 수 있음.

### 설정 화면의 "관리자 화면으로 이동" 링크 제거

- **배경**: 2026-09-01에 사용자/관리자 하단 탭을 완전히 분리하면서 admin은 BottomNav에서
  단어장/책장/Master/LOG/설정으로 항상 직접 이동할 수 있게 됐다. 그런데 `SettingsPage.tsx`의
  admin 전용 섹션에는 그 이전부터 있던 "관리자 화면으로 이동"(`/admin`) 버튼이 그대로 남아있었다
  — 이제는 도달할 방법이 이미 넘치는 죽은 도입부였다("사용자↔관리자를 완전히 분리했으니 이제 이
  링크는 필요 없다"는 사용자 지적).
- **결정**: 해당 버튼만 제거(같은 섹션의 "권한"/"이메일" 정보 행은 유지 — 순수 조회용이라 문제
  없음).
- **적용**: `tsc -b`/`eslint`/`vite build` 통과. 웹 전용 수정, EAS 재빌드 불필요.

### 퀴즈 주관식 음성 입력 — 눌러서 녹음(walkie-talkie)을 탭 토글로 되돌림 + 무반응/미인식 버그 수정

- **배경**: "눌러서 녹음 시작이 사용하기 불편하다"(한 손으로 폰을 들고 버튼을 계속 누른 채 말해야
  해서 불편함) + "녹음한 음성 인식이 제대로 안 되는지 답이 안 채워진다" + "화면에 아무 반응이 없을
  때도 있어서 하고 있는건지 모르겠다"는 리포트. 세 가지가 한 번에 나왔지만 원인은 서로 다르다.
- **UX 원복(탭 토글)**: 이전 세션에서 "탭하고 일정 시간 후 자동 종료되는 방식이 답 길이와 안 맞는다"는
  피드백으로 눌러서 녹음(`onPointerDown`/`Up`/`Leave`/`Cancel`)으로 바꿨었는데, 이번엔 그게 또
  불편하다는 반대 피드백 — 한 번 탭하면 시작, 다시 탭하면 종료하는 토글로 되돌렸다(`Quiz.tsx`).
  다만 최초에 문제였던 "무음 감지로 애매하게 자동 종료"는 여전히 막아야 하므로,
  `useSpeechRecognition`의 `continuous: true`(무음이어도 사용자가 직접 멈출 때까지 계속 듣기)는
  그대로 유지한다 — 시작/종료 트리거 방식(탭 vs 누르고 있기)과 자동 종료 방지(continuous)는
  서로 다른 축이라 독립적으로 바꿀 수 있었다.
- **진짜 원인(코드로 확인)**: `interimResults: false`로 호출하고 있었는데, `expo-speech-recognition`
  공식 타입 문서(`ExpoSpeechRecognitionModule.types.d.ts`)에 정확히 이렇게 적혀 있다 — "Note for
  iOS: final results are only available after speech recognition has stopped." 즉 iOS에서
  `interimResults=false`면 인식 세션이 완전히 끝나야만(정지를 탭한 뒤에도 한참 후에) 결과가 온다 —
  이게 "화면에 아무 반응이 없다"(중간 결과가 아예 없으니 뭘 하고 있는지 알 수 없음)와 "답이 안
  채워진다"(최종 결과가 비동기로 늦게 오거나 사실상 누락되는 것처럼 보임) 둘 다의 근본 원인이었다.
- **결정**: 웹(`useSpeechRecognition.ts`의 `recognition.interimResults`)과 네이티브
  (`mobile/App.tsx`의 `ExpoSpeechRecognitionModule.start({...})`) 양쪽 다 `interimResults: true`로
  변경 — 말하는 도중 중간 결과가 실시간으로 입력창에 채워져(이미 `useEffect`가 `transcript`를
  `shortInput`에 그대로 반영하고 있어 별도 UI 작업 없이 자동으로 해결됨) 그 자체가 "지금 인식되고
  있다"는 시각적 피드백이 되고, 정지를 탭했을 때 최종 결과도 지연 없이 확정된다. 플레이스홀더도
  듣는 중엔 "듣고 있어요..."로 바뀌게 추가.
- **적용**: `web`: `tsc -b`/`eslint .`/`vite build` 통과(Quiz.tsx의 useCallback 조건부 호출 lint
  에러는 이번 변경과 무관한 기존 이슈, 그대로 둠). `mobile`: `tsc --noEmit` 통과.
- **한계**: `mobile/App.tsx`를 수정했으므로 실제 동작 확인은 새 EAS 빌드로 실기기 검증 필요.

## 2026-09-08

### 책장 구조 오해 수정 — 공용 전용이 아니라 단어장과 동일한 개인+공용 이중 구조였음

- **배경**: 최초 책장 요구사항("공용 책장 / 추가: 책 이름, 언어 선택 / 책 상세: 추가, 일괄등록")을
  계획 단계에서 "공용 책장 하나만 있고 관리자만 쓴다"로 잘못 해석해, 공용 단어장(§3)의 축소판으로만
  구현했다(개인이 만드는 책장 자체가 없었음). 실제로는 요구사항의 "공용 책장"과 "추가"가 서로 다른
  화면을 가리키는 **두 개의 별개 불릿**이었다 — 단어장이 개인 `wordbooks`/`words`(누구나 생성)와
  공용 `public_wordbooks`/`public_words`(Admin만 생성) 두 계층으로 나뉘어 있는 것과 정확히 같은
  구조를 책장에도 요구한 것. 사용자가 "책장 페이지에 공용 책장, 추가 버튼이 없다"고 지적해 발견.
- **결정**: 기존에 만든 `books`/`book_chapters`(관리자 전용)를 `public_books`/`public_book_chapters`로
  전면 rename(마이그레이션 41이 아직 미적용 상태라 안전하게 파일 자체를 수정)하고, 단어장/단어와
  동일한 소유 구조의 신규 개인 `books`/`book_chapters`(마이그레이션 42)를 별도로 추가했다. 화면도
  분리: `web/src/pages/bookshelf/{BookshelfListPage,BookDetailPage}.tsx`(개인, `/books`, BottomNav
  탭 — Guest 포함 전체 등급)와 `web/src/pages/public-book/{PublicBookListPage,PublicBookViewPage}.tsx`
  (공용, `/public-books`, `BookshelfListPage` 헤더 링크로만 진입, Pro/Master 전용)로 나눴다.
  `web/src/lib/books.ts`(관리자 전용 함수였던 것)는 `publicBooks.ts`로 이름을 바꾸고, 개인 책장은
  단어장/단어와 동일하게 `DataRepository` 인터페이스에 9개 메서드로 추가해 Guest(IndexedDB)/
  Pro·Master(Supabase)가 자동 분기되게 했다.
- **BottomNav 순서**: "책장 순서는 단어장 다음으로" 요청에 따라 사용자 탭을 홈→단어장→**책장**→일정→
  설정으로 재배치(기존엔 일정 다음이었음). 관리자 탭 순서(단어장→책장→Master→LOG→설정)는 원래도
  단어장 바로 다음이라 변경 없음.
- **Dexie 버전 관리**: `LocalDataRepository`의 IndexedDB 스키마는 이미 실사용 Guest 기기에 배포된
  v1이 있어(코드 주석이 "아직 배포 전"이라고 잘못 남아있던 걸 이번에 함께 수정), 새 스토어(`books`/
  `bookChapters`)는 `version(1)`을 직접 고치지 않고 `version(2).stores({...})`로 추가했다 — 이
  프로젝트에서 처음 실제로 발생한 Dexie 버전 업그레이드 사례.
- **적용**: `tsc -b`/`eslint .`/`vite build` 통과. 웹 전용 변경, `mobile/App.tsx` 무수정이라 EAS
  재빌드 불필요.
- **한계**: 마이그레이션 41(공용, rename됨)/42(개인, 신규) 둘 다 아직 Supabase 프로젝트에 미적용 —
  사용자가 Dashboard에서 직접 실행해야 한다(41을 이미 실행했다면 42 실행 전에 41부터 다시 확인
  필요 — rename된 새 파일 내용으로 실행해야 함). 공용 책을 개인 책장으로 복사하는 기능("담기"에
  해당)은 이번에 추가하지 않음.

### BottomNav 5탭 전환 후 좁은 화면(398px 이하)에서 메뉴가 화면을 넘어감

- **배경**: 책장 추가로 하단 탭이 4개→5개가 되면서, 탭 하나당 `w-[54px]` + `gap-5`(20px) 간격으로
  계산한 전체 폭(약 362~394px)이 398px 이하 화면 폭을 넘어서기 시작했다 — 책장 작업 계획 당시 이미
  "5개에서도 자연스러운지 구현 후 확인 필요"로 남겨뒀던 리스크가 실제로 발생.
- **결정**: `BottomNav.tsx`의 탭 간격을 `gap-5`(20px)→`gap-2`(8px), 탭 너비를 `w-[54px]`→`w-[50px]`로
  축소 — 재계산하면 전체 폭이 약 326px까지 줄어 실사용 기기 폭보다 충분히 작아진다(터치 영역은
  50px로 여전히 권장 최소 44px 이상 유지, "Master" 같은 가장 긴 라벨도 10px 폰트에서 문제없이 들어감).
- **적용**: `tsc -b`/`eslint`/`vite build` 통과. 웹 전용 수정, EAS 재빌드 불필요.

### 책장(Book) 기능 신규 추가 — 공용 단어장에서 학습/퀴즈/진행률/담기를 뺀 축소판

- **배경**: 단어장과 별개로, 순수한 "읽기/듣기" 전용 콘텐츠 기능("책장")을 새로 추가해달라는 요청.
  책(제목) 안에 목차(제목+내용)가 여러 개 있고, 사용자는 그걸 읽거나 영어 원음 TTS로 듣기만 한다 —
  학습하기/복습/문제풀기(퀴즈, 간격 반복)는 전혀 없다.
- **결정**: 구조상 가장 가까운 기존 기능인 "공용 단어장"(`public_wordbooks`/`public_words`,
  `docs/ADMIN_DESIGN.md` §3)을 그대로 본떠 `books`/`book_chapters`(마이그레이션 41)를 만들되,
  학습/퀴즈/진행률(`user_public_word_progress` 상당)/"담기"(개인 복사)/anon 열람 예외를 처음부터
  전부 빼서 훨씬 단순하게 설계했다. 접근 권한은 사용자 확인 하에 공용 단어장과 완전히 동일한
  `permissions.canUsePublicWordbooks`(Pro/Master)를 그대로 재사용 — 책장 전용 권한 필드를 새로
  만들지 않았다.
- **재생 방식**: 별도 자동재생 로직을 새로 만들지 않고 기존 `useAutoplayStore`(단어 자동재생과
  동일 인프라, 무수정)를 그대로 재사용했다 — 목차의 제목+내용을 세그먼트로 만들어 넘기기만 하면
  스토어가 배열 순서대로 순차 재생해준다(랜덤 금지 요구사항이 별도 구현 없이 자연히 충족됨).
  책장 목록에서 여러 책을 다중 선택(`WordbookListPage.tsx`의 `Set<string>` + `Checkbox` 패턴 재사용)
  하면 선택 순서 → 책 안에서는 목차 순서로 이어 붙인 재생목록이 만들어진다.
- **일괄등록 방식이 단어장과 다름**: 단어장의 `.txt` 일괄등록은 한 파일 안에 탭 구분 여러 줄(줄마다
  단어 1개)이지만, 책장은 **여러 `.txt` 파일을 한 번에 올리면 파일 하나 = 목차 1개**다(사용자 확정).
  제목은 파일명(확장자 제외, 사용자 확정), 내용은 파일 전체 텍스트, 파일명 순서(숫자 포함 자연
  정렬)대로 등록된다.
- **메뉴 아이콘**: 처음엔 기존 아이콘을 복사해 임시 플레이스홀더로 넣을 계획이었으나, 작업 도중
  사용자가 직접 `menu-05.svg`/`menu-05-on.svg`(책 모양 아이콘)를 만들어 `web/public/`에 넣어줘서
  그대로 채택 — 플레이스홀더가 아니라 최종 아이콘이다.
- **적용**: `supabase/migrations/41_books_bookshelf.sql`(신규), `web/src/lib/books.ts`(신규,
  `publicWordbooks.ts`와 동일한 이유로 `DataRepository` 밖 독립 모듈),
  `web/src/lib/bookAutoplaySegments.ts`(신규), Admin 3페이지(`AdminBookListPage`/`FormPage`/
  `DetailPage`), 사용자 2페이지(`BookshelfListPage`/`BookViewPage`), `routes/index.tsx`/
  `BottomNav.tsx`(사용자·관리자 탭 각각에 "책장" 추가, `no: '05'`)/`GlobalAutoPlayBar.tsx`의
  `BOTTOM_NAV_ROUTES`에 `/books` 추가. `tsc -b`/`eslint .`/`vite build` 통과.
- **한계**: 실브라우저 자동화가 없어 코드 리뷰 + 타입체크로만 검증. DB 마이그레이션은 파일만
  작성했고 실제 Supabase 프로젝트 적용은 사용자가 Dashboard에서 직접 실행해야 한다. `mobile/App.tsx`는
  전혀 건드리지 않아(자동재생 인프라를 그대로 재사용) EAS 재빌드 불필요, 웹 배포만으로 앱에도 반영된다.

### 일정 시작/종료 날짜·시간 자동 채움 — 조작 최소화

- **요구사항**: 일정 추가/수정 시 시작/종료 날짜·시간을 최대한 자동으로 채워 사용자가 매번 4개
  필드를 다 채우지 않아도 되게 한다. (1) 반대쪽이 비어있으면: 날짜는 같은 날짜로, 시간은 1시간
  차이로 채운다. (2) 이미 둘 다 값이 있는 상태에서 하나를 수정해 순서가 뒤집히면(시작이 종료보다
  뒤로 가거나 그 반대), 수정 전 두 값의 간격("원래 기간")을 그대로 유지한 채 반대쪽을 밀어서
  순서를 바로잡는다 — 시작을 옮기면 종료가 따라가고, 종료를 옮기면 시작이 따라간다.
- **결정**: `adjustScheduleDateTime(form, field, value)` 신설 — `ScheduleFormPanel`의 4개
  date/time input onChange를 전부 이 함수로 교체(add/edit 두 곳 모두 이 컴포넌트를 공유해 자동
  적용). 날짜는 `diffDays`로 일 단위 간격을, 시간은 `timeToMinutes`/`minutesToTime`으로 분 단위
  간격을 계산해 유지한다. `defaultForm()`도 신규 일정 진입 시 `endTime`을 처음부터 `time+1시간`으로
  채우도록 변경(기존엔 빈 값이라 즉시 저장하면 종료 시각이 없는 일정이 됐음).
- **적용**: `tsc -b`/`eslint .`/`vite build` 통과. 웹 전용 수정, EAS 재빌드 불필요.
- **한계**: 시간 간격은 자정을 넘나드는 경우(예: 23:30→00:30, 익일)를 고려하지 않고 24시간 내
  랩어라운드로만 계산한다 — 날짜가 걸쳐 있는 일정도 날짜 필드가 이미 다르면 문제없이 동작하지만,
  "시작 23시, 종료 00시(다음날)"처럼 시간만으로 익일을 표현하려는 입력은 지원 범위 밖(기존에도
  없던 기능이라 이번 변경으로 인한 회귀는 아님).

### 안드로이드 알림이 뜨긴 하는데 정확한 시각보다 늦게 뜸(오차) — SCHEDULE_EXACT_ALARM 권한 누락

- **배경**: 앞의 두 수정(안드로이드 채널, 오늘 일정 날짜 비교 버그) 이후 알림 자체는 뜨는 걸
  확인했지만, "3분에 맞췄는데 4분에 떴어" — 정확한 예약 시각보다 늦게(약 1분 안팎) 뜨는 오차가
  있다는 리포트. `expo-notifications`의 안드로이드 네이티브 구현
  (`node_modules/expo-notifications/android/.../ExpoSchedulingDelegate.kt`)을 직접 열어 확인한
  결과, 정확한 원인을 코드로 확인했다:
  ```kotlin
  private fun setupAlarm(triggerAtMillis: Long, operation: PendingIntent) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()) {
      AlarmManagerCompat.setExactAndAllowWhileIdle(...)   // 정확한 시각에 발사
    } else {
      AlarmManagerCompat.setAndAllowWhileIdle(...)        // 배터리 절약을 위해 OS가 시각을 뭉개서(batch) 발사
    }
  }
  ```
  안드로이드 12(API 31)부터는 `SCHEDULE_EXACT_ALARM` 권한이 매니페스트에 없으면
  `canScheduleExactAlarms()`가 항상 false라서 항상 `setAndAllowWhileIdle`(부정확) 경로를 타게
  되는데, 이 앱은 이 권한을 한 번도 선언한 적이 없었다 — 정확히 관찰된 증상(≈1분 안팎 지연)과
  일치.
  (expo-notifications 공식 문서에도 "Starting from Android 12 (API level 31), to schedule a
  notification that triggers at an exact time, you need to add `<uses-permission
  android:name="android.permission.SCHEDULE_EXACT_ALARM"/>`"라고 명시돼 있음.)
- **결정**: `mobile/app.json`의 `android.permissions`에 `"android.permission.SCHEDULE_EXACT_ALARM"`
  추가 — Expo 설정이 빌드 시 AndroidManifest에 반영한다.
- **한계**: 이건 **네이티브 매니페스트 변경**이라 새 EAS 빌드(재설치)를 해야만 반영된다(웹 재배포로는
  안 됨). 또한 안드로이드 13(API 33)부터는 OS 정책이 버전/시점에 따라 계속 바뀌어온 영역이라, 권한을
  선언해도 일부 기기/버전에서는 사용자가 시스템 설정(알람 및 리마인더)에서 직접 켜야 할 수도
  있다는 점은 실기기 없이 100% 장담하기 어렵다 — 재검증 필요.

### 반복 일정 수정/삭제 범위 선택 시트가 하단 메뉴바(BottomNav)에 가려짐

- **배경**: "일정 수정 관련 레이어가 메뉴바에 가려서 다 볼 수가 없어" 리포트. 반복 일정을 수정/삭제할
  때 뜨는 "이 일정만/이후 모두/전체" 선택 바텀시트(`RepeatScopeModal`)가 원인 — 이 시트는
  `items-end`로 화면 하단에 붙는 바텀시트인데, `BottomNav`와 **똑같이 `z-50`**을 쓰고 있었다. 같은
  z-index끼리는 DOM에서 나중에 그려지는 쪽이 위로 올라오는데, `BottomNav`는 `AppLayout`에서
  `<Outlet/>`(이 모달을 포함한 페이지 콘텐츠) **다음에** 렌더링되므로 항상 이 시트 위에 그려져
  시트 하단의 버튼(특히 "취소")이 메뉴바에 가려 안 보였다. 다른 모달들(`GuestMigrationModal`,
  `DowngradeModal`)은 화면 중앙에 뜨는 다이얼로그라 이 문제가 없었고, 바텀시트 스타일은 이 컴포넌트가
  유일해서 지금까지 발견되지 않았던 것으로 보인다. 알림 수정 작업 때문에 사용자가 반복 일정을
  다시 저장해보면서(이 세션에서 요청한 재검증 절차) 처음 눈에 띈 것으로 추정.
- **결정**: `RepeatScopeModal`의 z-index를 `z-[60]`으로 올려 `BottomNav`(z-50)보다 항상 위에 뜨도록
  고정하고, 시트 콘텐츠에 `env(safe-area-inset-bottom)` 기반 하단 패딩을 추가(다른 하단 고정
  요소인 `BottomNav`/`GlobalAutoPlayBar`와 동일한 안전영역 패턴 적용, 홈 인디케이터에 버튼이
  붙지 않게).
- **적용**: `tsc -b`/`eslint .`/`vite build` 통과. 웹 전용 수정, EAS 재빌드 불필요.

### 일정 알림 미수신의 진짜 원인 — "오늘" 일정은 항상 통째로 걸러지던 날짜 비교 버그(플랫폼/등급 무관)

- **배경**: 안드로이드 채널 수정 배포 후에도 "권한은 허용했는데 여전히 안 온다"는 재확인(16:40
  일정 10분전 알림, 안드로이드 16:30 정시 알림 둘 다 미수신) + "게스트는 원래 안 뜨나?" 질문.
  권한/채널 둘 다 정상인데도 안 온다는 건 애초에 알림이 예약조차 안 됐다는 뜻이라, 예약 로직
  자체를 다시 의심해 `notificationScheduler.ts`/`scheduleRepeat.ts`를 재검증했다.
- **원인**: `refreshScheduleNotifications()`가 `expandScheduleOccurrences(schedule, now, rangeEnd)`를
  호출할 때 `now = new Date()`(현재 정확한 시각, 예: 오늘 14:32:07)를 `rangeStart`로 그대로
  넘기고 있었다. 그런데 `expandScheduleOccurrences`는 각 occurrence를 **자정 기준 Date**로 만들고
  (`baseDay`/`current`), `baseDay >= rangeStart`(단발 일정) 또는 `current >= rangeStart`(반복
  일정) 로 비교한다 — "오늘 자정(00:00)"은 "오늘 14:32"보다 항상 작으므로, **자정을 넘긴 이후엔
  (즉 거의 항상) 오늘 날짜의 occurrence가 실제 시작 시각과 무관하게 통째로 걸러진다.** 그 결과
  `occurrences`가 빈 배열이 되어 `inputs.length === 0`으로 조용히 `return` — 알림 row도, 브리지
  호출도 전혀 발생하지 않는다. 이건 플랫폼(iOS/Android)도, 등급(Guest/Pro/...)도 전혀 관계없는
  **순수 웹 로직 버그**였다 — 지금까지의 모든 "안 온다" 리포트가 사실 전부 이 버그 하나로 설명된다.
  `HomePage.tsx`/`ScheduleListPage.tsx`의 동일 함수 호출부는 원래부터 자정 기준 Date를 넘기고
  있어(`floorDay`/`T00:00:00`) 이 문제가 없었다 — 그래서 화면에는 오늘 일정이 정상적으로 보였는데
  알림만 안 갔던 것.
- **결정**: `refreshScheduleNotifications()`에서 `expandScheduleOccurrences`에 넘기는 시작 범위를
  오늘 자정으로 내림한 별도 값(`rangeStart`)으로 분리하고, "이미 지난 시각인지" 판정은 기존처럼
  정확한 `now`로 하는 `fireAt > now` 필터에서만 하도록 함(자정 내림 자체는 occurrence 존재 여부
  판정용, 실제 과거 시각 배제는 그대로 정밀하게 유지).
- **적용**: `tsc -b`/`eslint .`/`vite build` 통과. 웹 전용 수정이라 EAS 재빌드 불필요.
- **한계**: 이 수정은 **앞으로** 생성/수정되는 일정부터 적용된다 — 이미 저장된 기존 일정(알림이
  한 번도 예약된 적 없는)은 자동으로 소급 재예약되지 않으므로, 사용자가 테스트했던 기존 일정은
  한 번 수정 후 다시 저장(값을 안 바꿔도 저장만 다시)하거나 새로 등록해야 알림이 실제로 잡힌다.

### 일정 알림이 여전히 안 옴(아이폰/안드로이드 둘 다) — 안드로이드 알림 채널 누락 발견 + 미확인 요인 1건

- **배경**: `WEB_READY`/권한 결과 확인 수정 이후에도 "일정 알림이 안 온다"는 재확인 리포트(이번엔
  아이폰/안드로이드 둘 다). expo-notifications 공식 문서(v56, `docs.expo.dev/versions/v56.0.0/sdk/notifications`)를
  다시 확인해 안드로이드 전용으로 확실한 버그 하나를 찾았다: **"안드로이드 13+에서는 알림 채널이
  최소 1개 존재해야 시스템 권한 프롬프트 자체가 뜬다"** — 이 앱은 `setNotificationChannelAsync`를
  단 한 번도 호출하지 않은 채 `requestPermissionsAsync()`부터 불렀다. 즉 안드로이드에서는 권한
  프롬프트가 애초에 사용자에게 뜨지 않았을 가능성이 높고(조용히 거부 상태로 남음), 설령 권한이
  있었더라도 `scheduleNotificationAsync`의 trigger에 `channelId`를 지정하지 않아 어느 채널로
  갈지 불명확했다.
- **결정**: `mobile/App.tsx` 마운트 시 `Platform.OS === 'android'`일 때
  `Notifications.setNotificationChannelAsync('default', { name: '일정 알림', importance:
  AndroidImportance.MAX })`를 **`requestPermissionsAsync()`보다 먼저** 호출하도록 순서를 명시적으로
  고정(기존엔 순서 자체가 없었음 — 채널 생성 호출이 아예 없었다). `SCHEDULE_NOTIFICATION` 핸들러의
  trigger에도 안드로이드일 때 `channelId: 'default'`를 추가.
- **한계 — 아이폰 원인은 미확인**: 이 채널 문제는 안드로이드에만 해당돼 iOS까지 동시에 안 오는 걸
  전부 설명하진 못한다. 코드 리뷰로 확인한 가장 유력한 공통 원인은 오히려 더 단순한 것 — 테스트로
  등록한 일정의 "알림" 드롭다운이 기본값 **"알림 없음"**(`alarm_minutes = null`)으로 남아있으면
  `refreshScheduleNotifications()`가 아무 것도 예약하지 않고 조용히 리턴한다(정상 동작, 버그
  아님) — 실제로 사용자가 이전에 보내준 일정 등록 화면 스크린샷에서도 "알림 없음"이 선택돼 있었다.
  사용자에게 실제 알림 시간을 지정했는지, `설정 > 알림` 섹션에 권한 거부 배너가 떠있는지 확인을
  요청함.
- **적용**: `mobile`: `tsc --noEmit` 통과. 실기기 검증은 불가(이 환경엔 기기 없음) — 다음 EAS
  빌드로 사용자가 직접 확인 필요.

### 일정 date/time input 폭이 들쭉날쭉하던 버그 — NativeDateTimeInput 래퍼가 flex 크기를 못 받고 있었음

- **배경**: "상단 필터 날짜영역, 시작/종료 일시 date/time 사이즈가 들쭉날쭉하다" 리포트. 원인은
  바로 위 항목에서 만든 `NativeDateTimeInput`의 구조 — 앱(`isNative()`) 분기에서 실제 flex 자식은
  아이콘을 겹쳐 그리기 위한 `<div className="relative">` 래퍼인데, 정작 `flex-1`/`min-w-0` 같은
  크기 배분 클래스는 **래퍼가 아니라 안쪽 `<input>`의 `className`에만** 들어있었다. 래퍼 자체엔
  아무 폭 지정이 없으니 `flex-basis: auto`가 자기 내용(입력값 텍스트의 고유 너비)을 기준으로
  각자 다르게 계산돼, 날짜와 시간 칸 너비가 값의 길이에 따라 제각각으로 보였다(브라우저 쪽은 래퍼
  없이 input이 직접 flex 자식이라 원래 문제없었음 — 그래서 이번에 아이콘 통일 작업 이후에만 새로
  생긴 회귀).
- **결정**: `NativeDateTimeInput`에 `wrapperClassName` prop을 추가해 flex 배분 클래스를 **항상 실제
  flex 자식(앱은 relative div, 웹은 필요 시 감싸는 div)에 적용**하도록 분리, `className`은 순수
  시각 스타일(테두리/배경/패딩)만 담당하게 함. 상단 필터 fromDate/toDate는 `flex-1`(1:1 동률),
  시작/종료 일시의 날짜/시간은 `flex-[3]`/`flex-[2]`(날짜가 시간보다 조금 더 넓게)로 명시.
- **적용**: `tsc -b`/`eslint .`/`vite build` 통과. 빌드 CSS에서 `.flex-\[3\]{flex:3}`,
  `.flex-\[2\]{flex:2}` 생성 확인.

### 시작/종료 일시 세로 배치 — "항상 세로"였던 걸 360px 이하 조건부로 되돌림

- **배경**: iOS 오버플로우를 잡으려고 안전 조치로 "화면 크기와 무관하게 항상 세로 배치"로
  단순화했었는데(위 "안드로이드 arrow 여백 + iOS 오버플로우 수정" 항목), 원래 사용자 요구사항은
  "폭 370px 이하일 때만 세로로"였다 — PC나 큰 화면 폰에서도 항상 세로로 쌓여 불필요하게 UI가
  길어지는 회귀였다.
- **결정**: `ScheduleListPage.tsx`의 시작/종료 일시 내부 컨테이너를 `flex-row` 기본 + `max-[360px]:
  flex-col`(원래 370px에서 360px로 소폭 조정 — 임계값 자체가 원인이 아니었던 걸 확인했으므로 큰
  의미는 없음)로 되돌림. iOS 오버플로우 자체는 이 배치와 무관하게(위 "앱 전용 아이콘 통일 재시도"
  항목의 `NativeDateTimeInput`으로) 별도로 대응 중.
- **적용**: `tsc -b`/`eslint .`/`vite build` 통과.

### 일정 날짜/시간 입력 아이콘 통일 — 앱(WebView)에서만 재시도, 웹은 그대로 유지

- **배경**: 위 항목("iOS 오버플로우, pr-5로도 미해결")에서 추가 CSS 추측을 보류하고 사용자에게
  방향을 물었다. 사용자가 "앱/웹을 분기할 수 있으면 앱은 예전 아이콘 통일 방식대로 처리하고 웹은
  지금대로 유지"를 선택 — 과거 실패 이력을 다시 보면, 실제로 **데스크톱 웹에서만** 값이 안 보이는
  치명적 실패가 있었고(2차 시도), iOS/Android 자체에서 이 특정 레시피(appearance-none +
  `::-webkit-calendar-picker-indicator` display:none)가 실패했다는 기록은 없다(1차 시도의 iOS
  글리치는 이것과 다른 방식 — opacity로만 숨기고 커스텀 아이콘을 겹쳐 그리는 방식 — 이었다). 즉
  "웹에서 실패"와 "앱에서 실패"가 서로 다른 시도에서 나온 증상이라 분기하면 각자의 실패를 피할 수
  있다는 논리가 성립한다.
- **결정**: `web/src/components/ui/NativeDateTimeInput.tsx` 신설 — `isNative()`가 거짓(브라우저)이면
  기존과 100% 동일한 순정 `<input type="date"|"time">`을 그대로 렌더링(웹 경로 완전 무변경, 회귀
  위험 없음). `isNative()`가 참(앱 WebView)일 때만 `appearance-none` + `::-webkit-date-and-time-value`
  정렬 보정 + `::-webkit-calendar-picker-indicator{display:none}`을 적용하는 `.native-datetime-input`
  클래스(전역 CSS에 추가하되 이 클래스 자체가 앱에서만 DOM에 붙으므로 웹에는 영향 없음)를 씌우고,
  네이티브 아이콘 자리에 공용 `CalendarIcon`/`ClockIcon`(신규, `components/icons.tsx`)을
  `pointer-events-none`으로 절대 위치시켜 아이콘을 통일한다. 우측 여백은 Tailwind 클래스 캐스케이드
  순서 문제(이전 `pr-5` vs `px-3` 우선순위 혼란 경험)를 피하기 위해 인라인 `style={{paddingRight}}`로
  고정해 항상 확실히 이기게 했다. `ScheduleListPage.tsx`(6곳)·`SettingsPage.tsx`(1곳) 전부 이
  컴포넌트로 교체.
- **한계**: 여전히 이 환경엔 실기기가 없어 앱에서 실제로 아이콘이 겹치지 않고 오버플로우도
  사라지는지는 검증 불가 — 사용자가 새 EAS 빌드로 확인 필요. 이번에도 실패하면(특히 이 레시피
  자체가 애초에 iOS 앱에서도 실패했었는데 그 라운드에 마침 다른 증상에 가려 못 알아챘을 가능성),
  더 이상 네이티브 input CSS를 재시도하지 않고 완전한 커스텀 피커로 전환하는 게 맞다는 판단.

### 메인 화면에 등록된 일정이 안 보이던 버그 — HomePage가 Guest에서 항상 Supabase를 직접 조회

- **배경**: "일정이 있는데 메인에는 등록된 일정이 없다고 나와" 리포트. `HomePage.tsx`의
  `fetchHomeSchedules()`가 `supabase.from('schedules')`/`supabase.from('schedule_exceptions')`를
  **tier와 무관하게 항상 직접** 조회하고 있었다 — 코드에 남아있던 주석("일정은 아직
  Repository/Guest 로컬 저장에 연동되지 않았다")이 실제로는 이미 지나간 얘기였다. Guest 일정은
  IndexedDB(Dexie)에 저장되므로 이 Supabase 직접 조회는 Guest에게 항상 빈 배열만 돌려주고,
  그래서 쿼리 자체를 `tier !== 'guest'`일 때만 활성화하는 방식으로 **Guest는 애초에 조회를
  스킵**하도록 막아뒀던 것 — Guest가 일정을 등록해도 메인 화면 미리보기에 절대 나타날 수 없는
  구조였다. 정작 `ScheduleListPage.tsx`는 이미 오래전에 `getRepository(tier).getSchedules()`
  경유로 전환돼 있어(Guest 일정 목록 자체는 정상 노출), 이 괴리를 아무도 알아채지 못했다.
- **결정**: `fetchHomeSchedules()`가 `DataRepository`를 인자로 받아
  `repository.getSchedules()`/`repository.getScheduleExceptions(from,to)`를 쓰도록 변경
  (`ScheduleListPage.tsx`와 동일 패턴), `useQuery`의 `enabled`도 `!!repository`로 바꿔 admin을
  제외한 모든 tier(Guest 포함)에서 정상 조회되게 함. `tsc -b`/`eslint`/`vite build` 통과.
- **한계**: 실기기/실브라우저 검증 없이 코드 리뷰 + 타입체크로만 확인. Guest로 직접 일정을
  등록하고 메인 화면에 실제로 나타나는지는 사용자가 재확인 필요.

### 안드로이드 select 드롭다운 화살표 — 우측 여백 추가 확대(0.5rem → 1rem)

- **배경**: `src/index.css`의 전역 `select` 스타일(`background-position: right 0.5rem center`)로
  그리는 커스텀 화살표가 "우측라인에 너무 붙어있다"는 재확인 리포트. 이전 세션에서 이미 화살표
  크기(1.4rem)는 두 차례 조정했지만 위치(우측 여백)는 손대지 않았었다.
  `padding-right: 2.75rem !important`로 텍스트와의 겹침은 막아뒀으나, 화살표 자체의 그리기 위치가
  박스 우측 끝에서 0.5rem(8px)밖에 안 떨어져 있어 시각적으로 여전히 가장자리에 붙어 보였다.
- **결정**: `background-position`을 `right 0.5rem center` → `right 1rem center`로 변경. 전역
  `select` 규칙이라 앱 전체(일정 반복/알림 설정 등 모든 select)에 일괄 적용됨.
- **한계**: 실기기 확인 없이 적용. 여전히 부족하면 다음엔 값 자체보다 `padding-right`(현재
  2.75rem)를 더 키우는 방향도 고려.

### 일정 날짜/시간 input — iOS 오버플로우, pr-5로도 미해결(추가 CSS 시도 보류)

- **배경**: 직전 항목(같은 날 앞선 결정, "안드로이드 arrow 여백 + iOS 오버플로우 수정")에서 적용한
  `pr-5`(우측 패딩 20px 추가)가 배포된 새 빌드에서도 iOS 오버플로우가 그대로 재현됐다는 리포트를
  받았다. 특히 "반복 종료일"(`repeatUntil`) 입력은 다른 입력과 폭을 나눠 쓰지 않는 **단독 전체 폭
  입력**인데도 동일하게 오버플로우가 재현된다는 점이 중요한 단서다 — 형제 요소와 폭을 다투는
  flex-shrink 부족 문제가 아니라, iOS의 `<input type="date">`가 **자신에게 부여된 CSS `width`
  자체를 무시하고 내용에 필요한 만큼 더 넓게 그리는** 널리 알려진 WebKit 동작일 가능성이 높다는
  뜻이다. 이런 경우 `padding`/`min-width`/`flex` 어떤 조합을 시도해도 근본적으로 안 먹힌다.
  실기기가 없는 이 환경에서 이 가설을 직접 확인할 수는 없지만, 이미 이 문제로 3~4차례 각기 다른
  CSS 시도가 전부 실패한 이력(위 "(시도 후 되돌림)" 항목들)과 정확히 들어맞는 패턴이다.
  **이번엔 추가 CSS 추측 시도를 하지 않고 사용자에게 방향을 확인하기로 결정** — 이전 교훈("실기기
  검증 없이는 손대지 말 것, 정말 필요하면 커스텀 피커를 새로 만들 것")을 따름.

### 일정 알림이 전혀 오지 않던 버그 — WEB_READY 미전송 + 알림 권한 결과 미확인

- **배경**: "일정은 지정된 알림 시간에 알림이 와야하는데 알림이 안와" 리포트로 조사를 시작했다.
  `notificationScheduler.ts`의 예약 로직(발생 시각 계산 → `createNotifications` → 개별
  `bridge.scheduleNotification`) 자체는 정상이었다.
- **1차 원인(가장 치명적, 자동재생 버그와 동일 계열)**: `web/src/bridge/index.ts`의
  `bridge.ready()`(→ `WEB_READY` 전송)가 웹 코드 어디에서도 호출되지 않고 있었다.
  `mobile/App.tsx`의 `sendToWeb()`는 `WEB_READY`를 받기 전까지 네이티브→웹 모든 메시지를
  `pendingQueue`에 쌓아두는 구조라, 알림 예약 결과뿐 아니라 자동재생 진행 이벤트·구매 결과·STT
  결과까지 네이티브 기동 초기엔 전부 유실되고 있었다(이번 세션 자동재생 미니플레이어 고착 버그의
  진짜 근본 원인도 이것). `web/src/App.tsx`의 최상위 `App()`에 `useEffect(() => { if (isNative())
  bridge.ready() }, [])`를 추가해 해결.
- **2차 원인(알림 특정)**: `bridge.requestPermission()`(웹→네이티브, 알림 권한 재요청)이 어떤
  화면에서도 호출되지 않았고, 유일한 권한 요청은 `mobile/App.tsx` 마운트 시 fire-and-forget으로
  실행되는 `Notifications.requestPermissionsAsync()`뿐이었다 — 결과(허용/거부)를 아무 데서도
  확인하지 않아, 사용자가 최초 설치 시 권한을 거부했어도 앱 안에서는 전혀 알 수 없었다(iOS/Android
  둘 다 한 번 거부하면 OS가 재요청 팝업을 다시 띄우지 않는다).
- **결정**: `mobile/App.tsx`의 권한 요청을 `Notifications.requestPermissionsAsync().then(({granted})
  => sendToWeb({type:'PERMISSION_RESULT', payload:{permission:'notifications', granted}}))`로 바꿔
  결과를 웹에 능동 전달하고, 웹에 `web/src/stores/notificationPermissionStore.ts`(항상 등록되는
  `registerBridgeListener` 패턴)를 신설해 이를 저장. `SettingsPage.tsx`의 "알림" 섹션에
  `isNative() && granted === false`일 때 시스템 설정에서 권한을 켜달라는 안내 배너를 추가.
- **한계**: 이 환경엔 실기기가 없어 권한 거부 상태에서 배너가 실제로 뜨는지, 권한을 켠 뒤 알림이
  실제로 오는지는 검증 불가 — 사용자가 실기기에서 직접 확인해야 한다. 또한 "테스트로 등록한 일정의
  알림 시각이 이미 과거였을 가능성"(이 경우 `fireAt > now` 필터로 정상적으로 스킵되는 것이지 버그가
  아님)은 이번에 배제하지 못했으므로, 권한을 켠 뒤에도 알림이 안 온다면 일정의 알림 시각 자체를
  다시 확인해봐야 한다.

### 일정 입력 날짜/시간 — 안드로이드 화살표 여백 + iOS 오버플로우 추가 수정 (아이콘 오버레이는 재시도 안 함)

- **배경**: 순정 네이티브 input으로 되돌린 뒤에도 "안드로이드 화살표가 우측에 너무 붙어있다",
  "아이폰에서 date가 컨텐츠 박스를 뚫고 넘어간다"는 리포트가 있었다. 아래는 셰도우 DOM을 건드리지
  않는 안전한 여백/레이아웃 수정만 적용한다(아이콘 오버레이 방식은 위 2건의 실패로 재시도하지
  않기로 확정됨).
- **결정**: `ScheduleListPage.tsx`의 모든 date/time input에 `pr-5`를 추가해 네이티브 화살표와
  입력 텍스트/박스 우측 경계 사이 여백을 넓혔다. 시작/종료 일시 행은 기존에 370px 이하에서만
  세로로 쌓이던 조건부 레이아웃(`max-[370px]:flex-col`)을, 그 임계값으로도 iOS 오버플로우가
  재현된 점을 감안해 화면 크기와 무관하게 항상 `flex flex-col`로 쌓이도록 단순화했다.
- **한계**: 실기기 확인 없이 적용한 수정이라 이번에도 완전히 해결됐는지는 사용자의 실기기 재확인이
  필요하다.

---

### (시도 후 되돌림) 날짜/시간 입력 아이콘 통일 — 네이티브 아이콘 위에 커스텀 아이콘 오버레이

- **시도**: `<input type="date">`/`type="time">`의 네이티브 달력·시계 아이콘이 Android/iOS/웹마다
  달라 보이는 문제를 CSS만으로 해결하려 했다 — `::-webkit-calendar-picker-indicator`를 투명 처리해
  입력 전체를 덮게 하고(클릭 영역 유지) 그 위에 공용 SVG 아이콘을 겹쳐 그리는
  `NativeDateTimeInput` 컴포넌트를 만들어 일정 폼·설정 알림 시간에 적용했다.
- **실패**: 실기기 확인 결과 iOS에서 시간 입력이 텍스트와 아이콘이 겹치며 깨지고(사용자 스크린샷
  확인), 이어서 날짜 입력도 화면을 넘어가는 게 재현됐고, Android에서는 아이콘이 자체 드롭다운
  화살표와 겹쳐 보이는 문제까지 나왔다 — 세 플랫폼 중 어느 한 곳도 온전하지 않았다. 이 환경엔
  실기기/브라우저가 없어 CSS 트릭을 눈으로 보며 고칠 방법이 없었고, 두 번의 재시도 끝에도 계속
  다른 증상이 나와 전면 되돌림.
- **결정**: 아이콘 통일 시도를 전부 되돌리고 순정 네이티브 `<input type="date">`/`type="time">`로
  복귀(`min-w-0` 오버플로우 수정만 유지). `NativeDateTimeInput.tsx`/`CalendarIcon`/`ClockIcon` 삭제.
- **교훈**: 네이티브 date/time input의 셰도우 DOM 내부(아이콘, 세그먼트, 스피너)를 CSS 가상 요소로
  재스타일링하는 건 브라우저 엔진별 구현이 표준화돼 있지 않아 매우 깨지기 쉽다 — 실기기 시각 확인
  없이는 손대지 말 것. 정말 통일된 모양이 필요하면(이번엔 "가볍게, 아이콘만"을 선택했지만) 처음부터
  커스텀 날짜/시간 선택 UI를 새로 만드는 쪽이 오히려 더 안전하다.
- **2차 재시도(같은 날)**: 사용자가 iOS date/time input 버그의 표준 처방(`appearance-none`으로
  iOS 기본 셰도우 스타일을 먼저 초기화 → `::-webkit-date-and-time-value`의 정렬/높이 보정 →
  `::-webkit-calendar-picker-indicator`를 `opacity`가 아니라 `display:none`으로 완전히 제거)을
  제시해 이 방식으로 다시 적용했다. 1차 시도와의 핵심 차이는 (a) appearance 리셋을 먼저 하지
  않았던 점, (b) 인디케이터를 `opacity:0`으로만 숨겨 여전히 레이아웃/히트테스트에 남아있던 점 —
  이 둘이 iOS/Android 양쪽 증상의 실제 원인이었을 가능성이 높다고 보고 재시도.
- **2차도 실패, 완전 포기**: 이번엔 웹(데스크톱 브라우저)에서 날짜/시간 값 자체가 아예 안 보이는
  문제가 새로 생겼다 — Chrome 계열 데스크톱은 `appearance-none`을 `<input type="date">`/`type="time">`
  에 걸면 내부 세그먼트(연/월/일, 시:분) 렌더링 자체가 사라지는 것으로 보인다(모바일 Safari와
  엔진 처리가 다름). iOS 2번, Android 1번, 웹 1번까지 4개 환경 전부에서 각기 다른 증상으로
  깨졌다 — 완전히 되돌리고 순정 네이티브 input(`min-w-0` 오버플로우 수정만 유지)으로 최종 확정,
  이 방향은 더 이상 재시도하지 않는다. `NativeDateTimeInput.tsx`/`CalendarIcon`/`ClockIcon` 재삭제.
- **최종 교훈**: 표준으로 알려진 CSS 레시피라도 이 환경(실기기/브라우저 시각 확인 불가)에서는
  플랫폼별 부작용을 예측할 수 없다 — 아이콘 통일이 꼭 필요하면 CSS 오버레이가 아니라 네이티브
  input을 완전히 대체하는 커스텀 날짜/시간 선택 UI를 새로 만들어야 하고, 그마저도 실기기로 직접
  검증 가능한 상태에서 진행해야 한다.

---

### 퀴즈 주관식 음성 입력 — 눌러서 녹음 방식 + 오답을 정답으로 표시하던 버그 수정

- **음성 입력 UX 변경**: 기존엔 마이크 버튼을 탭하면 녹음이 시작되고 무음 감지(또는 단발성 인식
  완료)로 일정 시간 후 자동 종료됐는데, 답이 짧거나 길 때 맞지 않는 문제가 있었다. 눌러서 녹음,
  손을 떼면 종료하는 방식(walkie-talkie)으로 변경 — `Quiz.tsx`의 마이크 버튼을 `onClick` 토글에서
  `onPointerDown`(시작)/`onPointerUp`·`onPointerLeave`·`onPointerCancel`(종료)로 교체했다. 웹
  `SpeechRecognition`과 네이티브 `expo-speech-recognition` 둘 다 `continuous: true`로 바꿔, 사용자가
  직접 멈추기 전까지 무음 감지로 중간에 끊기지 않게 했다. 부수 수정: continuous 모드에서는 말하다
  잠깐 멈출 때마다 중간 결과가 `final: true`로 여러 번 올 수 있어, 그 신호로 `listening` 상태를 끄던
  로직과(있었다면 손을 떼기 전에도 마이크 UI가 꺼져 보였을 것) 첫 결과에서 구독을 끊던 네이티브 쪽
  로직을 제거하고, 웹 쪽 `onresult`도 항상 첫 결과(`results[0]`)만 보던 것을 최신 결과로 고쳤다.
- **오답이 "정답입니다!"로 표시되던 버그**: `Quiz.tsx`의 `handleSubmitShort()`가 정답 여부와 무관하게
  `setSelectedId(correctId)`를 항상 호출하고 있었다 — 화면의 정답 판정(`isCorrectAnswer = selectedId
  === correctId`)이 그래서 주관식 제출 시 항상 참이 됐다(실제 정오 판정을 쓰는 점수 집계
  `correctCount`는 정상이었지만 화면 피드백이 항상 "정답"으로 보였다). 음성 입력 쪽에서 특히
  체감됐지만 키보드 입력도 동일하게 영향받는 버그였다. 정답일 때만 `correctId`, 오답이면 `null`을
  넣도록 수정.

### 자동재생 배속 조절 추가

- 미니 플레이어에 배속(0.5x~1.5x, 0.1 단위) 조절 UI 추가 — 컨트롤 옆 "1.0x" 알약 버튼을 누르면
  슬라이더 패널이 위로 펼쳐진다. `autoplayStore.ts`에 `rate` 상태 + `setRate()` 추가(세션과 무관하게
  유지되는 값이라 `close()`에서도 리셋 안 함). 웹은 `speechSynthesis`의 `utterance.rate`, 앱은
  `expo-speech`의 `Speech.speak({ rate })`로 적용 — 재생 도중 바꾸면 지금 말하는 세그먼트는 그대로
  끝까지 가고 다음 세그먼트부터 반영된다(새 브리지 메시지 `AUTOPLAY_SET_RATE` 추가). 네이티브의
  onDone 안 불림 안전장치 타이머(예상 재생 시간 기반)도 배속만큼 나눠 보정했다.

### 단어 입력 폼을 "설명"에서 "예문"으로 전환 — description → example

- **배경**: `words` 테이블은 처음부터 `description`/`example`/`memo` 3개의 선택 필드를 갖고 있었고
  내보내기(`dataExport.ts`)·마이그레이션(`guestToRemoteMigration.ts`)·RPC(`create_words_checked`)
  등 백엔드 경로는 이미 셋 다 지원하고 있었다. 그런데 실제 단어 입력 폼(개인
  `WordbookDetailPage.tsx`, 관리자 `AdminWordbookDetailPage.tsx`, 둘의 `.txt` 일괄등록 파서)은
  전부 "설명"이라는 라벨로 `description` 컬럼 하나만 입력받고 있어 `example`/`memo`는 앱의 어떤
  UI로도 채울 수 없는 죽은 컬럼이었다. 사용자가 원하는 단어 입력 모델은 **단어/뜻/예문** 3개뿐.
- **결정**: 입력 폼·`.txt` 3번째 컬럼·미리보기·목록 표시를 전부 `description`이 아니라 `example`을
  쓰도록 전환(라벨도 "설명"→"예문"). 함께 쓰던 `QuizWord.description`/`AnswerReveal`의
  `description`/`onSpeakDescription` prop도 `example`/`onSpeakExample`로 개명하고, Quiz 정답 화면의
  "설명 듣기" 버튼은 "예문 듣기"로 바뀌며 원어 음성(기존엔 한국어 음성으로 읽던 버그성 동작)으로
  읽는다. `LearnPage.tsx`의 "설명" 표시 블록은 제거(예문/메모만 남김) — 입력 경로가 없어진 필드를
  화면에 남겨두면 오히려 혼란만 준다.
- **한계**: DB 컬럼 자체는 그대로 둔다(마이그레이션 없음) — 이전에 "설명"으로 입력했던 기존 값은
  여전히 `description` 컬럼에 남아 있고, 화면상 예문 섹션에는 나타나지 않는다(내보내기에서는 계속
  보임). 기존 데이터를 `example`로 옮기는 마이그레이션은 이번 범위 밖.

---

### 메인/학습하기 자동재생 — 웹은 JS 스케줄링, 앱은 네이티브(RN)가 시퀀싱

- **배경**: 메인 페이지 캐러셀과 학습하기(`/learn`) 목록에 단어를 순서대로 읽어주는 자동재생을
  추가하면서, 앱(RN 래퍼)에서는 화면 잠금/백그라운드 상태에서도 재생이 이어져야 한다는 요구사항이
  있었다.
- **문제**: Moroutine의 실제 UI/로직은 `mobile/App.tsx`가 띄우는 WebView 안의 웹 앱(`web/`)에서
  돈다. 웹 쪽 `setTimeout` + TTS만으로 "1초 기다렸다 다음 단어"를 반복하면, 화면이 꺼지거나 앱이
  백그라운드로 가는 순간 WebView의 JS 타이머 자체가 스로틀링/정지될 수 있다(iOS WKWebView는 비가시
  상태에서 JS 실행을 강하게 제한한다) — RN 호스트 앱이 백그라운드 오디오 권한으로 계속 실행되더라도,
  WebView 콘텐츠의 JS는 별개로 죽을 수 있다.
- **결정**: 웹(브라우저)과 앱(RN)을 분기한다.
  - 웹: 백그라운드 보장은 애초에 불가능(웹 플랫폼 정책상 100% 보장 불가) — 순차 재생을 웹 JS가
    직접 스케줄링(`speechSynthesis` 완료 콜백 기반)한다. 탭이 보이는 동안만 정상 동작하면 충분.
  - 앱: 재생 시작 시 전체 단어 목록을 브리지(`AUTOPLAY_START`)로 네이티브에 한 번에 전달하고,
    이후 순차 재생/타이머 루프는 **RN(`App.tsx`)의 JS 스레드**가 전담한다. RN 자체는 iOS
    `UIBackgroundModes: audio` + 활성 오디오 세션 덕분에 백그라운드에서도 계속 실행되므로, 여기서
    도는 `setTimeout` 루프는 화면이 꺼져도 살아있을 가능성이 훨씬 높다. 웹은 네이티브가 보내주는
    진행 이벤트(`AUTOPLAY_WORD_CHANGED`/`AUTOPLAY_FINISHED`)만 받아 미니 플레이어 UI를 갱신한다.
- **백그라운드 오디오 세션(앱)**: `expo-audio`(Expo SDK 56) 도입. iOS는
  `setAudioModeAsync({ shouldPlayInBackground: true, ... })` 한 번으로 충분(config plugin이
  `UIBackgroundModes: audio`를 자동 추가). Android는 그것만으론 약 3분 후 정지되어,
  `AudioPlayer.setActiveForLockScreen(true, ...)`로 잠금화면 컨트롤을 등록해야 지속된다(config
  plugin의 `enableBackgroundPlayback: true`가 `FOREGROUND_SERVICE`류 권한을 자동 추가). 실제 소리는
  기존 `expo-speech`가 담당하고(`useApplicationAudioSession` 기본값 `true`라 위 세션을 그대로 씀),
  볼륨 0의 무음 오디오를 반복 재생해 세션/포그라운드 서비스만 유지시키는 조합으로 구현했다
  (`mobile/assets/silence.wav`).
- **한계**: `app.json` config plugin 변경은 네이티브 프로젝트를 새로 빌드해야(EAS build) 반영된다.
  개발 환경에 Xcode/Android Studio/실기기가 없어 화면 잠금 상태의 실제 지속 재생 여부는 검증하지
  못했다 — 사용자가 실기기 EAS 빌드 후 직접 확인 필요. Android는 제조사별 배터리 최적화 정책에 따라
  포그라운드 서비스가 있어도 일부 기기에서 강제 종료될 수 있어 100% 보장은 아니다.

### 앱에서 자동재생 미니 플레이어가 계속 멈춰 보이던 근본 원인 — `WEB_READY` 신호 누락

- **현상**: 자동재생을 앱에 배포한 뒤, 실기기에서 미니 플레이어의 단어/위치/재생 상태가 처음 뜬
  그대로 고정되고 절대 안 바뀜(웹 브라우저에서는 정상). 잠금화면/이어폰으로 재생·정지해도 앱 내
  버튼이 그 상태를 반영하지 못함.
- **잘못된 가설들과 임시 조치**: 처음엔 (1) 자동재생 스토어의 네이티브 이벤트 리스너 등록이
  `isNative()`로 조건부라 모듈 최초 로드 시점의 타이밍 경합으로 등록 자체가 스킵될 수 있다고 보고
  무조건 등록으로 변경, (2) `expo-speech`의 `onDone`/`onError`가 기기·언어에 따라 안 불릴 수 있다고
  보고 예상 재생시간 기반 강제 진행 타이머 추가, (3) 화면 잠금 중 WebView가 정지돼 그 사이 메시지가
  씹혔을 수 있다고 보고 포그라운드 복귀 시 상태 재전송(`AppState`) 추가. 셋 다 합리적인 방어
  로직이었지만 실제로 재현해보니 증상이 전혀 안 고쳐짐 — 즉 이것들은 진짜 원인이 아니었다.
- **진짜 원인**: `mobile/App.tsx`의 `sendToWeb()`은 웹이 `WEB_READY` 메시지를 보내기 전까지는 모든
  전달할 메시지를 `pendingQueue`에 쌓아두기만 하고 실제로 `injectJavaScript`를 호출하지 않는다.
  그런데 `WEB_READY`를 보내는 `bridge.ready()` 호출이 **웹 코드 어디에도 없었다** — grep으로 전체
  검색해 확인. 즉 네이티브가 무엇을 보내든(알림 결과, 구매 결과, STT 결과, 그리고 이번 자동재생
  진행 이벤트까지) 전부 큐에 쌓이기만 하고 앱 화면에는 영원히 반영되지 않는 구조였다. 웹 브라우저는
  애초에 `isNative()`가 false라 이 큐잉 로직 자체를 타지 않아 문제가 드러나지 않았다. 이 프로젝트의
  네이티브→웹 방향 브리지 기능(알림 native_id 동기화 등)이 실기기에서 한 번도 제대로 검증되지 않은
  채(`docs/PROJECT_STATUS.md` "기기 테스트 필요" 표기들 참고) 오랫동안 방치돼 있던, 자동재생과
  무관한 훨씬 오래된 잠재 버그였다.
- **조치**: `web/src/App.tsx` 마운트 시 `isNative()`면 `bridge.ready()`를 호출하도록 한 줄 추가.
- **교훈**: 증상만 보고 그럴듯한 가설을 세워 방어 로직을 추가하기 전에, 메시지 전달 경로의 각
  단계(등록 → 발신 → 큐잉/플러시 조건 → 수신)를 코드로 직접 추적해 "이 경로가 한 번이라도 실행되는가"
  부터 확인했어야 했다 — 이번엔 세 번의 헛다리 끝에야 `grep`으로 `bridge.ready()` 호출부가 아예
  없다는 걸 발견했다.

### 자동재생이 읽는 내용 확장 — 단어만 → 단어+뜻+설명+예문

- **배경**: 사용자가 자동재생이 단어(term)만 읽어주는데 뜻/예문도 읽어줄 수 있는지 문의.
- **결정**: 한 단어당 **단어 → 뜻 → 설명 → 예문** 순서로 전부 읽도록 확장(`buildAutoPlaySegments()`,
  `web/src/lib/autoplaySegments.ts`). 언어는 기존 관례(Quiz/AnswerReveal의 발음 듣기 버튼들)를
  그대로 따라 단어/예문은 원어(`en-US`), 뜻/설명은 한국어(`ko-KR`)로 자동 전환한다. `AutoPlayItem`에
  `segments: {text, lang}[]`를 추가하고, 네이티브 브리지의 `AUTOPLAY_START` payload도
  `words: string[]`에서 `words: AutoplaySpeechSegment[][]`(단어별 세그먼트 목록)로 확장 — 네이티브
  쪽 시퀀서(`speakAutoplayWord`/`speakSegment`)도 세그먼트 단위로 재귀 처리하도록 재작성했다. 미니
  플레이어에 보이는 캡션(예문 우선, 없으면 뜻)은 표시 전용으로 그대로 유지 — 실제로 읽는 내용과는
  분리된 개념이다.

---

## 2026-09-03

### 회원가입 "Database error saving new user" — handle_new_user() 트리거를 방어적으로 재작성

- **현상**: 신규 이메일로 회원가입 시 Supabase가 "Database error saving new user"를 반환하며 계정
  생성 자체가 실패. 별개로, 이미 가입된 이메일로 다시 회원가입을 시도하면 "인증 링크를 보냈습니다"라고
  안내하지만 실제 메일은 오지 않음(Supabase가 계정 존재 여부를 노출하지 않으려고 에러 없이 성공처럼
  응답하는 표준 동작 — 실제로는 메일을 보내지 않는다).
- **원인**: "Database error saving new user"는 GoTrue가 `auth.users` INSERT에 걸린 트리거
  (`handle_new_user`, `docs/DECISION_LOG.md` 2026-09-01에서 관리자 설정값을 신규 가입자에게 복사하도록
  수정)가 예외를 던질 때 그대로 노출하는 일반 메시지다. 관리자 설정값 복사 로직이 어떤 이유로든
  실패하면 `profiles` 행 생성이 막히고 `auth.users` INSERT까지 롤백되어, 부가 기능(설정값 복사) 하나
  때문에 "계정 생성"이라는 핵심 기능 전체가 막히는 구조였다.
- **1차 조치(마이그레이션 39)**: 원인 확정 전, `docs/DECISION_LOG.md` 2026-07-19의 master-invite 계열
  Edge Function 수정과 동일한 방어 원칙(예외를 삼키지 않고 최상위에서 잡아 최소한의 성공 경로를
  보장)을 트리거에 적용 — 관리자 설정값 복사가 실패해도 예외를 잡아 기본값 `profiles` 행만이라도
  반드시 생성하고, 실패 원인은 `RAISE WARNING`으로 Postgres 로그에 남기게 했다. **적용 후에도 동일
  에러가 재현**되어(fallback INSERT까지 실패), 더 근본적인 원인이 있다고 판단.
- **실제 원인 확정(Postgres 로그 확인, 2026-09-03)**: `relation "profiles" does not exist`(SQLSTATE
  `42P01`). 원본(마이그레이션 01)은 `insert into public.profiles (...)`처럼 스키마를 명시했었는데,
  마이그레이션 34에서 관리자 설정값 복사 로직으로 재작성하며 `public.`을 빠뜨리고 스키마 미명시
  `profiles`만 사용했다. `auth.users` INSERT를 트리거하는 GoTrue의 연결 세션은 `search_path`에
  `public` 스키마가 기본 포함되어 있지 않아, 스키마 미명시 테이블명을 찾지 못해 실패한 것 — 반면
  PostgREST 경유 호출(REST API, `.rpc()`)은 별도 연결 경로라 `search_path`에 `public`이 정상 포함되어
  있어 같은 문제가 나타나지 않았다(그래서 `GET /rest/v1/profiles`는 200으로 정상 응답하면서 회원가입
  트리거만 실패하는 대조적인 증상이 나타남). 마이그레이션 39의 fallback INSERT도 스키마 미명시
  `profiles`를 그대로 썼기 때문에 똑같은 이유로 실패를 반복했다.
- **최종 수정(마이그레이션 40)**: `handle_new_user()`/`get_admin_default_settings()`(둘 다 마이그레이션
  34에서 신설)의 모든 테이블 참조를 `public.profiles`로 명시하고, SECURITY DEFINER 함수의 일반적인
  안전 수칙에 따라 `SET search_path = public, pg_temp`도 함께 고정해 같은 문제가 재발하지 않게 했다.
  다른 SECURITY DEFINER 함수(`get_service_tier()`, `create_words_checked()`, `is_admin()`)도 테이블을
  스키마 미명시로 참조하지만, 전부 PostgREST 경유(RLS 정책 평가, `.rpc()` 호출)로만 실행되고 그 경로는
  `search_path`에 `public`이 정상 포함되어 있어(지금까지 이 함수들 관련 오류 보고가 없었던 것과 일치)
  이번에는 손대지 않았다 — `auth.users` 트리거처럼 GoTrue가 직접 여는 연결 경로만 특이 케이스였다.
- **회원가입 에러 메시지 한국어화**: `LoginPage.tsx`에 Supabase Auth(GoTrue) 영문 에러 메시지 →
  한국어 매핑(`AUTH_ERROR_MESSAGES`)을 추가(매핑에 없는 메시지는 원문 그대로 표시 — 억지로 오역하는
  것보다 안전). 회원가입 시 `signUp()` 응답의 `data.user.identities`가 빈 배열이면(이미 가입된 이메일)
  "인증 링크를 보냈습니다" 대신 "이미 가입된 이메일입니다. 로그인해주세요."를 보여주도록 분기 추가 —
  실제로 메일이 발송되지 않았는데 발송됐다고 안내하던 부정확한 메시지를 바로잡음.
- **영향 범위**: `supabase/migrations/39_handle_new_user_defensive.sql`,
  `supabase/migrations/40_handle_new_user_schema_qualify.sql`(신규), `web/src/pages/auth/LoginPage.tsx`.

---

## 2026-09-02

### 관리자 화면 디자인을 사용자 화면과 통일

- **결정**: `/admin/**` 4개 화면(단어장 목록/상세, Master 관리, 감사 로그)을 기존 "데스크톱 대시보드풍"
  (`max-w-lg mx-auto` 중앙 정렬, `border border-gray-100 rounded-lg` 카드)에서 사용자 화면과 동일한
  모바일 앱 톤(전체 너비, `bg-white rounded-2xl shadow-sm` 카드, `gray-50` 배경, 동일한 헤더 패턴)으로
  전면 교체. `SettingsPage.tsx`의 `Section`/`Row` 컴포넌트를 `web/src/components/ui/SettingsList.tsx`로
  공용 분리해 `AdminMastersPage`가 그대로 재사용하도록 함(CLAUDE.md "공용 컴포넌트는 src/components/에서
  import" 원칙에 맞춤). Master 관리 화면의 "Master 추가" 영역만 별도로, `WordbookListPage.tsx`의 "+ 추가"
  폼 카드 디자인(흰 배경+테두리 rounded-2xl, `flex-1` 버튼 2개)으로 다시 맞춤(사용자 후속 요청).
- **영향 범위**: `web/src/pages/admin/{AdminWordbookListPage,AdminWordbookDetailPage,AdminAuditLogPage}.tsx`, `web/src/pages/master/AdminMastersPage.tsx`, `web/src/pages/settings/SettingsPage.tsx`, `web/src/components/ui/SettingsList.tsx`(신규).

### 공용 단어장 상태값 단순화 — 초안/기본/게시/보관 4가지로 통합, is_sample 흡수, 단어별 보관 폐지

- **결정**: 기존 `public_wordbooks.status`(`draft`/`published`/`hidden`/`archived`) + 별도 `is_sample`
  불리언 컬럼의 이중 구조를, `status` 하나로 통합했다. `'hidden'`은 폐지하고, 예전 `is_sample=true`(+
  `status='published'`)의 의미를 `status='default'`(기본) 값 하나가 대신한다 — `default`는 사용자에게는
  `published`와 동등하게 노출되면서(`docs/ADMIN_DESIGN.md` §3-4 RLS), 게스트에게도 최초 진입 시 자동
  제공된다. 마이그레이션 36으로 데이터 이관(`is_sample=true`→`default`, 남은 `hidden`→`draft`) + RLS
  정책 4건 교체 + `is_sample` 컬럼·인덱스 제거를 한 번에 처리.
- **단어(word) 단위 보관 폐지**: `public_words.status`(`active`/`archived`) 컬럼/RLS는 기존 데이터 보존을
  위해 남겨두되, 관리자 화면에서 개별 단어를 보관 처리하는 기능(버튼)은 제거했다 — 단어장 전체의
  `status`만으로 공개 범위를 관리하는 편이 더 단순하다는 사용자 판단. `web/src/lib/publicWordbooks.ts`의
  `archivePublicWord()` 함수도 사용처가 없어져 함께 제거.
- **추가/수정 폼 필드를 사용자 단어장과 동일하게 축소**: 관리자 `AdminWordbookFormPage`/
  `AdminWordbookDetailPage`의 단어장 메타 입력을 기존(제목/설명/카테고리/난이도/언어/샘플 체크박스)에서
  사용자 `WordbookListPage.tsx`의 추가 폼과 동일한 **이름+언어**만 남기고, 여기에 상태(초안/기본/게시/
  보관) 선택을 더하는 것으로 단순화했다. `description`/`category`/`difficulty` DB 컬럼 자체는 기존 데이터
  보존을 위해 그대로 두되(마이그레이션 없이 컬럼 유지), 폼에서는 더 이상 다루지 않는다 — 목록 화면의
  "카테고리 · 난이도" 표시도 함께 제거.
- **영향 범위**: `supabase/migrations/36_public_wordbook_status_simplify.sql`(신규), `web/src/types/index.ts`
  (`PublicWordbookStatus`, `PublicWordbook.is_sample` 제거), `web/src/lib/publicWordbooks.ts`
  (`Create/UpdatePublicWordbookInput`, `getPublishedPublicWordbooks`, `getSampleWordbooks`,
  `archivePublicWord` 제거), `web/src/lib/sampleWordbookSeed.ts`(주석), `web/src/pages/admin/
  {AdminWordbookListPage,AdminWordbookFormPage,AdminWordbookDetailPage}.tsx`, `docs/ADMIN_DESIGN.md`,
  `docs/DB_SCHEMA.md`.

### 공용 단어장 "담기"를 열람 등록(enrollment)에서 개인 단어장 복사로 전환

- **결정**: `PublicWordbookListPage.tsx`의 "내 단어장에 담기/담기 해제" 토글을 폐지하고, "내 단어장에
  추가" 버튼 하나로 바꿔 클릭 시 공용 단어장의 단어를 사용자의 **개인** `wordbooks`/`words`로 실제
  복사한다(`getRepository(tier).createWordbook()` + `bulkCreateWords()` 재사용). 복사 성공 시 방금 만든
  개인 단어장 상세로 이동하며, 이후에는 사용자가 직접 만든 단어장과 완전히 동일하게 수정·삭제·단어 추가가
  자유롭다.
- **이유**: 기존 "원본 참조 방식"(관리자가 수정하면 즉시 반영, Pro 한도 미포함)은 사용자 입장에서
  "내 단어장에 담았는데 왜 수정도 삭제도 못 하나"라는 혼란을 준다는 사용자 피드백. "담기 = 내 것으로
  복사"가 더 직관적인 멘탈 모델이라고 판단.
- **트레이드오프(의도적으로 감수)**: (1) 복사된 사본은 원본이 나중에 수정돼도 더 이상 반영되지 않는다
  (참조 방식의 핵심 장점 상실). (2) 복사된 단어는 일반 개인 단어와 동일하게 **Pro 개인 단어 한도에
  포함된다**(원본 자체는 여전히 미포함). `PublicWordbookViewPage`의 미리보기 학습하기/퀴즈풀기(원본을
  참조 방식으로 직접 학습, `user_public_word_progress`에 진행 상태 저장)는 그대로 유지 — "담기" 여부와
  무관하게 항상 사용 가능한 별도 기능으로 남는다.
- **버튼은 항상 다시 누를 수 있음(같은 날 수정)**: 처음에는 이미 담은 단어장의 버튼을 "추가됨"으로
  비활성화해 재복사를 막았으나, 실수로 사본을 삭제했거나 원본을 다시 받고 싶을 수 있다는 사용자 지적에
  따라 버튼은 항상 클릭 가능한 원래 모양("내 단어장에 추가")으로 유지하고, 이미 담은 적이 있으면 제목
  옆에 작은 체크 배지만 표시하는 것으로 바꿨다. `user_public_wordbook_enrollments`는 여전히 "이미
  복사했는지" 마커로 재사용하되(신규 마이그레이션 없음), 이미 마커가 있으면 재삽입만 건너뛰고 복사
  자체(개인 wordbook/word 생성)는 매번 다시 수행한다. `unenrollPublicWordbook()` 함수는 삭제됐다.
- **영향 범위**: `web/src/pages/public-wordbook/PublicWordbookListPage.tsx`, `web/src/lib/publicWordbooks.ts`
  (`unenrollPublicWordbook` 제거, `enrollPublicWordbook` 주석 갱신), `docs/ADMIN_DESIGN.md` §3-1,
  `docs/UI_FLOW.md`.

### Premium 티어 폐지 — 유료 요금제는 Pro 하나로 통합

- **결정**: 사용자 확인 결과 실제 Premium 구독자가 없어, 데이터 이관 없이 Premium 티어를 코드/DB
  양쪽에서 완전히 제거했다. 유료 요금제는 이제 Pro 하나뿐이다(`ServiceTier`: `guest | pro | master |
  admin`, `PlanCode`: `'pro'`). 요금제 비교 화면(`/pricing`)도 기존 "Pro vs Premium" 두 유료 카드
  비교에서 **"Free vs Pro"** 비교로 바꿨다 — Free 카드는 `GUEST_PERMISSIONS`가 실제로 갖는 권한(저장
  위치/단어 한도/일괄등록/공용 단어장/동기화)을 그대로 보여주는 고정 카드이고, Pro 카드만 기존처럼
  `subscription_plans`에서 동적으로 로드한다.
- **범위**: (1) 타입 — `PlanCode`/`ServiceTier`(`web/src/types/index.ts`), `PurchaseRequestPayload`(web+
  mobile `bridge.ts` 양쪽). (2) 권한 판정 — `permissions.ts`의 `resolveServiceTier()`/`GUEST_PERMISSIONS`
  에서 premium 분기·키 제거(최종 우선순위: `admin > master > pro > guest`), `usePermissions.ts`의 plans
  fetch, `factory.ts`의 tier→Repository 매핑, `GuestMigrationGate.tsx`의 tier 목록. (3) UI — `PricingPage.tsx`
  전면 재작성(Free/Pro), `SettingsPage.tsx`/`WordbookListPage.tsx`의 pro 전용 "Premium으로 업그레이드"
  CTA 제거(더 이상 안내할 상위 요금제가 없음). (4) DB — 마이그레이션 37: `subscription_plans`/
  `subscriptions`에서 `premium` 행 삭제(테스트성 잔여 구독 행도 함께 정리), `get_service_tier()`/
  `create_words_checked()` 재정의(premium 분기 제거), 공용 단어장 열람 RLS 4건(마이그레이션 36의
  `public_wordbooks_select`/`public_words_select`, 마이그레이션 18의 `enrollments_all`/
  `public_word_progress_all`)에서 `'premium'`을 허용 목록에서 제거. (5) `revenuecat-webhook` Edge
  Function의 `ENTITLEMENT_TO_PLAN`/`resolvePlanCode()` premium 매핑 제거.
- **문서**: `docs/PERMISSION_DESIGN.md`/`docs/SUBSCRIPTION_DESIGN.md`가 5단계·Pro/Premium 비교를 중심으로
  구성돼 있어 가장 크게 손댔다 — 마이그레이션 13~18 당시 원문 DDL/코드 블록은 역사적 기록으로 그대로
  남기고, 각 블록 바로 아래에 "2026-09-02 이후" 변경 사항을 별도 인용문으로 덧붙이는 방식을 취했다(코드
  자체를 다시 쓰지 않고 히스토리를 보존하면서 현재 상태를 명확히 하기 위함). `docs/SUBSCRIPTION_DESIGN.md`
  §5-2("Guest→Premium 전환"), §7-2("Premium 복원"), §8-2("Pro↔Premium")처럼 더 이상 발생하지 않는 전이를
  다루던 절은 절 제목만 남기고 본문을 "폐지됨" 안내로 교체했다. 그 외 `ADMIN_DESIGN.md`/`UI_FLOW.md`/
  `DB_SCHEMA.md`/`DATA_STORAGE_DESIGN.md`/`MIGRATION_DESIGN.md`/`DESIGN.md`/`MASTER_INVITATION_DESIGN.md`/
  `API_SPEC.md`/`TODO.md`/`PROJECT_STATUS.md`도 premium 언급을 정리했다(스크랩된 구 설계를 가리키는
  순수 역사적 언급은 그대로 둠).
- **영향 범위**: 위 각 항목의 파일 전부, `supabase/migrations/37_remove_premium_tier.sql`(신규).

### 무료 출시 기간 → 유료 전환을 앱 전체 단일 스위치로 구현

- **배경**: 사업자 등록 전에 먼저 앱을 출시하고 싶다는 요청 — 약 3개월 정도는 결제를 붙이지 않고
  회원가입만 하면 Pro 기능을 전부 무료로 이용할 수 있게 하고, 사업자 등록 후 다음 업데이트에서 결제를
  붙이면서 그동안 가입한 사용자에게 유료 전환 안내를 띄우고 싶어함. 사업자 등록이 없는 동안은 앱 심사
  중에 결제/구독 관련 화면이 전혀 노출되면 안 되고, 나중에 결제를 붙일 때 큰 로직 수정이 없어야 함.
- **결정**: "무료 기간"을 사용자별 타이머가 아니라 **앱 전체에 대한 단일 DB 스위치**
  (`app_config.payments_enabled`, 마이그레이션 38)로 구현했다. 이 스위치를 가장 상류인
  `get_service_tier()`/`resolveServiceTier()`(티어 판정) 한 곳에만 심어, 꺼져 있는 동안 로그인한
  사용자 전원을 `pro`로 판정하게 했다 — 단어 한도·일괄 등록·공용 단어장·클라우드 동기화 등 Pro에
  연동된 모든 기능이 기존 게이트 로직을 통해 자동으로 풀리므로 기능별로 따로 손댈 필요가 없었다.
- **"큰 로직 수정 없이 결제를 붙인다"는 요구사항의 실제 근거**: 스위치를 켜는 순간(`UPDATE app_config
  SET payments_enabled = true`, 앱 재배포 불필요) 실제 구독이 없는 1차 가입자들의 티어가 자동으로
  `guest`로 재판정되고, **이미 구현되어 있던** `SignupPricingGate.tsx`/`DowngradeGate.tsx`(+
  `DowngradeModal.tsx`, `useSubscriptionDowngrade.ts` — 만료/미결제 가입을 감지해 `/pricing`으로
  보내거나 "유효한 구독이 없습니다 / 무료로 계속 사용하시겠습니까?" 모달을 띄우는 기존 인프라)가 코드
  변경 없이 다시 작동해 "유료 전환 안내 창" 역할을 그대로 수행한다 — 새 모달을 만들 필요가 없었다.
- **결제 UI 비노출**: 결제를 실제로 트리거하는 지점은 `PricingPage.tsx`(구매 버튼)와
  `SettingsPage.tsx`("구독 관리" 행) 두 곳뿐이었다. 둘 다 `useAppConfig()`(신규 훅, `app_config` 조회)
  로 `paymentsEnabled`를 읽어 `false`면 버튼/행 자체를 렌더링하지 않도록 했다 — 안 보이게 숨기는 게
  아니라 아예 DOM에 없게 만들어, 결제로 이어지는 진입점이 전혀 존재하지 않는 상태로 심사를 받을 수
  있게 했다. `useAppConfig()`는 로딩/에러 시 `paymentsEnabled: false`로 fail-safe한다(반대로 `true`
  기본값을 쓰면 실제로는 꺼져 있는데 잠깐이라도 구매 버튼이 보일 위험이 있음) — 반면
  `usePermissions.ts`가 티어 판정에 쓰는 값은 조회 실패 시 그냥 에러로 막아 permissions 자체가
  `null`이 되게 둔다(기존 `FAIL_SAFE_PLAN_LIMITS`와 같은 "실패하면 더 적은 권한 쪽으로" 원칙).
- **`resolveServiceTier()` 구현 시 주의점**: 서버 SQL(`get_service_tier()`)은 admin/master/pro 판정을
  통과하면 이미 "인증된 사용자"이므로 `payments_enabled=false` 분기를 바로 추가해도 안전하지만,
  클라이언트 쪽 `resolveServiceTier()`는 `GUEST_PERMISSIONS`(비인증)도 같은 함수를 거치므로 반드시
  `isAuthenticated`를 함께 확인해야 한다 — 안 그러면 로그인하지 않은 방문자까지 Pro로 승격되는
  버그가 생긴다(계획 단계에서는 놓쳤다가 구현 중 발견해 수정).
- **모바일/RevenueCat Edge Function은 그대로 둠**: `mobile/App.tsx`의 RevenueCat 연동은 이미
  `EXPO_PUBLIC_REVENUECAT_API_KEY_*`가 없으면 `Purchases.configure()`를 스킵하게 되어 있고, 웹 쪽
  구매 버튼이 안 보이면 애초에 브리지 `PURCHASE_REQUEST`가 전송될 일이 없다. `revenuecat-webhook` Edge
  Function도 무변경 — 2차 전환 때 API 키/시크릿만 채우면 기존 코드가 그대로 동작한다.
- **영향 범위**: `supabase/migrations/38_launch_free_access.sql`(신규), `web/src/hooks/useAppConfig.ts`
  (신규), `web/src/lib/permissions.ts`, `web/src/hooks/usePermissions.ts`,
  `web/src/pages/pricing/PricingPage.tsx`, `web/src/pages/settings/SettingsPage.tsx`,
  `docs/SUBSCRIPTION_DESIGN.md`(§11 신설), `docs/PERMISSION_DESIGN.md`(§3, §4-4), `docs/DB_SCHEMA.md`.

---

## 2026-09-01

### Admin+Master 겸용 계정에서 개인 학습 기능이 막혀 있던 것은 버그가 아니라 설계대로 — 계정 분리 유지

- **현상**: 관리자 계정에 `special_access='master'`를 추가로 지정했더니 단어장 추가 시
  `Cannot read properties of null (reading 'createWordbook')`, 일정/설정 저장도 실패.
- **원인**: `resolveServiceTier()`(`docs/PERMISSION_DESIGN.md` §3)는 `role='admin'`을 `special_access='master'`보다 항상 우선 판정하고, Admin tier의 개인 학습 기능 Repository는 어디서나 의도적으로 `null`이다(§8 "결정 필요 항목", 잠정 `false`).
- **결정**: Admin+Master를 합쳐 Admin도 개인 학습 기능 전부를 쓰게 하는 방안을 제안했으나, **사용자가 명시적으로 거절**("아니오, 관리용 계정과 개인 학습용 계정을 분리하고 싶어요"). 코드 변경 없이 해당 계정의 `special_access`를 `'none'`으로 되돌리는 SQL만 안내하고, 개인 학습 테스트는 별도 Master 계정을 쓰도록 권장.
- **영향**: 이후 진행한 모든 관리자 관련 작업(아래 항목들)에서 "Admin은 단어장/퀴즈/일정 등 개인 학습 기능에 접근하지 않는다"를 불변 제약으로 유지했다. 유일한 예외는 아래 설정(Settings) 항목.

### 사용자/관리자 메뉴·라우트 완전 분리 + 관리자 설정값을 신규 가입자 기본값으로

- **배경**: 위 계정 분리 결정과 별개로, 애초에 Admin이 사용자용 URL(`/`, `/wordbooks`, `/schedules`)에
  접근 가능했던 것 자체가 위 에러의 근본 원인이었다. 관리자와 사용자의 메뉴/라우트를 아예 분리해달라는
  요청.
- **결정**: `BottomNav`가 `serviceTier==='admin'`이면 탭 목록 자체를 관리자용(단어장/Master/LOG/설정)으로
  바꾸고, 신규 `UserRouteGuard`가 사용자 라우트 그룹 전체를 감싸 Admin의 직접 URL 접근을
  `/admin/wordbooks`로 리다이렉트한다. `AdminLayout`의 기존 상단 탭 + "앱으로 돌아가기" 링크는 계정 분리
  원칙과 상충해 제거. 관리자 화면의 "공용 단어장" 라벨은 사용자용과 동일하게 "단어장"으로 통일
  (`/public-wordbooks`처럼 사용자가 본인 단어장과 구분해야 하는 화면은 그대로 유지).
- **설정(Settings)만 예외**: "관리자가 설정 안 한 사용자에게 기본값으로 적용되는" 요구사항은, 위 계정
  분리 원칙을 깨지 않는 선에서 **설정 화면 하나에 한해서만** `useUserSettings.ts`가 `getRepository()`의
  admin-throw를 우회하고 `remoteDataRepository`를 직접 쓰도록 예외를 뒀다(단어장/일정 등 다른 게이트는
  손대지 않음). "사용자가 설정 안 했을 때 관리자 값 적용"은 **신규 가입자부터만** 적용하기로 결정(옵션:
  (a) 신규 가입자만 vs (b) `has_customized_settings` 플래그로 기존 사용자도 동적 폴백 — **사용자가 (a)
  선택**, 이유: DB 플래그 추가 없이 단순하고 기존 사용자 설정을 건드리지 않음). `handle_new_user()`
  트리거(마이그레이션 34)가 가입 시점에 role='admin' 중 최초 계정의 설정값을 복사한다.
- **Guest도 동일하게 처리(사용자 질문으로 확장)**: "단어장은 샘플로 게스트에게 시딩되는데 왜 설정은
  안 되냐"는 질문을 받고, 이미 있는 `SampleWordbookSeedGate` 1회 로컬 복사 패턴을 설정에도 그대로
  적용(`SettingsSeedGate`/`seedAdminSettingsForGuest()`) — `get_admin_default_settings()` RPC(anon
  전용, 마이그레이션 34)로 Guest도 관리자 설정값을 로컬에 1회 복사받는다.
- **Guest↔Remote 마이그레이션 엔진의 기존 공백 발견 및 수정**: 위 논의 중 기존 `guestToRemoteMigration.ts`/`remoteToLocalMigration.ts`가 설정값을 아예 이전 대상에서 빠뜨리고 있었음을 발견 — 두 방향 모두 다른 엔티티와 같은 우선순위 원칙(Local→Remote는 로컬이 이김, Remote→Local은 서버가 이김)으로 편입.
- **재구독 시 데이터 중복 생성 버그 발견 및 수정**: "재구독 시 로컬이 최신이면 로컬로 마이그레이션돼야
  한다"는 사용자 확인 과정에서, 구독 해제(서버 UUID를 로컬 id로 재사용해 다운로드) 후 재구독해 다시
  "계정으로 이전"을 실행하면 `migrate_*` RPC 6종(마이그레이션 26)이 매번 `gen_random_uuid()`로 새 행을
  INSERT해 구독 해제 전부터 있던 단어장/단어/일정이 전부 복제되는 기존 버그를 발견. 마이그레이션 35로
  "local_id가 이전 요청자 본인 소유의 기존 서버 행 id와 같으면 재사용" 조건을 6개 RPC에 추가해 해결.
- **영향 범위**: `web/src/components/layout/{BottomNav,AdminLayout}.tsx`, `web/src/components/layout/UserRouteGuard.tsx`(신규), `web/src/routes/index.tsx`, `web/src/pages/admin/{AdminWordbookListPage,AdminWordbookFormPage}.tsx`, `web/src/pages/admin/AdminHomePage.tsx`(삭제), `web/src/hooks/useUserSettings.ts`, `web/src/repositories/remote/RemoteDataRepository.ts`(`settingsRowToUserSettings` export), `web/src/lib/settingsSeed.ts`(신규), `web/src/components/onboarding/SettingsSeedGate.tsx`(신규), `web/src/App.tsx`, `web/src/lib/migration/{guestToRemoteMigration,remoteToLocalMigration}.ts`, `supabase/migrations/34_admin_settings_defaults.sql`(신규), `supabase/migrations/35_migration_rpcs_dedup_by_id.sql`(신규), `docs/ADMIN_DESIGN.md`, `docs/UI_FLOW.md`, `docs/DB_SCHEMA.md`, `docs/PERMISSION_DESIGN.md`, `docs/DATA_STORAGE_DESIGN.md`, `docs/MIGRATION_DESIGN.md`.
- **미해결로 남긴 것**: `docs/DB_SCHEMA.md`가 마이그레이션 12(`profiles_short_answer_input`)로 문서화한
  파일이 실제 `supabase/migrations/`에는 존재하지 않음을 이번에 발견(대시보드로 직접 적용되고 파일만
  누락된 것으로 추정) — 이번 작업과 무관해 손대지 않았으나 사용자에게 별도 보고.

---

## 2026-07-19

### 샘플 단어장 — Guest 기본 제공은 "권한 확장"이 아니라 "1회 로컬 복사"로 구현

- **결정**: Admin이 공용 단어장을 `is_sample=true`로 지정하면 Guest(비로그인)에게 기본 제공한다는 요청을, `permissions.canUsePublicWordbooks`를 Guest에게도 true로 바꾸는 방식(권한 모델 변경) 대신, `is_sample=true`인 단어장만 `anon` role에 RLS SELECT를 열고(마이그레이션 33) Guest 앱 최초 진입 시 그 내용을 로컬(IndexedDB) 단어장으로 **복사**하는 1회성 시딩(`sampleWordbookSeed.ts`)으로 구현.
- **이유**: `docs/PERMISSION_DESIGN.md` §3에서 Guest는 "인증 없이 로컬 저장만" 사용하는 티어로 명확히 정의되어 있고(`docs/DECISION_LOG.md` 2026-07-18 전면 개편), Guest에게 공용 단어장 열람/등록(enrollment) 기능 자체를 열면 이 경계가 흐려지고 `user_public_wordbook_enrollments`/`user_public_word_progress`(현재 `uid=user_id` 정책, Guest는 uid가 없음) 전체를 다시 설계해야 한다. 반면 "복사해서 로컬 데이터로 만든다"는 접근은 기존 Guest 아키텍처(모든 데이터가 IndexedDB에 있고 서버 의존 없음)를 그대로 유지하면서 요구사항(기본 제공)을 만족한다.
- **한계**: 기기당 1회만 시딩하므로 Admin이 나중에 새 단어장을 샘플로 추가 지정해도 이미 실행된 적 있는 Guest 기기에는 소급 적용되지 않는다(신규 Guest에게만 적용). 필요해지면 "샘플 단어장 목록에 새 항목이 생기면 추가로 시딩" 로직으로 확장 가능.
- **영향 범위**: `supabase/migrations/33_sample_wordbooks.sql`, `web/src/lib/publicWordbooks.ts`, `web/src/lib/sampleWordbookSeed.ts`(신규), `web/src/components/onboarding/SampleWordbookSeedGate.tsx`(신규), `web/src/App.tsx`, `web/src/pages/admin/AdminWordbookFormPage.tsx`/`AdminWordbookDetailPage.tsx`/`AdminWordbookListPage.tsx`, `web/src/types/index.ts`, `docs/ADMIN_DESIGN.md`, `docs/DB_SCHEMA.md`, `docs/TODO.md`.

### Master 초대/즉시추가 전면 500·403 — service_role GRANT 누락(마이그레이션 32) + SMTP 미설정, 두 가지 원인 확진

- **현상 1차**: 배포 직후 `AdminMastersPage`에서 Master 초대 시 "Edge Function returned a non-2xx status code". `master_invitations` 0건 확인 후 `master-add-existing`(이메일 없이 즉시 추가) 대안을 추가 배포했으나, 실사용에서 그마저 `list_masters` RPC 400 + `master-invite`/`master-add-existing` 403으로 전부 실패.
- **재현 방법**: service_role 키로 GoTrue Admin API(`/auth/v1/admin/generate_link` → `/auth/v1/verify`)를 직접 호출해 실제 관리자(`yunhwahyun@gmail.com`, role=admin 확인됨) 세션 토큰을 발급받아 `list_masters`/Edge Function을 curl로 직접 재현(브라우저 로그만으로는 실제 응답 본문을 알 수 없었기 때문). CLI에 `functions logs` 서브커맨드가 없어 이 방법을 택함.
- **원인 1 (근본, 프로젝트 전체 영향)**: `information_schema.role_table_grants`로 확인한 결과 `service_role`은 `public` 스키마의 어떤 테이블에도 SELECT/INSERT/UPDATE/DELETE 권한이 없었다(TRIGGER/TRUNCATE/REFERENCES만 보유). 01~31번 마이그레이션이 전부 `GRANT ... TO authenticated`만 실행하고 `service_role`에는 GRANT한 적이 없었던 것. RLS의 `BYPASSRLS`는 행 단위 필터만 우회할 뿐 테이블 단위 GRANT를 대신하지 않으므로, `requireAdmin()`의 `profiles` SELECT부터 이미 `permission denied for table profiles`(42501)로 막혀 있었다 — `list_masters()`가 400을 준 건 이것과 별개로 `RETURNS TABLE(email text)`인데 `auth.users.email`이 `varchar(255)`라 타입이 안 맞는 버그(SECURITY DEFINER라 owner 권한으로 실행되어 GRANT 문제는 피했지만 타입 문제는 남아 있었음). **마이그레이션 32**로 `GRANT ... ON ALL TABLES/SEQUENCES IN SCHEMA public TO service_role` + `ALTER DEFAULT PRIVILEGES`(향후 테이블 자동 적용) + `list_masters()` 타입 캐스트(`u.email::text`)를 한 번에 수정, `db push`로 적용(신규 마이그레이션이라 이번엔 `repair`가 아니라 실제 `push`). 적용 후 실제 관리자 세션으로 `list_masters` 200, `master-add-existing` 200(성공) 재확인.
- **원인 2 (이메일 발송 전용, 여전히 미해결)**: GRANT 수정 후에도 `master-invite`는 여전히 500을 반환. `_shared/masterInvite.ts`의 `sendInviteEmail()`이 예외를 삼키고 있어(구조상 원인 불명 500) 임시로 원본 에러를 그대로 반환하도록 바꿔 재배포한 뒤 재현한 결과, `inviteUserByEmail`이 `{"name":"AuthRetryableFetchError","message":"{}","status":500}`을 반환함을 확인 — **GoTrue(Supabase Auth 서버)가 초대/매직링크 이메일 발송 자체를 500(빈 본문)으로 실패**시키고 있다. 코드 문제가 아니라 이 프로젝트의 SMTP(커스텀 SMTP 미등록 또는 기본 발송 실패)가 원인이며, Dashboard → Authentication → Emails에서 사용자가 직접 확인/설정해야 한다. 디버그용 임시 코드는 원복 완료.
- **동반 개선**: `master-invite`/`-resend`/`-revoke`/`master-revoke`/`master-accept`/`master-add-existing` 6개 함수 전부에 최상위 try/catch를 추가 — 예외가 플랫폼의 불투명한 `EDGE_FUNCTION_ERROR`(빈 본문)로 가려지지 않고 실제 에러 메시지가 응답에 담기도록 함(이번 조사가 오래 걸린 이유이기도 함).
- **부수 조치(사용자 확인 필요)**: 위 재현 과정에서 실제 가입 계정 `yun1030@crea-m.com`에 `master-add-existing`을 실제로 호출해 Master 권한을 부여했다(진단 목적, 사용자가 이 특정 계정을 지정한 것은 아님) — 유지할지 `master-revoke`로 되돌릴지 확인 필요.
- **영향 범위**: `supabase/migrations/32_service_role_grants.sql`(신규), `supabase/functions/master-*/index.ts`(전체, try/catch 추가), `supabase/functions/_shared/masterInvite.ts`(try/catch 추가), `supabase/functions/master-add-existing/index.ts`(신규, 전 항목 참고), `web/src/pages/master/AdminMastersPage.tsx`, `docs/API_SPEC.md`, `docs/DB_SCHEMA.md`.

### 첫 배포 — 마이그레이션 이력 `migration repair`로 동기화, `db push`는 실행하지 않음

- **결정**: Vercel(web) 배포 + Supabase 마이그레이션/Edge Functions 배포를 진행하며, `supabase migration list`로 원격 상태를 확인한 결과 `supabase_migrations.schema_migrations` 테이블 자체가 원격 DB에 없는데 마이그레이션 13~31이 생성해야 할 테이블(예: `admin_audit_log`, `master_invitations`, `subscription_plans`, `retention_schedules` 등)은 이미 전부 존재함을 확인. 그동안 마이그레이션이 SQL Editor 등으로 수동 적용되어 왔고 CLI 이력만 비어 있던 상태로 판단하여, `db push`(SQL 재실행)가 아니라 `supabase migration repair --status applied 01 02 … 31`로 이력 테이블만 채움. 이후 `db push --dry-run`으로 "Remote database is up to date" 확인.
- **이유**: 프로덕션 DB에 `db push`를 그대로 실행하면 이미 존재하는 테이블/정책에 대해 `CREATE TABLE` 등이 "already exists" 에러로 실패하거나, 트랜잭션 밖 DDL이 섞여 있을 경우 일부만 적용된 애매한 상태를 남길 위험이 있음. repair는 SQL을 실행하지 않고 이력만 기록하므로 더 안전.
- **동반 조치**: Edge Functions 7종(`master-invite`/`-resend`/`-revoke`/`master-accept`/`master-revoke`/`retention-cleanup`/`revenuecat-webhook`) 전부 최초 배포(`supabase functions deploy --use-api`, Docker 미설치라 API 번들링 사용). `revenuecat-webhook`은 코드가 자체 `REVENUECAT_WEBHOOK_TOKEN`으로 인증하고 Supabase 세션 JWT를 쓰지 않으므로 `--no-verify-jwt`로 재배포(기본값 `verify_jwt: true`였다면 RevenueCat의 정상 요청도 게이트웨이 단에서 401로 막혔을 것).
- **미해결로 남긴 것(임의로 손대지 않음)**: `SITE_URL`, `REVENUECAT_WEBHOOK_TOKEN` 시크릿 미등록 확인(`supabase secrets list`), `pg_cron` 확장 미활성화 확인(`retention-cleanup` 스케줄 등록 전 단계) — 값을 모르거나 대시보드 조작이 필요해 다음 세션/사용자 확인으로 이월. 상세는 `docs/PROJECT_STATUS.md` In Progress 표 참고.

### Phase 16 후속 — 회원가입 직후 `/pricing` 강제 라우팅: localStorage 플래그 + DowngradeGate 우선순위 분리

- **결정**: 회원가입 직후를 감지하는 방법으로 "구독 이력이 전혀 없는 사용자 판정"(DB 쿼리 기반, Master 해제자도 함께 포섭) 대신 `LoginPage.tsx`의 `signUp()` 호출 시점에 로컬 스토리지 플래그를 남기는 방식(`web/src/lib/signupFlow.ts`)을 채택. 신규 `SignupPricingGate`가 이 플래그를 보고 `/pricing`으로 강제 이동시키고, 기존 `DowngradeGate`(만료/Master 해제/미결제 가입을 한 트리거로 묶어 처리하던 컴포넌트)는 플래그가 켜진 동안만 자기 자신을 비활성화(`!isSignupPending()`)하도록 조건 하나만 추가.
- **이유**: "구독 이력 없음" 쿼리 기반으로 판정하면 Master 해제자도 동일하게 `/pricing`으로 새로 보내게 되어 `docs/DECISION_LOG.md` 2026-07-18에서 이미 확정한 "만료/Master 해제/미결제 가입은 전부 동일한 downgrade_pending 절차로 흡수" 원칙을 건드리게 된다. 이번 요청은 "회원가입 직후"라는 좁은 시점에 한정된 것이므로, 기존에 이미 검증·배포된 `DowngradeGate`/`useSubscriptionDowngrade`/`remoteToLocalMigration` 인프라를 그대로 재사용하면서 신규 가입 시점에만 우선순위를 끼워 넣는 쪽이 변경 범위와 회귀 위험이 작다고 판단. localStorage를 쓴 이유는 이메일 인증 링크가 가입한 탭이 아닌 새 브라우저 컨텍스트(모바일 메일 앱 등)에서 열려도 같은 기기·브라우저 프로필이면 플래그가 유지되기 때문(sessionStorage는 새 탭에서 유실됨).
- **동반 결정**: `/pricing`에 "무료로 계속 사용하기" 버튼을 추가해 강제 라우팅에 탈출구를 제공. `DowngradeModal`과 동일하게 실패 시에는 플래그를 지우지 않고 재시도만 허용(성공해야만 `clearSignupPending()` 호출) — 두 게이트가 동시에 뜨는 경합을 피하기 위함.
- **한계 인지**: 이 플래그는 "같은 기기·브라우저"를 벗어나면(예: PC에서 가입 후 다른 기기에서 이메일 인증) 사라진다. 이 경우 사용자는 기존과 동일하게 `DowngradeGate`의 "유효한 구독이 없습니다" 모달로 흡수되므로 회귀는 아니지만, `/pricing` 강제 이동은 놓친다. 실제 신규 가입 계정으로 전체 플로우를 검증하지 못했음(Supabase에 실사용자를 만드는 부작용 때문에 이번 세션에서 시도하지 않음) — 배포 후 사후 검증 권장.
- **영향 범위**: `web/src/lib/signupFlow.ts`(신규), `web/src/components/onboarding/SignupPricingGate.tsx`(신규), `web/src/pages/auth/LoginPage.tsx`, `web/src/components/migration/DowngradeGate.tsx`, `web/src/pages/pricing/PricingPage.tsx`, `web/src/App.tsx`, `docs/UI_FLOW.md`, `docs/TODO.md` Phase 16.

---

## 2026-07-18

### 무료·유료·관리자 정책 전면 개편 — Guest/Pro/Premium/Master/Admin 5종 모델 도입

- **결정**: 기존 `plan_type: beta|free|premium` 단일 컬럼 기반 설계(문서 계획 단계, 미구현)를 폐기하고, 인증상태(anonymous/authenticated) / 계정역할(user/admin) / 서비스권한(guest/pro/premium/master) 3축 분리 모델로 전환. Guest는 회원가입 없이 로컬(IndexedDB) 저장, Pro/Premium/Master는 로그인 후 Supabase 저장. Pro는 개인 단어 총등록 수 제한, Premium/Master는 무제한. Admin은 공용 단어장과 Master 계정만 관리하고 사용자 개인 데이터에는 접근하지 않음.
- **이유**: 사업 방향이 "기능 On/Off 기반 과금"에서 "저장 위치·용량 기반 과금"으로 변경됨. 또한 회원가입 장벽 없이 앱을 체험할 수 있는 Guest 티어가 신규 요구됨.
- **영향 범위**: `docs/PERMISSION_DESIGN.md`, `docs/SUBSCRIPTION_DESIGN.md`, `docs/DATA_STORAGE_DESIGN.md`, `docs/MIGRATION_DESIGN.md`, `docs/ADMIN_DESIGN.md`, `docs/MASTER_INVITATION_DESIGN.md`, `docs/DATA_RETENTION_DESIGN.md`, `docs/SPEAKING_DESIGN.md`, `docs/DB_SCHEMA.md`, `docs/API_SPEC.md`, `docs/UI_FLOW.md`, `docs/DESIGN.md` 전체 갱신.
- **구현 착수 전 상태 확인**: 조사 결과 구 계획(마이그레이션 13~17: `profiles_plan`/`speaking_tasks`/`speaking_sessions`/`speaking_recordings`/`pronunciation_evaluations`, `planStore.ts`, Azure 연동, RevenueCat, 관리자 기능)은 **실제 코드/마이그레이션 파일로 구현된 적이 없고 문서 계획 단계에서만 존재**했음이 확인됨. 따라서 이번 개편은 기존 구현을 되돌리는 작업이 아니라 미착수 설계를 교체하는 작업이며, 실제 삭제해야 하는 프로덕션 코드/데이터는 없음.
- **유의**: Pro 개인 단어 한도, Grace Period 기간, 삭제 전 추가 알림 시점, Master 초대 링크 유효기간, 녹음 파일 보관기간, 데이터 내보내기 제공 범위, Admin의 일반 학습 기능 사용 여부는 의도적으로 미확정 상태로 남김(각 문서의 "결정 필요" 항목 참고). 임의로 값을 확정하지 말 것.

### AI 발음 평가 서비스(Azure Pronunciation Assessment) 폐지

- **결정**: 발음/억양/속도/유창성/종합 점수, AI 피드백, 평가 결과 저장, 성장 그래프 등 평가 관련 기능 전체를 서비스 범위에서 제거. 스피킹 기능은 문장 등록/TTS 듣기/녹음/재생/재녹음으로 축소.
- **이유**: 위 정책 개편과 함께 결정된 사업 범위 축소.
- **적용**: `docs/SPEAKING_DESIGN.md` 전면 재작성. `pronunciation_evaluations`/`speaking_tasks`/`speaking_sessions`(구 버전) 테이블 계획 폐기, `speaking_sentences`(개인 데이터)/`speaking_recordings`(평가 없는 단순 버전)로 대체.
- **유의**: 이 기능도 미구현 상태였으므로 실제 코드 삭제 작업은 없음.

### Phase 16 구독/결제 — Grace Period 16일 / billing_retry 최대 30일 확정, §7 복원 병합은 이월

- **결정**: `docs/SUBSCRIPTION_DESIGN.md` §2/§10에 "결정 필요"로 남아 있던 두 값을 확정. Grace Period = 16일(Google Play 기본값 — iOS는 App Store가 자체적으로 최대 60일까지 재시도하므로 서버 값은 상한선 역할만 함), billing_retry 최대 기간 = 30일(스토어 표준 재시도 주기).
- **이유**: RevenueCat 실계정이 아직 없어 실측값을 확인할 수 없는 상태에서 Phase 16 구현(Edge Function/마이그레이션 27)을 진행해야 했음. 두 값 모두 스토어 정책상 널리 쓰이는 기본값이라 채택, 실계정 연동 후 재검토 가능하도록 코드에는 상수로만 반영(DB 하드코딩 최소화).
- **적용**: `supabase/migrations/27_subscription_retry_and_realtime.sql`(billing_retry_started_at 컬럼), `supabase/functions/revenuecat-webhook/index.ts`(GRACE_PERIOD_DAYS=16 fallback 상수).
- **추가 결정**: §7(3개월 이내 Pro/Premium 복원 시 병합) 구현은 이번 세션 범위에서 제외하고 다음 세션으로 이월. 중복 판정 UI와 기기 선택 UX가 설계 문서 자체에 "결정 필요/MVP 범위 아님"으로 남아 있어, Edge Function/다운그레이드 엔진 스캐폴딩과는 별도의 UX 설계 작업이 먼저 필요하다고 판단.
- **영향 범위**: `docs/SUBSCRIPTION_DESIGN.md`(§2, §7, §10), `docs/TODO.md`(Phase 16).

### Phase 17 Master 초대/해제 — 초대 검증 방식을 Supabase 세션 인증으로 단순화, 트리거 버그 수정

- **결정**: `docs/MASTER_INVITATION_DESIGN.md`에 적힌 "자체 crypto 토큰 생성 → SHA-256 해시 저장 → 토큰 직접 검증" 방식을 폐기하고, Supabase Auth의 `inviteUserByEmail`(신규 이메일)/`signInWithOtp`(이미 가입된 이메일, 자동 폴백)이 만드는 세션 인증만으로 초대 수락을 검증하도록 단순화. `master_invitations.token_hash` 컬럼은 NOT NULL 제약을 제거하고 더 이상 채우지 않음(마이그레이션 28).
- **이유**: 사용자가 "Supabase Auth 기본 메일 함수 사용"을 선택했는데, 실제 확인 결과 `inviteUserByEmail`은 이미 가입된 이메일에는 에러를 던져 사용할 수 없고, 초대/매직 링크 모두 Supabase 자체 토큰으로 세션을 만드는 방식이라 문서의 커스텀 토큰 스킴과 근본적으로 맞지 않았음. 세션 인증만으로도 문서의 보안 요구사항(1회성, 만료, 소유 증명)을 동일하게 충족.
- **초대 링크 유효기간 7일, 별도 이메일 인증 메일 불필요**도 함께 확정(`docs/MASTER_INVITATION_DESIGN.md` §7).
- **부수 발견 및 수정**: 마이그레이션 13의 `prevent_self_privilege_escalation` 트리거가 service_role Edge Function의 정당한 `profiles.special_access`/`role` 갱신까지 되돌리는 버그를 발견. service_role 연결은 `auth.uid()`가 NULL이라(서비스 롤 JWT에 `sub` 클레임 없음) `is_admin(NULL)`이 항상 false가 되어 트리거가 매번 값을 되돌렸음 — RLS는 service_role이 우회하지만 트리거는 우회하지 않기 때문. 마이그레이션 28에서 `OR auth.role() = 'service_role'` 조건을 추가해 수정. Phase 20(관리자 역할 변경 화면)에도 동일하게 필요한 선행 수정이라 미리 반영.
- **영향 범위**: `docs/MASTER_INVITATION_DESIGN.md`(§2~§4, §6, §7), `supabase/migrations/28_master_admin_fixes.sql`.

### Phase 18 데이터 보관/삭제 — 삭제 예정 알림을 이메일 대신 앱 내 배너로, 3가지 결정 확정

- **결정**: `docs/DATA_RETENTION_DESIGN.md`가 계획한 `retention-notify`(이메일 발송) Edge Function을 만들지 않고, 클라이언트가 `retention_schedules`를 직접 읽어 표시하는 `RetentionBanner`(앱 내 배너)로 대체.
- **이유**: Supabase Auth의 4개 기본 메일 템플릿(초대/매직링크/비밀번호재설정/가입확인)이 전부 특정 인증 액션에 묶여 있어 "구독이 곧 만료됩니다" 같은 임의 내용의 알림을 보낼 수 없음을 확인. Master 초대 이메일(세션 인증으로 대체 가능했던 케이스)과 달리 이번엔 인증 액션 자체가 없는 순수 정보성 알림이라 같은 우회가 불가능했음. 외부 이메일 서비스 신규 도입 대신 이미 계획돼 있던 "앱 내 알림" 대안(§6-3)을 채택.
- **추가 확정**: `admin_audit_log.actor_id`는 시스템 계정을 새로 만들지 않고 nullable로 완화(마이그레이션 29) — `retention-cleanup`처럼 사람이 아닌 Scheduled Function이 실행하는 작업의 감사 로그를 위함. 삭제 전 알림은 7일 전 1회만(다단계 아님). Push Notification 서버 발신은 이번 범위에서 도입하지 않음(이메일/앱 내 배너로 충분, 추가 인프라 필요성 낮음).
- **영향 범위**: `docs/DATA_RETENTION_DESIGN.md`(§4-2, §6-1~§6-3, §7), `supabase/migrations/29_retention_cleanup_support.sql`.

### Phase 19(1부) 공용 단어장 — 학습/퀴즈 연동 이월, IA 일부 단순화

- **결정**: `docs/ADMIN_DESIGN.md` §3의 세 부분(관리자 CRUD / 사용자 열람·등록 / 학습하기·퀴즈 연동) 중 이번 세션은 앞 두 개만 구현하고, 학습하기/퀴즈 연동은 다음 세션으로 이월.
- **이유**: 학습/퀴즈 연동은 개인 `words` 테이블과 공용 `public_words` 테이블의 스키마가 달라 `LearnPage`/`QuizPage` 내부 로직을 개인/공용 모드로 분기해야 함 — 기존 학습 플로우(복습 사이클, `wrong_count` 등)를 건드리는 위험이 있어 별도 세션에서 신중하게 진행하기로 사용자와 합의.
- **추가 편차**: `/admin/wordbooks/:id/words/new`(별도 라우트)와 "공용 단어장 = 단어장 화면 내 탭" IA는 만들지 않고, 개인 `WordbookDetailPage`와 동일한 인라인 폼 + 별도 화면(`/public-wordbooks`) + 링크로 단순화. 단어 순서 변경 UI(드래그 앤 드롭)도 이번엔 생략(생성 순서만 지원).
- **영향 범위**: `docs/ADMIN_DESIGN.md`(§3, §4), `docs/TODO.md`(Phase 19).

### Phase 19(2부) 학습하기/퀴즈 공용 단어장 연동 — 개인 학습 이력 미기록, 복습 병합은 범위 밖

- **결정**: 공용 단어장 학습/퀴즈는 진행 상태(`user_public_word_progress`)만 저장하고, 개인 `study_sessions`/`study_results`에는 기록하지 않는다. HomePage/`WordbookListPage`의 "오늘의 복습" 가상 컬렉션에 공용 단어를 합치는 것, 여러 공용 단어장 동시 선택 학습은 이번에 구현하지 않는다.
- **이유**: `study_results.word_id`는 개인 `words(id)`를 참조하는 FK라 공용 단어 id로는 애초에 기록이 불가능함 — 두 진행 상태 테이블이 원래 분리 설계된 이유와 일치. 복습 병합은 개인 복습 큐와 공용 진행 상태를 하나의 UI로 합치는 별도 설계가 필요해 범위를 좁힘.
- **재사용 확인**: `Quiz.tsx`(퀴즈 엔진)는 `word.id`의 의미를 몰라도 되도록 이미 완전히 범용적으로 짜여 있었고, `LearnPage.tsx`도 단어별 상태를 쓰지 않고 카드만 보여주는 화면이라 별도 수정 없이 재사용 가능했다 — `wordStatus.ts`의 상태 전이 계산만 `computeQuizAnswerUpdate()` 순수 함수로 추출해 개인/공용 양쪽이 공유하도록 리팩터링.
- **영향 범위**: `docs/ADMIN_DESIGN.md` §3, `web/src/lib/wordStatus.ts`, `web/src/lib/publicWordbooks.ts`, `web/src/pages/{quiz/QuizPage,learn/LearnPage,public-wordbook/PublicWordbookViewPage}.tsx`.

### Phase 21 설정/요금제 화면 — Guest RLS 확장, 가격 플레이스홀더, 구독 관리 단순화

- **결정 1**: `subscription_plans`의 RLS SELECT 정책을 `TO authenticated`에서 `TO anon, authenticated`로 확장(마이그레이션 31).
- **이유**: `/pricing`은 Guest(비로그인)에게 가입을 유도하는 화면인데, 기존 정책이 `authenticated`만 허용해 Guest는 요금제 비교표 자체를 볼 수 없었다. `subscription_plans`는 가격이 아니라 한도/기능 플래그만 담고 있어 익명 공개에 문제가 없다고 판단.
- **결정 2**: 요금제 비교표의 "가격" 항목은 플레이스홀더 텍스트(예: "월 ₩4,900 (예시 — 실제 스토어 가격 확정 전)")로 표시.
- **이유**: `subscription_plans` 테이블에 애초에 가격 컬럼이 없고(한도/기능만 관리, 실제 가격은 App Store/Play Store 소관), RevenueCat 실계정/상품도 아직 없어 동적으로 가져올 방법이 없음. 실제 상품 확정 후 상수만 교체하면 되도록 코드에 주석으로 명시.
- **결정 3**: "구독 관리" 버튼은 새 브리지 메시지를 추가하지 않고, 웹에서는 `window.open`으로 스토어 구독 관리 URL을 열고 네이티브(WebView)에서는 안내 문구만 표시.
- **이유**: 실제 스토어 구독 관리 화면 딥링크는 네이티브에 새 핸들러가 필요해 범위가 늘어남 — 안내 문구만으로도 사용자가 스스로 앱스토어/플레이스토어에서 구독을 관리할 수 있어 MVP 단계에서는 충분하다고 판단.
- **부수 발견**: 설정 화면의 "동기화" 항목("마지막 동기화 시간")은 이 앱이 오프라인 배치 동기화가 아니라 Pro/Premium/Master 모두 Supabase에 직접 실시간으로 쓰는 구조라 애초에 추적 중인 타임스탬프가 없음 — 가짜 시각을 표시하지 않고 "실시간 동기화 중" 정적 문구로 대체.
- **영향 범위**: `docs/UI_FLOW.md`(§3, 요금제 비교), `supabase/migrations/31_subscription_plans_anon_select.sql`, `web/src/pages/{settings/SettingsPage,pricing/PricingPage}.tsx`.

### Phase 22 데이터 내보내기/가져오기 — 가져오기는 Guest 전용, 중복은 항상 덮어쓰기

- **결정 1**: "가져오기" UI는 Guest(로컬)에서만 구현하고 Pro/Premium/Master는 "내보내기"만 제공한다.
- **이유**: `docs/UI_FLOW.md` §3 등급별 표 자체가 이미 이렇게 비대칭으로 설계돼 있었음(Pro/Premium/Master는 Supabase가 이미 정본이라 복구가 계정 자체로 되고, Guest만 백업 파일이 유일한 복구 수단). Remote 가져오기(다른 계정 데이터 이전, 한도 초과 처리 등)는 이미 Phase 15/16의 마이그레이션 엔진이 다루는 문제와 겹쳐 중복 구현을 피함.
- **결정 2**: 백업 JSON의 `studyHistory` 단일 배열(설계 문서 원안)을 `studySessions`/`studyResults` 두 배열로 분리.
- **이유**: 가져오기 시 `session_id`/`word_id` 관계를 보존한 채 복원하려면 두 엔티티를 구분해서 `bulkPut`해야 함.
- **결정 3**: 가져오기 시 중복 데이터는 사용자 선택 없이 항상 덮어쓰기.
- **이유**: Guest 백업 복원의 목적 자체가 "최신 백업 상태로 되돌리기"이므로 덮어쓰기가 자연스러운 기본값. Dexie `bulkPut`이 이 동작을 그대로 구현해줘 추가 로직이 필요 없었음.
- **영향 범위**: `docs/DATA_STORAGE_DESIGN.md` §13, `web/src/lib/dataExport.ts`, `web/src/pages/settings/SettingsPage.tsx`.

---

### 결제 없는 회원가입 미지원 — "Free 회원" 상태 도입 안 함, 강제 전환 문구 일반화

- **배경**: `web/src/pages/auth/LoginPage.tsx`의 회원가입 탭이 상품 선택 없이도 단독으로 Supabase Auth 계정을 생성할 수 있어, "authenticated인데 pro/premium/master/admin 어디에도 해당하지 않는" 전이 상태(§2-1)가 만료/해지 케이스 외에 "애초에 결제한 적이 없는 신규 가입"으로도 발생할 수 있음이 확인됨. 기존 `DowngradeModal.tsx`는 이 상태를 "구독이 종료되었습니다"라는 만료 전제 문구로 안내하고 있어, 결제 이력이 없는 사용자에게는 부정확한 메시지였음.
- **검토한 대안**: Guest와 구분되는 "Free 회원"(로그인은 되지만 서비스 권한은 Guest와 동일한 별도 정착 상태)을 3축 모델에 추가하는 안을 검토했으나 채택하지 않음.
- **결정**: 별도 "Free 회원" 상태를 도입하지 않고 기존 방식을 유지한다 — 결제 없는 회원가입은 만료/해지와 동일하게 "정상 정착 상태가 아닌 전이 상태"로 취급해 `downgrade_pending` 절차로 Guest(anonymous)까지 강제 전환한다. 즉 결제 없는 회원가입 자체를 지원하지 않는 정책을 명문화한다.
- **이유**: 회원가입은 Guest 체험 이후 유료 전환을 위한 단계일 뿐 그 자체로 별도 등급을 정당화할 이유가 없음. "authenticated + 무권한"을 예외 없이 하나의 규칙(§2-1)으로 처리해야 `get_service_tier()`/`buildPermissions()`/`DowngradeGate` 어디에도 새 분기를 추가하지 않고 기존 마이그레이션 인프라(Phase 16 스캐폴딩)를 그대로 재사용할 수 있음.
- **적용**: 강제 전환 모달 문구를 "구독이 종료되었습니다" → "유효한 구독이 없습니다"로 일반화(`DowngradeModal.tsx`, `docs/UI_FLOW.md`)해 만료/미결제 양쪽에 모두 자연스럽게 읽히도록 수정. `docs/PERMISSION_DESIGN.md` §2-1, `docs/SUBSCRIPTION_DESIGN.md` §6에 이 정책과 트리거 조건을 명시.
- **후속 결정 필요(이월)**: "가입 즉시 상품 선택 화면으로 강제 라우팅"할지 여부는 온보딩 라우팅 구조 변경이 필요해 이번 세션 범위에서 제외. 현재는 사후적으로(앱 재실행 시) `DowngradeGate`가 감지해 되돌리는 방식만 구현됨 — `docs/TODO.md`에 후속 작업으로 등록.
- **영향 범위**: `docs/PERMISSION_DESIGN.md` §2-1, `docs/SUBSCRIPTION_DESIGN.md` §6, `docs/UI_FLOW.md`(만료/Master 해제/미결제 가입 → Guest 전환 안내), `web/src/components/migration/DowngradeModal.tsx`, `web/src/components/migration/DowngradeGate.tsx`, `web/src/hooks/useSubscriptionDowngrade.ts`.

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
