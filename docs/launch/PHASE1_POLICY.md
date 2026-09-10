# Phase 1 출시 정책 (1차 출시 — Guest/Master/Admin, 결제 없음)

> **상태: 정책 확정 완료(2026-09-09), P0 1차 구현 완료(2026-09-10, 아래 §10 체크리스트 참고).**
> P0의 §10 1~4단계(DB/Edge Function/프런트엔드/콘텐츠) 중 이번 세션 구현 범위로 지정된 항목은 코드
> 반영 완료. §10 5단계(스테이징 A~F 실환경 QA)와 사용자가 Supabase Dashboard에서 직접 해야 하는
> 설정(§10 0단계, "Allow new users to sign up" OFF 등)은 여전히 미완료 — **P0 코드 구현 ≠ 배포 가능**.
> 이 문서는 여러 세션에 걸친 정책 분석·검증 대화의 최종 결론만 담는다. 과정상의 논쟁·중간 결론은 담지 않으므로, 배경이 필요하면 `docs/DECISION_LOG.md` 2026-09-09 항목("1차 출시 정책 확정" 이하)을 참고.
>
> 관련 문서: `docs/legal/PRIVACY_POLICY_PHASE1.md`(개인정보처리방침 전문), `docs/legal/TERMS_PHASE1.md`(이용약관 전문), `docs/PERMISSION_DESIGN.md`/`docs/SUBSCRIPTION_DESIGN.md`/`docs/MASTER_INVITATION_DESIGN.md`/`docs/ADMIN_DESIGN.md`/`docs/DATA_RETENTION_DESIGN.md`/`docs/MIGRATION_DESIGN.md`(기존 설계 문서, 이번 정책과 충돌하는 부분은 이 문서가 우선).

---

## 1. 최종 1차 정책 기준

1차 출시에는 **Guest / Master / Admin** 세 유형만 존재한다. 일반 회원가입, Pro, RevenueCat, 결제, 구독, 가격, 요금제, `/signup` 라우트는 전부 없다.

| | Guest | Master | Admin |
|---|---|---|---|
| 가입 경로 | 없음(비로그인) | Admin 이메일 초대 전용 | 서버에서만 지정(셀프가입 불가) |
| 데이터 저장 | 기기 Local DB(IndexedDB) | 서버(Supabase) | 해당 없음 |
| 비용 | 무료 | 무료 | — |
| 학습 기능 | 전체 이용 | 전체 이용 + 동기화 | 해당 없음(개인 학습 기능 사용 안 함) |
| 공용 단어장/책장 | **메뉴 자체 비노출**(B안 확정, §8) | 이용 가능 | 관리(콘텐츠 CRUD)만 |
| 회원탈퇴 | 없음(로컬 데이터 삭제로 대체) | 가능(§7) | 없음(서버 지정 해제) |
| 개인 데이터 접근(타인) | — | 불가 | 불가(RLS로 서버 차단) |

1차에 **없음**: 일반 회원가입, `/signup` 라우트, Pro, Premium, RevenueCat SDK, 인앱결제, 구독, 가격, 요금제, 구매/구매복원 UI, 업그레이드 CTA.

---

## 2. 권한 매트릭스

| 속성 | Guest | Master | Admin | Pro(2차) |
|---|---|---|---|---|
| 로그인 | 불필요 | 필요 | 필요 | 필요 |
| 데이터 저장 위치 | Local(IndexedDB) | Remote(Supabase) | 해당 없음 | Remote(Supabase) |
| 동기화 | 불가 | 가능 | — | 가능 |
| 개인 단어 한도 | 무제한(기기 용량) | 무제한 | — | 플랜별 한도(미확정) |
| 공용 단어장/책장 열람 | 불가(메뉴 비노출) | 가능 | 관리(열람 아님) | 가능 |
| 대량 가져오기 | 불가 | 가능 | — | 가능 |
| Admin 화면 접근 | 불가 | 불가 | 가능 | 불가 |
| 결제 | 없음 | 없음 | 없음 | 있음 |
| 회원탈퇴 | 로컬 삭제로 대체 | 가능 | 서버 지정 해제 | 가능(활성 구독 고려) |

---

## 3. Flow

### 3.1 Guest
앱 실행 → 로그인 없이 즉시 사용 → 단어장/단어/책장/일정 생성(Local) → 학습/퀴즈/복습(Local 기록) → (선택) 데이터 내보내기/가져오기 → (선택) "로컬 데이터 초기화"(§3.6).

### 3.2 Master 초대/가입
1. Admin이 `/admin/masters`에서 이메일 입력 → 초대 발송(`master-invite`)
2. `master_invitations`에 `status='sent'` 생성, 동일 이메일 활성 초대 중복 시 409
3. Supabase `inviteUserByEmail`(신규) 또는 `signInWithOtp`(기존 가입자)로 메일 발송 — 실제로는 Edge Function → Supabase Auth Admin API → Supabase Auth의 커스텀 SMTP(Resend, Moroutine 소유 계정)로 발송(§6)
4. 사용자가 메일 링크 클릭 → Supabase 세션 발급 → `MasterAcceptPage` 진입
5. 비밀번호 설정
6. ☐ [필수] 이용약관 동의
7. ☐ [필수] 만 14세 이상 확인(가입 자격요건 확인 — "동의"가 아님, §5)
8. 개인정보처리방침 **안내 문구 + 열람 링크**(체크박스 아님, §5)
9. `master-accept` 호출 — 세션 이메일로 `master_invitations` 대조, `expires_at`/`status` 검증
10. `profiles.special_access='master'` 부여, 초대 `status='accepted'` 전이
11. `user_policy_agreements`에 `terms`/`age_eligibility` 기록(§4)
12. 대기 중이던 데이터 보관 삭제 스케줄 취소
13. 가입 완료 → 로그인 상태 전환, 전체 학습 기능 사용 가능

### 3.3 Master 로그인
`/login`(로그인 단일 폼, 회원가입 탭 없음) → Supabase Auth 인증 → `usePermissions()`가 `profiles.role/special_access` 서버 조회 → `special_access='master'` 확인 → Remote Repository 전환 → 동기화 시작.

### 3.4 Admin
`/login`(동일 폼, Admin 전용 화면 없음) → `ProtectedRoute requireRole="admin"` → `/admin/*` → 공용 콘텐츠 CRUD, Master 초대/재발송/철회/해제, `admin_audit_log` 조회 → 개인 데이터 접근 시도는 RLS로 서버 차단.

### 3.5 Master 회원탈퇴 (신설 필요)
1. 설정 > 회원탈퇴 클릭
2. 주의사항 표시: "계정과 서버에 저장된 데이터가 삭제되며 복구할 수 없습니다. 필요한 데이터는 탈퇴 전 내보내기 하세요"
3. (권장) 데이터 내보내기 진입점 제공
4. 최종 확인
5. **[신설]** 보호된 Edge Function(`master-delete-account`) 호출 — 개인 서버 데이터 전 테이블 삭제(§7 목록) + `user_policy_agreements` 포함
6. Storage 개인 파일 삭제(현재 실사용 버킷 없음 — 스피킹 기능 활성화 시 대비 필요)
7. `profiles` 행 삭제(권한 강등이 아니라 계정 자체 삭제)
8. `supabase.auth.admin.deleteUser()`로 Auth 계정 삭제
9. 클라이언트 로그아웃 → Guest 상태 전환

**Master 자진 탈퇴 vs Admin의 Master 권한 해제 — 반드시 구분**

| | Master 자진 탈퇴 | Admin의 Master 권한 해제 |
|---|---|---|
| 트리거 | 본인 요청 | 관리자 결정 |
| 계정(Auth) | 삭제 | 유지(등급만 강등) |
| 서버 개인 데이터 | 즉시 삭제 | 3개월 보관 후 삭제 |
| 이후 상태 | 완전히 새 사용자(재가입 시) | Guest로 전환, 재초대 가능 |

### 3.6 Admin의 Master 권한 해제 → Guest 데이터 이전 (수정된 방식 — 권한 중지는 즉시, 데이터 이전은 나중에)

> 수정 이유: 이전 버전은 로컬 이전이 끝날 때까지 `special_access='master'`를 유지해, 사용자가 앱을 안 열면 Master 권한이 기한 없이 유지되는 문제가 있었다. **권한 중지는 즉시, 데이터 이전은 나중**으로 분리한다.

1. Admin이 `/admin/masters`에서 Master 권한 해제(`master-revoke`) 실행
2. **즉시** `profiles.special_access` → `none` 반영 — 동기화·쓰기·전체 학습기능 등 일반 Master 기능이 그 순간 전부 정지
3. 동시에 계정을 `downgrade_pending` 상태로 표시 — 이 상태에서는 서버 개인 데이터에 대해 **읽기(read)/내보내기(export)/로컬 이전(migration) 전용의 제한적 접근만** 허용(새 데이터 생성·일반 동기화는 불가). 세부 강제 메커니즘(RLS/Edge Function 범위)은 P0 구현 시 확정
4. `retention_schedules`에 3개월 보관 스케줄 생성(기존 로직 재사용) — 권한 해제 시점부터 카운트 시작
5. 다음 로그인/앱 실행 시 "Master 이용이 종료되었습니다" 안내
6. `remoteToLocalMigration.ts`(기존 Remote→Local 엔진, 구독 만료 시 이미 쓰던 것) 재사용 — `downgrade_pending`이 부여한 권한 범위 내에서 서버 데이터를 로컬로 이전
7. 이전된 데이터 개수/무결성 검증
8. 검증 통과 후 클라이언트 Repository를 Local로 완전 전환, `downgrade_pending` 해제 → Guest 전환 완료
9. 서버 원본 데이터는 3단계 시점부터 계산한 3개월 보관 종료 후 `retention-cleanup`이 삭제(마이그레이션 여부와 무관하게 보관기간은 동일하게 흐름)

**추가 검토 필요(결정 필요 항목)**
- 여러 기기에서 로그인했던 경우 — 어느 기기를 로컬 이전 대상으로 할지
- Local/Remote 데이터가 동시 존재하는 경우 — 병합이 아니라 구분 보관 후 사용자 선택 안내 권장
- 네트워크 실패/부분 실패 재시도 — 기존 Local→Remote 엔진의 지수 백오프 3회 재사용
- 마이그레이션 완료 상태를 `device_migration_status`에 기록(중복 이전 방지)
- 보관 만료 전 알림 — 기존 `RetentionBanner.tsx` 재사용 가능한지 확인 필요

### 3.7 Guest 데이터 삭제
설정 > "로컬 데이터 초기화" → 경고("복구할 수 없습니다") → 확인 → `clearAllLocalData()` 실행.

**2026-09-10(P0) 방침 변경**: 이전 버전은 `wordbooks, words, schedules, scheduleExceptions,
studySessions, studyResults, settings`만 지우고 `notifications`는 "OS 예약 알림 유지 목적"으로 의도적
제외했었다. P0 구현 세션에서 사용자가 "UI가 '모든 데이터 삭제'라고 표현한다면 예약된 알림까지 함께
취소·삭제하는 방향을 우선 적용"하도록 명시적으로 재지시해 **이 문단의 기존 결론을 뒤집는다** — 이제
`clearAllLocalData()`는 `localDB.notifications`에 남은 `native_id`를 전부 `bridge.cancelNotification()`으로
취소하고, 복습 알림(`reviewNotificationScheduler.ts`의 별도 `native_id`)도 함께 취소한 뒤
`notifications`/`books`/`bookChapters`/`meta`(버그성 누락, 이번에 수정)까지 포함해 전부 clear한다.
확인 문구도 "단어장/단어/책장/일정/학습기록/설정과 예약된 알림"으로 갱신해 실제 삭제 범위와 맞췄다.

---

## 4. `user_policy_agreements` 테이블 (명칭·스키마·보존정책)

기존 초안의 `user_consents`/`consent_type`/`age_14_confirmed`라는 이름은 "이용약관 동의"와 "만 14세 자격확인"을 똑같이 "동의(consent)"로 부르는 게 개념적으로 부정확해 아래로 수정했다.

```sql
create table user_policy_agreements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  agreement_type text not null check (agreement_type in ('terms', 'age_eligibility')),
  policy_version text not null,
  agreed_at timestamptz not null default now(),
  metadata jsonb
);
```

- `agreement_type`: `'terms'`(이용약관 동의) / `'age_eligibility'`(만 14세 이상 자격확인) 2종으로 시작. 2차 마케팅 선택동의 등 필요 시 값만 추가(스키마 변경 없음)
- **`withdrawn_at` 컬럼을 두지 않음** — 이용약관 동의 철회는 사실상 회원탈퇴와 결합되어 탈퇴 처리(계정·행 삭제)로 이미 반영되고, "만 14세 이상이었다"는 과거 시점 확인 기록에는 철회 개념이 성립하지 않음
- **보존정책(수정)**: "감사 목적 영구 보존"이 아니라, 회원 유지 중에는 불변(immutable) 기록으로 유지하다가 **Master 회원탈퇴 시 다른 개인정보와 함께 삭제하는 것을 기본**으로 함(`ON DELETE CASCADE`로 자동 반영). 법령상 별도 보존이 필요한 경우에만 예외
- RLS: SELECT/INSERT는 본인만(`auth.uid() = user_id`), 클라이언트용 UPDATE·DELETE 정책 없음(회원 유지 중 불변 기록. 삭제는 탈퇴 처리로만 발생)
- `policy_version` 관리: 이용약관 개정마다 버전 문자열(예: `2026-09-01`)을 올리고 동의 당시 버전을 남긴다 — 이후 "그 시점에 어떤 약관에 동의했는지" 증명 가능

---

## 5. 가입 동의 구조 — 법적 근거 재검토 결론

**최종 결론**: Master 가입 시 필요한 것은 ① 이용약관 동의(체크박스) ② 만 14세 이상 확인(체크박스, "동의"가 아니라 자격요건 확인) ③ 개인정보처리방침 **안내 + 열람 링크**(체크박스 아님) — 세 가지뿐이다.

- **"[필수] 개인정보 수집·이용 동의" 체크박스는 넣지 않는다.** 근거: 개인정보 보호법 제15조제1항제4호(정보주체와 체결한 계약의 이행 또는 계약 체결 과정에서 정보주체의 요청에 따른 조치를 이행하기 위해 필요한 경우) — Master 계정 생성이라는 이용자 본인의 요청을 이행하기 위한 최소한의 처리로 보아 별도 동의 없이 처리 가능. 이 결론은 법적 성격 판단이므로 **최종 게시 전 법무 확인 권장**(법적으로 절대 불필요하다는 단정은 아님).
- **만 14세 이상 확인은 법정 의무가 아니라 회사 자체 정책.** 개인정보보호법 제22조의2는 "실제로 만 14세 미만 아동"을 처리할 때만 법정대리인 동의를 요구하는 조항이지, "모든 가입에 체크박스를 넣어라"가 아니다. Moroutine은 법정대리인 동의 절차를 따로 만들지 않는 대신 "회원 계정은 만 14세 이상에게만 제공"하는 자체 정책으로 아동 대상 처리 상황 자체를 피한다. 체크박스 자기신고의 법적 충분성은 [법무 확인 필요].
- Admin은 소비자 가입이 아니라 운영자가 서버에서 직접 만드는 운영 계정이므로 별도 가입 동의 UI를 만들지 않는다.

---

## 6. 위탁·국외이전 — 사업자별 판단 (추측 없이 코드/공식문서 확인)

| 사업자 | 실제 기능 | 위탁 해당 | 국외이전 | 리전/국가 | 보유기간 |
|---|---|---|---|---|---|
| **Supabase Pte. Ltd.**(2026-09-10 확인 — 공식 DPA 원문엔 "Supabase, Inc." 표기 없음, `docs/legal/PRIVACY_POLICY_PHASE1.md` §7 각주 참고) | DB, Auth, Edge Function | **해당** | **발생** | **싱가포르(ap-southeast-1)** — 사용자가 Dashboard에서 직접 확인(2026-09-10) | 회원탈퇴 시까지 |
| **Plus Five Five, Inc.(Resend)** | Master 초대 이메일 발송(Supabase Auth 커스텀 SMTP 경유, Edge Function이 Resend API를 직접 호출하지 않음 — `supabase/functions/_shared/masterInvite.ts:24`의 `inviteUserByEmail`만 호출) | **해당** | **발생** | **미국**(Resend 공식 DPA "primary processing operations take place in the United States", 서브프로세서 21개 전부 미국) | 계정 활성 중 30일, 종료 후 90일 내 삭제(백업 +7일) |
| **Vercel Inc.** | 웹앱 **정적 SPA 호스팅만**(서버리스/API Routes 없음 — `web/vercel.json`엔 rewrite만, `api/` 폴더 없음, Vite 정적 빌드로 코드 확인) | **법무 확인 필요**(애플리케이션 개인정보 미경유, 접속기록만 처리 — "호스팅=위탁 예시" 관행과 상충하는 견해가 둘 다 있음. 1차 방침은 보수적으로 위탁 관계로 기재) | 가능성 높음 | **싱가포르(ap-southeast-1, Southeast Asia)** — 사용자가 프로젝트 설정에서 직접 확인(2026-09-10) | [확인 필요](접속 로그 실제 보관기간, Vercel 기본 정책 확인 필요) |

**Guest 접속 시 실제 발생하는 요청 (코드로 확인, 추측 아님)**:
- Vercel: 앱 접속 자체가 정적 파일 요청이라 **항상** 접속기록(IP/UA) 발생
- Supabase: Guest가 일반 학습 기능(홈/단어장/학습/퀴즈/일정/책장)을 쓰는 동안은 **요청이 전혀 발생하지 않음** — `usePermissions()`가 `enabled: !!user`로 게이팅(`web/src/hooks/usePermissions.ts:74`). 다만 **설정(Settings) 또는 요금제(Pricing) 화면에 들어가면** `useAppConfig()`가 인증 여부와 무관하게 항상 실행되어 `app_config` 조회 요청이 나감(`web/src/hooks/useAppConfig.ts:14-20`, 호출처는 이 두 화면뿐)

---

## 7. Master 회원탈퇴 시 삭제 대상 (실제 스키마 기준)

마이그레이션 01~42 전수 확인 결과, `user_id`가 `auth.users`를 `CASCADE`로 참조하는 테이블:

- `profiles`, `wordbooks`, `words`, `schedules`, `schedule_exceptions`, `notifications`, `study_sessions`, `study_results`, `books`, `book_chapters`
- `subscriptions`, `subscription_audit_log`, `migration_jobs`, `device_migration_status`, `retention_schedules`
- `speaking_sentences`, `speaking_recordings`(1차엔 사실상 빈 테이블), `user_public_wordbook_enrollments`, `user_public_word_progress`
- `user_policy_agreements`(신설) — 기본값 삭제, 법령상 예외만 별도 보존

Storage 파일: 현재 실사용 버킷 없음(확인됨) — 스피킹 기능(Phase 23) 활성화 시 `speaking_recordings.storage_path` 파일 삭제 로직 추가 필요.

**주의(스키마 드리프트)**: `retention-cleanup`의 `CLEANUP_TABLES`와 `clearAllLocalData()` 둘 다 마이그레이션 42(`books`/`book_chapters`)를 반영 못하고 있음 — P0에서 수정.

---

## 8. 공용 단어장/책장 — Guest 노출 방식: B안 확정

A(Guest도 이용 가능)/B(메뉴 비노출)/C(잠금 화면, Master 로그인 유도) 비교 결과 **B안 확정**.

이유: ① Master는 신청·구매로 얻는 등급이 아니므로 "로그인하면 이용할 수 있습니다" 류의 CTA(C안)는 도달할 방법이 없는 안내라 논리적으로 성립하지 않음. ② 1차에 Guest에게 무료로 열었다가(A안) 2차에 Pro 전용으로 바꾸면 "기존 무료 기능이 유료화됐다"는 인식을 줄 위험.

**구현 시 주의**: 메뉴에서 숨기는 것만으로 끝내지 않고, Guest가 직접 URL로 해당 화면(`/public-wordbooks`, `/public-books`)에 접근해도 라우트 가드(권한 검증)로 차단해야 한다.

2차: 공용 단어장/책장을 Pro 혜택으로 공개하는 것을 기본안으로 한다.

---

## 9. Self-signup 계정 처리 — 원칙 및 실행 기록

1차 출시 전, 무료 출시 기간(`app_config.payments_enabled=false`) 중 생성됐을 수 있는 self-signup 계정을 확인해야 한다.

```sql
select count(*) as self_signup_accounts
from profiles
where role = 'user' and special_access = 'none';
```

1건 이상이면 **곧바로 삭제하지 않는다** — 분류 후 처리:
- 테스트 계정(데이터 거의 없음) → 삭제 검토 가능
- 운영자 계정(실수로 일반 가입 경로로 생성) → Admin/Master로 전환 검토
- 실제 이용자 계정(실데이터 보유) → 임의 삭제 금지, 전환 정책 별도 수립

**삭제 방법**: Supabase Dashboard → Authentication → Users → 대상 이메일 → **Delete user**. 개인 데이터 테이블은 전부 `auth.users`에 `ON DELETE CASCADE`라 이 한 번으로 연쇄 삭제된다.

**주의(2026-09 실제 발견)**: Dashboard의 "Delete user" 버튼이 `Database error deleting user`라는 뭉뚱그린 에러로 실패하는 경우가 있었다 — SQL Editor에서 직접 `delete from auth.users where id = '...';`를 실행하면 (a) 성공하면 그걸로 끝(Dashboard 버튼만 버그), (b) 실패하면 정확한 Postgres 에러(어느 FK가 막는지)가 그대로 나온다. 사전 진단용으로 `auth.users`를 참조하는 모든 FK와 `delete_rule`을 조회하는 쿼리는 `docs/DECISION_LOG.md` 2026-09-09 항목에 기록되어 있다. 실제로 1건 처리 완료(§9 실행 기록: `id=d3800164-3c8e-43d5-bb50-437344c810f9`, 7개 후보 FK 전부 0, raw SQL delete로 성공, 재확인 쿼리로 전 테이블 0건 확인).

---

## 10. P0 구현 계획

**순서를 지켜야 하는 이유**: DB 스키마 → 서버(Edge Function/SQL 함수) → 프런트엔드 → 스테이징 검증 순으로, 뒤 단계가 앞 단계에 의존한다. 스테이징 검증(5단계)을 통과하기 전엔 배포하지 않는다.

### 0단계 — 코드 작업 전 사용자 액션(병행 가능)
- [ ] §9 self-signup 계정 확인 쿼리 실행 → 결과에 따라 1단계 착수 전 계정 처리 방침 확정
- [ ] Supabase 프로젝트 Region 확인(대시보드), 실제 SMTP 발신 사업자 확인(Resend로 이미 확인됨, §6)

### 1단계 — DB 마이그레이션 ✅ 이번 세션 구현 완료(2026-09-10)
> **마이그레이션 번호를 문서에 고정하지 않는다.** 구현 시작 시 반드시 `ls supabase/migrations/`로 현재 저장소의 마지막 번호를 확인한 뒤 그 다음 번호를 사용한다 — 실제 착수 시점 마지막 번호는 42였고, 43/44/45를 사용했다(아래).
- [x] `43_user_policy_agreements.sql` — `user_policy_agreements` 테이블 신설(§4) + RLS
- [ ] `master_invitations.token_hash` `DROP COLUMN` — **이번 세션 범위 제외**(사용자가 이번 라운드에서 명시적으로 보류 지정). 다음 P0 라운드에서 진행
- [x] `44_remove_login_pro_fallback.sql` — `get_service_tier()` SQL 함수의 `payments_enabled=false → pro` 폴백 분기 제거
- [x] `45_admin_audit_log_actor_delete_set_null.sql` — **구현 중 신규 발견**: `admin_audit_log.actor_id`가 `ON DELETE` 미지정(NO ACTION)이라 Master 본인이 actor인 감사 로그가 있으면 `auth.admin.deleteUser()`가 FK 위반으로 실패하는 문제를 `master-delete-account` 구현 중 발견 → `ON DELETE SET NULL`로 수정(상세는 `docs/DECISION_LOG.md` 2026-09-10)

### 2단계 — Edge Function ✅ 이번 세션 구현 완료(범위 내 항목만)
- [ ] `master-revoke`: `special_access` 즉시 반영 트랜잭션화(§3.6) — **이번 세션 범위 제외**(사용자 지정 9개 항목에 미포함, 기존 동작 그대로 유지)
- [x] 신설 `master-delete-account`(`supabase/functions/master-delete-account/index.ts`): Admin 계정 보호 + `special_access==='master'` 검증 후 `auth.admin.deleteUser()` 한 번만 호출(§7 CASCADE 확인 완료, 개별 테이블 삭제 없음)
- [ ] `retention-cleanup`: `CLEANUP_TABLES`에 `books`/`book_chapters` 추가 — **이번 세션 범위 제외**(사용자 지정 9개 항목에 미포함)
- [x] `mobile/package.json`에서 `react-native-purchases` 제거, `mobile/App.tsx`의 `Purchases.configure()`/`SET_USER_ID`/`PURCHASE_REQUEST`/`RESTORE_PURCHASES` 핸들러 제거(웹 쪽 `web/src/types/bridge.ts`/`web/src/bridge/index.ts` 타입·함수는 보존)

### 3단계 — 프런트엔드 ✅ 이번 세션 구현 완료
- [x] `web/src/lib/permissions.ts` / `resolveServiceTier()`: 서버(마이그레이션 44)와 동일하게 폴백 분기 제거
- [x] `LoginPage.tsx`: 회원가입 탭(`signup` 모드) 완전 제거, `supabase.auth.signUp()` 호출 경로 제거. `/signup` 라우트는 생성하지 않음(기존에도 없었음, 그대로 유지)
- [x] `MasterAcceptPage.tsx`: 이용약관 체크박스 + 만14세 체크박스 + 개인정보처리방침 안내/링크 추가(§5) — 세션 확인 즉시 자동 호출하던 기존 방식을 "동의 폼 → 제출" 방식으로 변경(비밀번호 폼은 여전히 없음). 제출 시 `master-accept`가 `user_policy_agreements`에 기록
- [x] `SettingsPage.tsx`: 회원탈퇴 버튼을 `master-delete-account` 호출로 교체(기존 `tier !== 'master'` 숨김 조건 제거 — Master가 실제로 탈퇴할 수 있어야 하므로), "개인정보처리방침"/"이용약관" 버튼을 `/privacy`/`/terms`로 연결
- [x] 공용 단어장/책장(§8): 메뉴 비노출은 기존에 이미 구현돼 있었음(`canUsePublicWordbooks` 조건부 렌더링) — 이번엔 `PublicContentGuestGuard` 신설로 Guest의 URL 직접 접근을 라우트 레벨에서 차단(기존엔 라우트 가드가 전혀 없어 직접 URL 접근 시 "Pro/Master 전용... 요금제 보기" CTA가 그대로 노출되던 문제 발견·수정)
- [x] `web/src/lib/dataExport.ts`(`clearAllLocalData`): `books`/`bookChapters`/`meta` 추가 + notifications 취소·삭제(§3.7 갱신 참고 — 방침이 바뀐 부분)

### 4단계 — 콘텐츠 ✅ 이번 세션 구현 완료
- [x] `/privacy`, `/terms` 라우트 신설(`PrivacyPolicyPage`/`TermsPage` + 공용 `LegalDocumentPage`). `docs/legal/PRIVACY_POLICY_PHASE1.md`/`TERMS_PHASE1.md` 원문(내부용 상태 배너·체크리스트·수정이력 제외, `[확인 필요]`는 그대로 보존)을 `web/public/legal/*.md`로 복사해 `fetch()`로 표시 — **docs/legal 원문 갱신 시 이 사본도 수동으로 함께 갱신해야 함**(자동 동기화 아님)

### 5단계 — 스테이징 필수 검증(배포 게이트)
Supabase Auth "Allow new users to sign up" OFF 후 아래 A~F 전부 확인해야 배포 가능. 실패 시에만 P2 대안(아래 §11) 재검토.

| | 시나리오 | 기대 결과 |
|---|---|---|
| A | `supabase.auth.signUp()` 직접 호출 | 신규 self-signup 실패 |
| B | 기존 Master 이메일/비밀번호 로그인 | 성공(설정 변경 후에도 로그인 막히지 않음) |
| C | 기존 Admin 로그인 | 성공 |
| D | Admin의 `inviteUserByEmail()`로 신규 Master 초대 | 성공 |
| E | 초대 링크 클릭 | 정상 세션 생성 |
| F | `MasterAcceptPage`에서 가입 | 정상 완료 |

### 5-1단계 — 비밀번호 변경/재설정 보안 QA(2026-09-10 기능 추가분, 배포 전 필수)

`docs/DECISION_LOG.md` 2026-09-10(비밀번호 재설정/변경 구현) 참고. 스테이징 A~F와 마찬가지로
실환경에서 직접 확인해야 하는 항목 — 추측으로 완료 처리하지 않는다.

| | 시나리오 | 기대 결과 |
|---|---|---|
| G | 가입된 이메일로 재설정 요청 | `email_exists()` true → 재설정 메일 발송 |
| H | 가입 안 된 이메일로 재설정 요청 | 메일 미발송, "가입되지 않은 이메일입니다" 에러(계정 존재 여부 비노출 원칙과 별개로, 이 항목은 사용자가 명시적으로 노출을 선택한 부분 — §5-1 하단 참고) |
| I | 정상 재설정 링크 클릭 | `/reset-password`에 recovery 세션으로 도착, 폼 노출 |
| J | 만료된 링크 클릭 | 세션 미생성 → "재설정 링크가 유효하지 않습니다" |
| K | 이미 사용한 링크 재사용 | 세션 미생성(1회성) → 위와 동일 안내 |
| L | 잘못된/변조된 링크 | 세션 미생성 → 위와 동일 안내 |
| M | 일반 로그인 세션 상태로 `/reset-password` 주소 직접 입력 | `isPasswordRecovery=false`라 폼 비노출("유효하지 않습니다") — recovery 이벤트 없이는 통과 못 함 |
| N | recovery 세션에서만 비밀번호 변경 폼이 열리는지 | M과 반대 경우 확인 — 정상 재설정 링크로는 열림 |
| O | 변경된 새 비밀번호로 로그인 | 성공 |
| P | 변경 전 기존 비밀번호로 로그인 시도 | 실패 |
| Q | 설정 화면 "비밀번호 변경"에서 현재 비밀번호를 틀리게 입력 | 거부(단, Supabase Dashboard "Secure password change" 옵션이 켜져 있어야 서버가 실제로 검증 — §Dashboard 설정 확인 항목과 연결) |
| R | Supabase Dashboard Redirect URL 허용 목록에 `/reset-password` 포함 여부 | `https://www.moroutine.kr/**` 와일드카드로 이미 커버되는지 실제 메일 링크로 확인(로컬 개발은 별도 `http://localhost:5173/**` 필요) |
| S | Resend를 통한 실제 재설정 메일 수신 | 정상 수신, 발신자/제목 확인 |
| T | Resend Click Tracking으로 인한 링크 변형 여부 | 수신 메일의 링크가 Supabase 원본 URL(액세스 토큰 해시 포함) 그대로인지 확인 — Click Tracking 미설정 상태 유지 확인(2026-09-10 확인 완료, 재배포 후 재확인 권장) |

**참고(H 항목)**: `resetPasswordForEmail()` 자체는 계정 존재 여부를 노출하지 않지만, 이 프로젝트는
`email_exists()` RPC로 먼저 확인해 의도적으로 노출하기로 사용자가 결정했다(§14 미해결 표 아님,
이미 확정 — `docs/DECISION_LOG.md` 2026-09-10 참고). 이 QA 항목은 "의도한 대로 동작하는지"
확인용이지 "노출하면 안 된다"는 의미가 아니다.

### 최종 릴리스 순서(P0 완료 ≠ 스토어 제출 가능)

```
P0 코드 구현
  ↓
Supabase Auth "Allow new users to sign up" OFF
  ↓
스테이징 A~F 실환경 QA 통과
  ↓
개인정보처리방침 미확정값 확정 (운영자 정보, Supabase/Vercel 실제 리전 등 — docs/legal/PRIVACY_POLICY_PHASE1.md 체크리스트)
  ↓
최종 빌드 → 스토어 제출
```

---

## 11. P2 대안(원칙적으로 착수하지 않음)

Self-signup 차단을 위해 `auth.users` AFTER INSERT 트리거 + `invited_at` 판정 방식도 검토했으나, (a) Supabase Auth 내부 구현에 강하게 결합되고 (b) 향후 Supabase 변경 시 유지보수 위험이 있으며 (c) Auth 사용자 생성 Flow 자체를 깨뜨릴 가능성이 있어 **P0에서는 제외**한다. §10 5단계 스테이징 검증(A~F)이 전부 통과하면 이 대안은 필요 없다 — "Supabase 설정만으로 요구사항을 충족하지 못하는 경우"에만 재검토하는 P2 조건부 대안으로 남긴다.

---

## 12. 2차를 위해 지금 보존해야 할 구조 (삭제하지 않음)

- 3축 권한 모델·`buildPermissions()` — `guest/pro/master/admin` 4-tier 그대로 유지(2차의 "일반 회원가입=Pro" 흐름이 바로 얹힘)
- `app_config.payments_enabled` 스위치 — 2차 출시 스위치로 재사용(`true` 전환 한 줄)
- Local→Remote / Remote→Local 마이그레이션 엔진 — 2차 "Guest→Pro 데이터 이전"에 재배선 없이 재사용 가능하도록 이미 설계됨
- RevenueCat 브리지(웹↔네이티브 메시지 타입, `revenuecat-webhook` Edge Function 스캐폴딩) — 2차엔 API 키 설정과 실계정 연결만 남도록 유지(git 이력으로 보존, §10 2단계 참고)
- `SignupPricingGate.tsx`/`DowngradeGate.tsx`/`DowngradeModal.tsx`/`useSubscriptionDowngrade.ts` — 1차엔 도달 불가이나 삭제하지 않음, 2차 재개 지점
- Master 초대 시스템의 "서버 검증 우선, 클라이언트 role 변경 불가" 원칙 — 2차 Pro 승급 로직에도 동일 적용
- `user_policy_agreements` 테이블의 "버전과 함께 기록"이라는 구조 — 2차에도 참고 가능하나, **어떤 동의/확인 항목이 필요한지는 2차 시점에 다시 확정**(아래 §13)
- `docs/legal/TERMS_PHASE1.md`의 조항 번호를 유지한 채 뒤에 유료 구독 장(章)을 이어붙일 수 있는 구조

### 2차 착수 시 반드시 되돌릴 것
- [ ] Supabase Auth "Allow new users to sign up" 재활성화
- [ ] `/signup` 라우트·`SignupPage.tsx` **신규 생성**(1차에 만들어둔 게 없으므로 "재노출"이 아니라 새로 만드는 것 — 그 시점의 최신 법령/스토어 정책으로 이용약관 동의·연령 정책·개인정보처리방침 구조를 다시 확정, §13)
- [ ] `app_config.payments_enabled` → `true`(RevenueCat 실연동과 동시)
- [ ] `react-native-purchases` 재설치, `mobile/App.tsx` 초기화 코드 복원(§10 2단계 제거 커밋을 되돌리기)
- **되돌리지 않는 것**: "로그인=Pro" 승격 fallback(§10 1단계에서 제거) — 2차에도 재도입하지 않는다. `payments_enabled=true`가 되면 실제 `subscriptions` 활성 구독 체크가 정상 작동하므로 "로그인만 하면 Pro"라는 규칙 자체는 1차든 2차든 존재해선 안 된다(영구 삭제)

---

## 13. 2차에서만 구현/재검토할 사항

- 일반 회원가입 UI 공개. 이용약관/개인정보/연령 관련 가입 절차는 **2차 출시 시점의 실제 서비스 구조와 최신 법적 기준을 다시 검토하여 확정**한다 — 1차의 "개인정보 별도 동의 없음" 결론(제15조1항4호 근거)을 2차에 자동으로 그대로 적용한다고 지금 미리 정하지 않는다
- Pro 요금제 공개, 가격/구독 UI 노출
- RevenueCat 실계정·상품·Entitlement(`moroutine_pro`) 설정 및 연동
- App Store/Google Play 실결제, 구매 복원, 구독 관리 딥링크
- 결제 Webhook 실가동, billing_retry 자동 만료 스케줄(pg_cron 등록)
- Guest→Pro 데이터 이전 UX(가입 후 로컬 데이터 감지·이전 안내)
- 3개월 이내 재구독 시 "복원 병합"(중복 판정 UI, 기기 선택 UX) — 설계는 있으나 미구현
- 활성 구독 보유 상태의 회원탈퇴 플로우("자동갱신 해지 우선 안내 후 탈퇴 허용")
- 동일 이메일/Apple·Google 계정 재가입 시 Entitlement 재연결 정책, RevenueCat Anonymous ID 처리, 탈퇴 후 도착하는 Webhook 처리
- 사업자등록(개인사업자 포함) 및 통신판매업 신고 필요 여부 재확인 — 1차는 무료라 전자상거래법상 사업자 표시 의무가 없었으나, 유료 결제(IAP)가 시작되는 2차엔 재검토 필요

> §9~§13(2차 회원탈퇴+활성구독)은 2차 출시 전 반드시 다시 검증해야 할 항목으로 명시적으로 남긴다.

---

## 14. 결정이 필요한 사항 (미해결)

| 항목 | 쟁점 |
|---|---|
| 만 14세 확인 방식 | 단순 체크박스 자기신고로 충분한지, 별도 확인 수단이 필요한지 — 법무 확인 필요 |
| 데이터 삭제 고지 vs 마케팅 수신거부 | 계정 삭제 예고 알림이 마케팅 수신거부와 무관하게 발송 가능한지 |
| Storage 버킷 정책 | 현재 미사용이나, 스피킹 기능(Phase 23) 재개 시 회원탈퇴·보관 정책에 파일 삭제 로직을 어떻게 편입할지 |
| Vercel 위탁 해당 여부 | §6 — 애플리케이션 데이터 미경유 vs "호스팅=위탁 예시" 관행, 법무 확인 필요 |
| ~~Vercel 실제 리전~~ | ✅ 확정(2026-09-10): 싱가포르(ap-southeast-1). Supabase도 동일 리전(2026-09-10 확인) |
| 문서 구조 | 이번에 `docs/launch/`, `docs/legal/` 하위 디렉토리를 신설해 채택함(기존 평면 구조 대신) |
| ~~운영자 정보~~ | ✅ 확정(2026-09-10): 윤화현 / yunhwahyun@gmail.com. 사업자등록 없는 개인 운영 확인됨 — 1차엔 문제 없음(전자상거래법 미적용) |
