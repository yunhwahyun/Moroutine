# 데이터 이전 엔진 설계 (Migration Design)

> 작성일: 2026-07-18
> 이 문서는 Guest↔Remote 양방향 데이터 이전의 **기술 엔진**(청크 처리, Idempotency, 롤백, 기기별 상태 추적)을 다룬다.
> 언제 이전이 트리거되는지(정책)는 `docs/SUBSCRIPTION_DESIGN.md`, 저장소 자체 구조는 `docs/DATA_STORAGE_DESIGN.md` 참고.

---

## Phase 15 구현 완료 (2026-07-18) — Local → Remote 방향

`docs/TODO.md` Phase 15에서 아래를 구현했다. **Remote → Local 방향(구독 만료/Master 해제, §6~§7)은 이번 범위에 포함되지 않았다** — Phase 16(RevenueCat)/17(Master 해제)에서 실제 트리거가 생길 때 이 엔진의 상당 부분(청크/Idempotency 패턴)을 재사용해 구현할 예정.

| 구성 요소 | 실제 파일 |
|---|---|
| 이전 RPC 6종(wordbook/word/schedule/schedule_exception/study_session/study_result) | `supabase/migrations/26_migration_engine_rpcs.sql` |
| 로컬 스냅샷 읽기 | `web/src/lib/migration/localSnapshot.ts` |
| 오케스트레이션 엔진(청크/재시도/Idempotency/알림 재등록) | `web/src/lib/migration/guestToRemoteMigration.ts` |
| 상태 훅 | `web/src/hooks/useGuestMigration.ts` |
| 확인 모달 + 트리거 게이트 | `web/src/components/migration/GuestMigrationModal.tsx`, `GuestMigrationGate.tsx` |

**설계 원문과 달라진 점(실용적 스코프 조정)**:
- **notifications 테이블 자체는 이전하지 않는다.** 오래된 `native_id`를 그대로 복사하면 기기의 실제 알림 예약 상태와 어긋날 수 있어서, 이전된 일정 중 `alarm_minutes`가 설정된 것만 이전 완료 후 `refreshScheduleNotifications()`로 **새로 예약**한다(§3-2 원문의 7번 단계를 대체).
- **speaking_sentences/recordings는 대상에서 제외** — Phase 23에서 Local 스키마 자체가 아직 없다(`docs/DATA_STORAGE_DESIGN.md` §7 참고).
- **트리거는 "결제 확정" 이벤트 구독이 아니라 `usePermissions()`의 `serviceTier` 변화를 감지하는 방식**이다. Phase 16(RevenueCat) 전이라 결제 이벤트 자체가 없으므로, 로그인한 사용자의 서버 등급이 pro/premium/master로 확인되고 로컬에 데이터가 있으면 무조건 모달을 띄운다 — 원인(결제든 Master 지정이든)을 가리지 않는 범용 게이트라 Phase 16/17에서 별도 배선 없이 그대로 재사용된다.
- **"나중에 하기" 시 배너 상시 노출은 미구현**(원문 §2: "로컬 데이터는 앱 내 '이전 대기 중' 배너로 계속 노출") — 지금은 세션당 1회만 모달을 띄우고 닫으면 그 세션에서는 다시 안 뜬다. 배너 UI는 후속 작업으로 남긴다.
- **Idempotency 응답 형태**: 문서 초안은 TABLE 반환이었으나 실제로는 각 RPC가 `TABLE(local_id text, server_id uuid)`를 그대로 반환해 클라이언트가 부모→자식 remap에 바로 쓸 수 있게 했다(`create_words_checked`처럼 jsonb 단일 값이 아님 — 이 RPC들은 단건 조회가 아니라 여러 행의 매핑을 돌려줘야 하므로 TABLE이 더 자연스럽다).

**Playwright 실브라우저 검증(2026-07-18)**: `GuestMigrationGate`의 tier 조건을 임시로 우회(검증 후 즉시 원복)해 확인 — 로컬에 단어장 1개+단어 2개가 있는 상태에서 홈 진입 시 모달이 정확한 요약("단어장 1개", "단어 2개")과 함께 뜨고, "계정으로 이전" 클릭 시(미인증 상태라 RPC가 401로 실패) UI가 "이전에 실패했습니다 / 로컬 데이터는 안전하게 보존되어 있습니다"로 정확히 전환되며, 실패 후에도 로컬 데이터(1개 단어장, 2개 단어)가 그대로 남아있음을 확인. **이 과정에서 실제 버그 1건을 발견해 수정**: `getOrCreateMigrationJob()` 실패 시 `onProgress` 콜백이 호출되지 않아 UI가 무한정 "이전 중" 상태에 머무는 문제 — 원복 전 즉시 수정 완료.

**한계**: RPC들이 실제로 wordbooks/words 등을 원격 DB에 정확히 써넣는지(성공 경로)는 실제 Pro/Premium/Master 계정이 없어 이 세션에서 검증하지 못했다. SQL 로직(Idempotency CTE, 부모-자식 remap JOIN)은 꼼꼼히 리뷰했으나, 실제 계정으로 "계정으로 이전" 전체 플로우(청크 업로드 → 원격 데이터 확인 → 로컬 삭제 선택)를 사후 검증하는 것을 강력히 권장한다.

---

## 1. 범위

| 방향 | 트리거 | 관련 정책 문서 |
|---|---|---|
| Local → Remote (Guest → Pro/Premium/Master) | 결제 확정 / Master 초대 수락 | `docs/SUBSCRIPTION_DESIGN.md` §5, `docs/MASTER_INVITATION_DESIGN.md` |
| Remote → Local (Pro/Premium/Master → Guest) | 구독 만료/해지, Master 해제(+유료 구독 없음) | `docs/SUBSCRIPTION_DESIGN.md` §6 |
| Remote → Local 병합 (3개월 이내 복원) | 재구독, Master 재지정 | `docs/SUBSCRIPTION_DESIGN.md` §7, `docs/DATA_RETENTION_DESIGN.md` §3 |

---

## 2. Local → Remote 이전 절차 (§9 원문 11단계 기준)

```text
1. Pro/Premium 상품 선택
2. 회원가입 또는 로그인
3. 결제 상태 서버 검증 (RevenueCat Webhook 확정 대기)
4. Entitlement 확정 (subscriptions.status='active' 확인)
5. 로컬 데이터 존재 여부 확인 (LocalDataRepository 카운트 조회)
6. 로컬 데이터 요약 표시 — 개인 단어장 수 / 개인 단어 수 / 학습 기록 수 / 복습 대상 수 / 일정 수 / 로컬 녹음 수
7. 사용자에게 이전 여부 확인 — [계정으로 이전] / [새로 시작] / [나중에 하기]
8. 서버 DB로 데이터 이전 (§4 순서/청크 규칙 적용)
9. 이전 결과 검증 (§5)
10. Remote Mode 전환 (Repository Factory가 이후 RemoteDataRepository 반환)
11. 로컬 데이터 유지 또는 삭제 선택 — 기본값은 "유지"(성공 검증 전 삭제 금지 원칙과 별개로, 이전 성공 후에도 즉시 삭제를 강제하지 않고 사용자 선택에 맡긴다)
```

"나중에 하기" 선택 시: 로그인은 유지하되 로컬 데이터는 그대로 두고 Remote 신규 계정으로 시작(빈 상태). 로컬 데이터는 앱 내 "이전 대기 중" 배너로 계속 노출해 재시도 가능하게 한다.

---

## 3. 이전 실행 세부 규칙

### 3-1. Idempotency Key

이전 작업 전체에 하나의 `migration_id`(UUID)를 발급하고, 개별 레코드 이전 요청마다 `(migration_id, local_id)`를 Idempotency Key로 사용하는 UPSERT를 수행한다.

```sql
CREATE TABLE migration_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direction     text NOT NULL,   -- 'local_to_remote' | 'remote_to_local'
  status        text NOT NULL DEFAULT 'in_progress',
    -- 'in_progress' | 'completed' | 'failed' | 'rolled_back'
  total_records int,
  processed_records int NOT NULL DEFAULT 0,
  started_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  error_detail  jsonb
);

CREATE TABLE migration_id_map (
  migration_id  uuid NOT NULL REFERENCES migration_jobs(id) ON DELETE CASCADE,
  entity_type   text NOT NULL,   -- 'wordbook' | 'word' | 'schedule' | ...
  local_id      text NOT NULL,
  server_id     uuid NOT NULL,
  PRIMARY KEY (migration_id, entity_type, local_id)
);
ALTER TABLE migration_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_id_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "migration_jobs_select" ON migration_jobs FOR SELECT TO authenticated USING (auth.uid() = user_id);
-- INSERT/UPDATE는 클라이언트가 본인 마이그레이션 잡만 생성/갱신 가능
CREATE POLICY "migration_jobs_insert" ON migration_jobs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "migration_jobs_update" ON migration_jobs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

- 재실행(네트워크 재연결 후) 시 동일 `migration_id`로 이어서 처리 → 이미 `migration_id_map`에 매핑이 있는 레코드는 스킵, 없는 레코드부터 재개.
- 서버 ID 충돌(3개월 이내 복원처럼 기존 서버 데이터가 이미 존재하는 경우)이 감지되면 신규 UUID를 발급해 매핑 테이블에 기록한다(`docs/DATA_STORAGE_DESIGN.md` §9).

### 3-2. 부모·자식 이전 순서

```text
1. wordbooks
2. words (wordbook_id 매핑 필요 → migration_id_map에서 wordbook local_id → server_id 조회 후 사용)
3. study_sessions
4. study_results (session_id, word_id 매핑 필요)
5. schedules
6. schedule_exceptions (schedule_id 매핑 필요)
7. notifications (schedule_id 매핑 필요)
8. speaking_sentences / speaking_recordings (§5)
9. settings(profiles UPDATE, 단건)
```

부모가 실패하면 해당 서브트리 전체를 건너뛰고 실패 목록에 기록 후 나머지 독립적인 항목(예: schedules)은 계속 진행 — "전부 아니면 전무"가 아니라 **엔티티 그룹 단위 부분 성공**을 허용한다. 단, `words`는 §4(Pro 한도)의 예외로 항상 전량 이전한다.

### 3-3. 대량 데이터 분할 업로드

```typescript
const CHUNK_SIZE = 200 // words 기준, 결정 필요: 실측 후 조정
for (const chunk of chunksOf(localWords, CHUNK_SIZE)) {
  await migrateWordsChunk(migrationId, chunk) // 서버는 migrate_guest_words RPC 호출
  await updateProgress(migrationId, chunk.length)
}
```

- `migrate_guest_words` RPC는 `docs/SUBSCRIPTION_DESIGN.md` §4-2의 `create_words_checked`와 달리 **한도를 검증하지 않고 전량 삽입**한다(Guest→Pro 전환 시 초과분도 모두 이전해야 하므로, §10 정책). 대신 이전 후 `words` 총량이 한도를 넘으면 `profiles`에 `word_registration_blocked=true` 플래그를 세워 이후 신규 등록 RPC(`create_words_checked`)가 이를 참조하도록 한다(또는 매 호출 시 실시간 카운트 비교로 대체 가능 — 플래그 캐시는 최적화 옵션, 결정 필요).

### 3-4. 네트워크 중단 복구

- 청크 단위 커밋이므로 중단 시점까지의 진행 상황은 `migration_jobs.processed_records`와 `migration_id_map`에 남는다.
- 앱 재실행 시 `status='in_progress'`인 `migration_jobs`가 있으면 자동으로 이어하기 화면을 노출(§2의 7번 확인 단계는 건너뛰고 바로 재개).

---

## 4. 부분 실패 롤백

| 실패 유형 | 처리 |
|---|---|
| 개별 청크 삽입 실패(일시적 네트워크 오류) | 해당 청크 재시도(지수 백오프), `migration_jobs`는 `in_progress` 유지 |
| 반복 실패(3회 이상) | `migration_jobs.status='failed'`, `error_detail` 기록, 사용자에게 "이전 실패, 로컬 데이터는 보존됨" 안내 — **로컬 데이터는 절대 먼저 삭제하지 않으므로 데이터 유실 없음** |
| 사용자가 명시적으로 "이전 취소" | 이미 서버에 반영된 레코드를 `migration_id_map` 기준으로 역순 삭제(`status='rolled_back'`) 후 로컬 데이터는 그대로 유지 |

---

## 5. 이전 결과 검증

```text
로컬 레코드 수 == migration_id_map 매핑 수 (엔티티 타입별)
샘플링 체크섬(선택) — word.term/definition 해시 비교
검증 통과 후에만:
  - migration_jobs.status = 'completed'
  - 클라이언트가 Remote Mode로 전환
  - (§2-11 사용자 선택 시) 로컬 데이터 삭제
```

**성공 검증 전 로컬 데이터 삭제 금지**는 절대 규칙이다 — 검증 실패 시 로컬이 유일한 데이터 원본으로 남는다.

### 5-1. 녹음 파일 이전

`speaking_recordings`의 Blob은 IndexedDB(`recordingBlobs` 테이블)에서 읽어 Supabase Storage `speaking-recordings/{user_id}/{...}` 경로로 업로드 후 메타데이터를 `speaking_recordings`(Remote)에 기록. 업로드 실패 시 해당 파일만 재시도 대상으로 남기고 다른 데이터 이전은 계속 진행.

### 5-2. 날짜·타임존 정합성

로컬/서버 모두 UTC ISO 8601로 저장하므로(`docs/DATA_STORAGE_DESIGN.md` §11) 변환 없이 그대로 복사. `next_review_at` 등 파생 필드는 재계산하지 않고 로컬 값을 그대로 신뢰(이전 과정에서 복습 스케줄이 밀리지 않도록).

---

## 6. Remote → Local 이전 (구독 만료/Master 해제)

`docs/SUBSCRIPTION_DESIGN.md` §6 절차의 4번(Local DB에 적용) 단계가 이 엔진을 사용한다. 방향만 반대이고 청크/Idempotency/검증 원칙은 동일. 차이점:

- 서버가 항상 기준 데이터(source of truth) — 로컬에 남아있던 이전 Guest 데이터(§6-3)와 충돌 시 **서버 데이터를 우선**하고, 로컬 전용 데이터(서버에 없던 것)는 병합 유지.
- `migration_jobs.direction='remote_to_local'`로 동일 테이블 재사용.

### 6-1. 기존 로컬 Guest 데이터와의 충돌 처리

```text
케이스: 사용자가 로그아웃 상태에서 Guest로 앱을 잠시 사용하다가(예: 다른 계정으로),
        이후 만료된 계정의 서버 데이터가 같은 기기로 내려오는 경우
처리: id 충돌 시 서버 데이터를 신규 ID로 유지(로컬 기존 항목과 병합, 삭제하지 않음)
      사용자에게 "OO개의 기존 로컬 데이터와 병합되었습니다" 안내
```

---

## 7. 3개월 이내 복원 시 병합 (§18.1)

```text
1. 기존 계정 재로그인 / 구독 복원 / Master 재지정
2. 서버 보관 데이터 재활성화 (subscriptions.status='active'로 복귀 또는 special_access='master' 재부여)
3. 현재 기기 Guest 로컬 데이터 확인
4. 서버 데이터 + 로컬 데이터 병합:
   - wordbooks/words: id 매칭 시 skip, 미매칭 로컬 항목은 신규 이전(§3 엔진 재사용)
   - 학습이력/복습상태: 서버 값이 더 최신이면(updated_at 비교) 서버 우선, 로컬이 더 최신이면 로컬 우선
   - 중복 제거: term+definition 완전 일치 + 같은 wordbook 대상 항목은 사용자에게 병합/유지 선택 UI 제공(자동 삭제 금지)
5. 기기 동기화 재개
```

Pro 한도 초과 시에도 §3-3과 동일하게 전량 병합 후 신규 등록만 차단(`docs/SUBSCRIPTION_DESIGN.md` §7-1).

---

## 8. 기기별 이전 상태 추적 (§22)

여러 기기 사용 시나리오 대응.

```sql
CREATE TABLE device_migration_status (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id     text NOT NULL,   -- 클라이언트 생성 고정 식별자(로컬 저장)
  direction     text NOT NULL,   -- 'remote_to_local'
  status        text NOT NULL DEFAULT 'pending',
    -- 'pending' | 'completed'
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_device_migration_unique ON device_migration_status(user_id, device_id, direction);
ALTER TABLE device_migration_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "device_migration_status_all" ON device_migration_status
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

**권장 방향(§22 원문)**:

- 서버 데이터는 특정 기기의 이전 완료 여부와 무관하게 `retention_expires_at`(3개월) 기준으로만 삭제한다 — "모든 기기가 이전을 완료해야 삭제" 같은 조건을 걸지 않는다(무한 대기 방지).
- 각 기기는 앱 실행 시 자신의 `device_migration_status`를 확인해 아직 `pending`이면 §6 절차를 수행한다. 여러 기기가 동시에 이전을 수행해도 Idempotency Key(§3-1)가 중복 생성을 막는다.
- 사용자가 어느 기기로 이전받을지 선택하는 UI는 MVP 범위에서 제공하지 않는다(모든 기기가 각자 독립적으로 이전) — **결정 필요**: 향후 "기기 선택" UX 도입 여부.

---

## 9. 결정 필요 항목

| 항목 | 비고 |
|---|---|
| 청크 크기(`CHUNK_SIZE`) 실측값 | 200은 임시값, 실측 후 조정 |
| `word_registration_blocked` 플래그 캐시 방식 도입 여부 | 실시간 카운트 비교로 대체 가능, 성능 이슈 확인 후 결정 |
| 기기 선택 UX 도입 여부 | §8 참고 |
