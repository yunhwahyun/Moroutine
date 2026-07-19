# 데이터 저장 설계 (Data Storage Design)

> 작성일: 2026-07-18
> Guest 로컬 저장 + Repository 계층 + Local/Remote DB 스키마 통합 설계.
> 전제: `docs/PERMISSION_DESIGN.md`(권한 모델), `docs/SUBSCRIPTION_DESIGN.md`(전이 트리거).

---

## 1. 확정 정책

- Guest는 회원가입 없이 모든 개인 데이터를 **현재 기기의 로컬 저장소**에 저장한다. Supabase 사용자 DB에는 어떤 개인 데이터도 저장하지 않는다.
- Pro/Premium/Master는 모든 개인 데이터를 Supabase DB/Storage에 저장한다.
- Guest 단어 등록 수는 인위적으로 제한하지 않는다. 로컬 저장 환경/용량이 사실상의 한계다.
- 화면 컴포넌트는 데이터가 LocalDB에서 오는지 Supabase에서 오는지 알 필요가 없다 — Repository 계층으로 완전히 추상화.

---

## 2. 로컬 저장 대상 (§3.2 원문)

개인 단어장 / 개인 단어 / 학습 이력 / 정답·오답 기록 / 복습 단계 / 다음 복습 예정일 / 학습 일정 / 알림 설정 / 앱 설정 / 스피킹 문장 / 스피킹 녹음 파일 / 기타 사용자 생성 데이터.

---

## 3. 저장 방식 검토 및 채택안

| 환경 | 후보 | 검토 결과 | 채택 |
|---|---|---|---|
| Web | IndexedDB | 구조화 데이터·대용량에 적합, 비동기 API, 브라우저 지원 광범위(Safari 포함) | **✅ 채택** — Dexie.js 등 래퍼 사용 권장(트랜잭션/인덱스/마이그레이션 API 성숙) |
| Mobile WebView | IndexedDB 사용 가능 여부 | Android WebView(Chromium 기반)는 IndexedDB 지원. iOS WKWebView도 iOS 9+ 지원하나 **Private Browsing/저장공간 정책에 따라 예고 없이 삭제될 수 있음** — 검증 필요(§5) | **조건부 채택**, 장기적으로 Native SQLite Bridge 검토 |
| Mobile WebView (장기) | Native SQLite Bridge | WebView Origin 격리·용량 제한 문제를 근본적으로 해결. Bridge 메시지(`LOCAL_DB_*`)로 Web↔Native 통신 필요 | **로드맵 항목**(MVP 이후, §5 검증 결과에 따라 조기 전환 가능) |
| Native(향후 순수 RN 전환 시) | SQLite (`expo-sqlite`) | 구조화 데이터에 최적, WebView 종속성 없음 | 현재 아키텍처(WebView 기반)에서는 미적용, 향후 네이티브 전환 시 우선 후보 |
| 소량 설정값 | LocalStorage(Web) / AsyncStorage(Native) | 동기 API, 소용량 한정(수 MB), **핵심 데이터 저장소로 사용 금지** | 앱 설정(테마 등 극소량 값)에 한정 사용 가능. 기존 `quizProgress.ts`의 localStorage 사용은 이어하기 캐시 용도로만 유지, 정본 데이터 아님 |
| 녹음 파일 | 앱 파일 시스템 | Web: Blob→IndexedDB에 바이너리 저장 가능(용량 부담 큼) 또는 File System Access API(브라우저 지원 제한적) / Native Bridge 경로: `expo-file-system` | Web은 IndexedDB Blob 저장, Native Bridge 폴백 시 파일시스템 경로 사용(`docs/SPEAKING_DESIGN.md` §5 참고) |

> **LocalStorage는 핵심 데이터 저장소로 사용하지 않는다.** 현재 유일한 기존 사용처인 `web/src/lib/quizProgress.ts`(퀴즈 이어하기, 24h TTL)는 성격상 "휘발성 UI 상태 캐시"이므로 이 원칙의 예외로 유지하되, Guest의 단어/학습이력/일정 등 정본 데이터는 절대 LocalStorage에 두지 않는다.

---

## 4. Guest 로컬 저장 위험도 (§3.3 원문)

| 위험 | 설명 | 완화책 |
|---|---|---|
| 앱 삭제 | 앱 삭제 시 로컬 저장소 전체 소실(Native/WebView 공용 스토리지 정책에 따라 다름) | 설정 화면에 명시적 경고(§8), 데이터 내보내기 기능 제공 |
| WebView 데이터 초기화 | RN이 WebView 캐시/스토리지를 초기화하는 코드를 실수로 추가하면 유실 | 코드 리뷰 규칙에 "WebView storage 초기화 금지" 명시 |
| 브라우저 데이터 삭제 | 사용자가 브라우저 설정에서 사이트 데이터 삭제 | 동일하게 복구 불가 안내 |
| 배포 도메인 변경 | IndexedDB는 Origin(scheme+host+port) 단위로 격리됨 → 도메인 변경 시 기존 데이터 접근 불가 | 도메인 변경은 사실상 "전체 사용자 데이터 초기화"와 동급 리스크로 배포 프로세스에 경고 추가 |
| HTTP/HTTPS 변경 | Origin의 scheme도 격리 기준 → 프로토콜 변경 시 동일 문제 | 동일 |
| 서브도메인 변경 | 서브도메인도 별도 Origin | 동일 |
| OS 저장공간 정리 | OS가 저장공간 부족 시 앱 데이터를 강제 정리할 가능성(특히 WebView 캐시로 분류될 경우) | IndexedDB는 통상 "영구 저장소"로 분류되나 브라우저별 정책 상이 — Storage Persistence API(`navigator.storage.persist()`) 요청 검토 |
| 앱 재설치 | 재설치 시 로컬 저장소 초기화(대부분의 플랫폼에서 삭제된 앱의 데이터는 복구 불가) | 동일 |
| WebView Origin 변경 | mobile/App.tsx의 `getWebAppUrl()`이 가리키는 URL이 바뀌면 위 도메인 변경과 동일한 문제 발생 — **현재 이미 하드코딩된 프로덕션 URL이 존재**하므로 향후 URL 변경 시 반드시 이 리스크를 인지해야 함 | 배포 URL 변경은 마이그레이션 계획 없이는 금지 |

이 위험 목록은 설정 화면 안내 문구(§8)와 데이터 내보내기 기능(§9)의 존재 근거다.

---

## 5. WebView IndexedDB 검증 항목 (MVP 착수 전 필수)

`docs/SPEAKING_DESIGN.md` §12(녹음 환경 검증)와 유사한 성격의 사전 검증을 Guest 로컬 저장에도 적용한다.

| # | 항목 | 검증 방법 | 실패 시 대응 |
|---|---|---|---|
| 1 | Android WebView IndexedDB 읽기/쓰기 | 실기기에서 Dexie 초기화 후 CRUD 테스트 | Native SQLite Bridge로 조기 전환 |
| 2 | iOS WKWebView IndexedDB 읽기/쓰기 | 동일 | 동일 |
| 3 | 앱 백그라운드/포그라운드 전환 후 데이터 보존 | 데이터 저장 → 앱 백그라운드 → 재진입 → 조회 | Bridge 경유 저장으로 전환 검토 |
| 4 | 대용량(수천 단어) 저장 성능 | 벤치마크 | 페이지네이션/인덱스 튜닝 |
| 5 | Storage Persistence API 지원 여부 | `navigator.storage.persist()` 호출 결과 | 미지원 시 위험 안내 강화 |

---

## 6. Repository 아키텍처

### 6-1. 공통 인터페이스

```typescript
// src/repositories/types.ts — Phase 12(2026-07-18)에 실제 구현 완료
interface DataRepository {
  getWordbooks(): Promise<Wordbook[]>
  getWordbook(id: string): Promise<Wordbook | null>
  createWordbook(input: CreateWordbookInput): Promise<Wordbook>
  updateWordbook(id: string, input: UpdateWordbookInput): Promise<void>
  deleteWordbook(id: string): Promise<void>

  getWords(wordbookId: string): Promise<Word[]>
  createWord(input: CreateWordInput): Promise<Word>
  bulkCreateWords(input: BulkCreateWordsInput): Promise<BulkCreateResult>
  updateWord(id: string, input: UpdateWordInput): Promise<void>
  deleteWord(id: string): Promise<void>

  // Guest 학습/복습 상태 저장(Phase 12.5 후속, 2026-07-18) — wordStatus.ts의 applyQuizAnswer가
  // updateWord()를 경유해 status/review_step/next_review_at/wrong_count를 저장한다.
  createStudySession(input: CreateStudySessionInput): Promise<string | null>  // totalCount===0이면 null
  completeStudySession(sessionId: string, correctCount: number, wrongCount: number): Promise<void>
  saveStudyResult(input: StudyResultInput): Promise<void>
  getReviewQueue(date: string): Promise<ReviewItem[]>

  getSchedules(): Promise<Schedule[]>
  saveSchedule(input: ScheduleInput): Promise<Schedule>  // id 없으면 생성, 있으면 수정 후 반환(문서 초안은 void였으나 구현 시 반환값 필요해 변경)
  deleteSchedule(id: string): Promise<void>

  // Guest 일정 지원(Phase 12.5 후속, 2026-07-18) — 반복 일정 예외(이 일정만/이후 모두/전체 수정·삭제)와
  // 로컬 알림 예약 상태 추적까지 Repository로 이관. notificationScheduler.ts가 이 메서드들을 사용한다.
  getScheduleExceptions(fromDate: string, toDate: string): Promise<ScheduleException[]>
  saveScheduleException(input: ScheduleExceptionInput): Promise<ScheduleException>  // 자연키(schedule_id, occurrence_date) upsert

  getActiveNotifications(scheduleId: string): Promise<NotificationRecord[]>
  createNotifications(inputs: CreateNotificationInput[]): Promise<NotificationRecord[]>
  cancelNotifications(scheduleId: string): Promise<NotificationRecord[]>  // 방금 취소된 레코드(native_id 포함) 반환
  updateNotificationNativeId(id: string, nativeId: string): Promise<void>

  getSettings(): Promise<UserSettings>
  saveSettings(input: Partial<UserSettings>): Promise<void>
}
```

> `ScheduleInput`은 실제로는 discriminated union이다: `id` 없으면 전체 필드가 필수(생성), `id` 있으면 부분 필드만 허용(수정) — `web/src/repositories/types.ts` 참고. `saveSchedule`/`saveScheduleException`의 "생성 분기" 구현부에서는 TypeScript가 이 유니온을 truthy 체크만으로 완전히 좁히지 못해 타입 단언(`as`)이 한 줄 필요하다(런타임 안전성은 호출부 계약으로 보장).

> 실제 도메인 타입(`Word`/`Wordbook`/`Schedule`)이 이미 snake_case(Supabase row와 동일)라서, 위 인터페이스의 입력 타입들도 문서 초안의 camelCase 대신 필드명은 snake_case를 그대로 쓰고 최상위 파라미터만 camelCase로 구현했다(`web/src/repositories/types.ts` 참고) — Local/Remote 매핑 비용을 0으로 유지하기 위함(§8 원칙과 동일한 이유).

`BulkCreateResult`는 한도 초과 정보를 포함할 수 있어야 한다:

```typescript
type BulkCreateResult = {
  insertedCount: number
  currentTotal: number
  limitValue: number | null
  blocked: boolean
}
```

### 6-2. 구현체 및 Factory

```typescript
class LocalDataRepository implements DataRepository { /* Dexie 기반, IndexedDB */ }
class RemoteDataRepository implements DataRepository { /* Supabase 클라이언트 + RPC(create_words_checked 등) */ }
class AdminContentRepository { /* public_wordbooks/public_words 전용, DataRepository와 별도 인터페이스 */ }

function getRepository(tier: ServiceTier): DataRepository {
  switch (tier) {
    case 'guest': return localDataRepository
    case 'pro': case 'premium': case 'master': return remoteDataRepository
    case 'admin': throw new Error('Admin은 AdminContentRepository를 별도로 사용')
  }
}
```

- Factory는 `usePermissions()`(`docs/PERMISSION_DESIGN.md` §9)의 `serviceTier`를 기준으로 선택한다. 화면/훅은 `getRepository(tier)`가 반환한 구현체만 사용하고, Supabase 클라이언트를 직접 호출하지 않는다. `WordbookListPage.tsx`/`WordbookDetailPage.tsx`/`HomePage.tsx`/`QuizPage.tsx`/`LearnPage.tsx`/`useStudyWords.ts`/`wordStatus.ts`는 Phase 12.5(2026-07-18)에 이 계층 경유로 전환 완료(`docs/TODO.md` 참고). `ScheduleListPage.tsx`/`useUserSettings.ts`(설정 영구 저장)는 아직 미전환.
- `RemoteDataRepository.bulkCreateWords()`는 내부적으로 `create_words_checked` RPC(`docs/SUBSCRIPTION_DESIGN.md` §4-2)를 호출한다. `LocalDataRepository.bulkCreateWords()`는 한도 검증 없이 항상 성공(Guest는 무제한).
- `AdminContentRepository`는 `DataRepository`와 형태가 다르다(공용 콘텐츠 CRUD + Master 관리, `docs/ADMIN_DESIGN.md` 참고) — 동일 인터페이스로 억지로 통일하지 않는다.

---

## 7. Local DB Schema (IndexedDB, Dexie 기준)

**구현 완료(2026-07-18)**: 아래는 문서 초안(camelCase 가정)이 아니라 `web/src/repositories/local/schema.ts`의 실제 코드다. §6-1에서 밝힌 이유로 필드명은 snake_case(도메인 타입과 동일)를 그대로 쓴다.

```typescript
// src/repositories/local/schema.ts (실제 구현)
class LocalDB extends Dexie {
  wordbooks!: Table<Wordbook, string>
  words!: Table<Word, string>
  schedules!: Table<Schedule, string>
  scheduleExceptions!: Table<ScheduleException, string>
  notifications!: Table<NotificationRecord, string>
  studySessions!: Table<LocalStudySession, string>
  studyResults!: Table<LocalStudyResult, string>
  settings!: Table<LocalSettingsRow, string>
  meta!: Table<{ key: string; value: unknown }, string>

  constructor() {
    super('moroutine_local_db')
    this.version(1).stores({
      wordbooks: 'id, created_at',
      words: 'id, wordbook_id, status, next_review_at, created_at',
      schedules: 'id, starts_at',
      scheduleExceptions: 'id, [schedule_id+occurrence_date], occurrence_date',
      notifications: 'id, schedule_id, is_cancelled',
      studySessions: 'id, created_at',
      studyResults: 'id, session_id, word_id',
      settings: 'id',
      meta: 'key',
    })
  }
}
```

**아직 없는 테이블**: `speakingSentences`/`speakingRecordings`/`recordingBlobs`(Phase 23 스피킹 재구현 시 추가). `scheduleExceptions`/`notifications`는 2026-07-18(Guest 일정 지원)에 추가 완료. 이 앱은 아직 실사용자 배포 전이라 지금은 `version(1)`에 스토어를 직접 추가하고 있지만, 배포 후에는 반드시 `version(2).stores({...}).upgrade(...)` 체인으로 마이그레이션해야 한다.

- 각 로컬 테이블은 Remote(Supabase) 테이블과 **동일한 필드 셋**을 camelCase로 유지해 DTO 변환 비용을 최소화한다(§8).
- `words.status`/`nextReviewAt` 인덱스는 Remote의 `idx_words_user_review`/`idx_words_user_status`와 동일한 조회 패턴(오늘의 복습/신규 단어)을 로컬에서도 지원하기 위함.

---

## 8. Local/Remote DTO 통일

```typescript
// 도메인 타입은 Local/Remote 공통으로 사용(web/src/types/index.ts 기존 Word/Wordbook/Schedule 타입 확장)
// Repository 구현체 내부에서만 각자의 스토리지 표현으로 변환
// Remote: snake_case DB row ↔ camelCase 도메인 타입 (매핑 함수는 기존 useUserSettings.ts 패턴 재사용)
// Local: Dexie 테이블이 이미 camelCase이므로 매핑 불필요
```

화면 컴포넌트는 항상 camelCase 도메인 타입만 본다 — 이것이 "화면이 저장소를 몰라도 되는" 원칙의 실제 구현.

---

## 9. Local ID와 Server UUID 전략

- Local(Guest) 신규 레코드는 클라이언트에서 UUID v4를 생성해 `id`로 사용한다(`crypto.randomUUID()`). Remote UUID와 충돌 가능성은 사실상 0이므로, **Guest→Remote 이전 시 로컬 ID를 그대로 서버 PK로 사용해도 무방**하다.
- 다만 이전 과정에서 이미 서버에 존재하는 레코드(예: 3개월 이내 복원 시나리오의 기존 서버 데이터)와 충돌 가능성이 있으므로, 이전 엔진은 항상 **"서버에 해당 ID가 이미 존재하면 신규 UUID를 재발급하고 로컬↔서버 ID 매핑 테이블을 유지"**하는 방식을 기본으로 한다. 상세는 `docs/MIGRATION_DESIGN.md` §3(로컬 ID ↔ 서버 UUID 매핑) 참고.

---

## 10. Schema Version / Local DB Migration

```typescript
// meta 테이블에 { key: 'schemaVersion', value: number } 저장
// Dexie의 this.version(N).stores(...).upgrade(tx => ...) 체인으로 마이그레이션 관리
// 앱 시작 시 LocalDB 오픈 → Dexie가 자동으로 버전 비교 후 upgrade 함수 실행
```

- Remote DB의 `supabase/migrations/` 순번 체계와는 별개로 로컬 스키마 버전을 관리한다(로컬은 클라이언트 배포 주기를 따르므로 서버 마이그레이션과 1:1 대응하지 않음).
- 로컬 스키마 변경 시 `docs/DESIGN.md`에도 버전 이력을 남긴다.

---

## 11. 날짜·타임존 처리

- 모든 날짜/시각은 Remote와 동일하게 **UTC ISO 8601 문자열**로 저장한다(Remote의 `timestamptz` 관례와 일치). 로컬 표시 시점에만 기기 타임존으로 변환.
- `next_review_at`처럼 날짜 연산이 반복 발생하는 필드는 Local/Remote 모두 동일한 계산 함수(`wordStatus.ts`의 `applyQuizAnswer` 로직)를 공유해야 한다 — Repository별로 계산 로직이 분기되면 Guest→Pro 이전 후 복습 스케줄이 어긋난다. 따라서 `applyQuizAnswer`는 Repository에 의존하지 않는 순수 함수로 유지하고, 호출부(화면/훅)가 결과를 Repository의 `saveStudyResult`/`updateWord`에 넘기는 구조를 유지한다(기존 설계 그대로 유지, 변경 불필요).

---

## 12. 트랜잭션 / 에러 처리 / 오프라인 / 캐시 정책

| 항목 | Local(IndexedDB) | Remote(Supabase) |
|---|---|---|
| 트랜잭션 | Dexie `db.transaction('rw', [...tables], async () => {...})` | RPC 함수 내 Postgres 트랜잭션(§4-2 `create_words_checked` 등) 또는 PostgREST 단건 요청 |
| 에러 처리 | 저장 실패 시 사용자에게 재시도 유도, 용량 부족(QuotaExceededError) 별도 안내 | 네트워크 오류/RLS 거부/RPC 예외를 구분해 사용자 메시지 매핑 |
| 오프라인 | Guest는 원래 오프라인 우선(로컬이 정본이므로 네트워크 불필요) | Pro/Premium/Master는 §25 동기화 정책의 오프라인 작업 큐 적용(MVP는 "오프라인 시 저장 실패 안내 + 재시도" 수준, 큐잉은 고도화 항목) |
| 캐시 정책 | 로컬이 정본이므로 별도 캐시 계층 불필요 | TanStack Query 캐시(기존 방식 유지), `staleTime`은 화면별 기존 값 유지 |

---

## 13. 데이터 내보내기 / 가져오기 (§20) ✅ 구현 완료(2026-07-19)

**스코프 컷**: `docs/UI_FLOW.md` §3 등급별 표에서 "가져오기"/"로컬 데이터 초기화"는 Guest에만 있고
Pro/Premium/Master는 "내보내기"만 있다 — Supabase가 이미 정본이라 별도 가져오기 UI가 필요 없기
때문. 그래서 **가져오기는 Guest(로컬) 전용으로만 구현**했다(`docs/DECISION_LOG.md` 2026-07-19).
구현: `web/src/lib/dataExport.ts`(`buildBackup`/`downloadJson`/`downloadWordsCsv`/`parseBackupFile`/
`importBackupToLocal`/`clearAllLocalData`), `web/src/pages/settings/SettingsPage.tsx`의 "데이터" 섹션.
Guest 쪽 전체 스냅샷은 Phase 15의 `readLocalSnapshot()`을 그대로 재사용, Remote(Pro/Premium/Master)
쪽은 Phase 16의 `remoteToLocalMigration.ts`와 동일한 패턴(직접 Supabase 조회)으로 모은다.
**Playwright 실브라우저 검증**: Guest로 단어장/단어 생성 → JSON 백업 다운로드 → 로컬 데이터 초기화
→ 방금 받은 백업 파일로 가져오기 → 원래 데이터가 그대로 복원됨을 IndexedDB에서 직접 확인, CSV
내보내기도 헤더/데이터 행 정확히 생성 확인, 콘솔 에러 0건. **한계**: Pro/Premium/Master의 "내보내기"는
실제 계정이 없어 직접 검증 못함(코드 리뷰로 정확성 신뢰).

### 13-1. 포맷

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-07-18T00:00:00.000Z",
  "wordbooks": [],
  "words": [],
  "studyHistory": [],
  "schedules": [],
  "settings": {}
}
```

- 형식: JSON 전체 백업(정본) + CSV 단어 목록(선택, 단어만 export하는 경량 옵션). 학습 기록/일정/설정 포함 여부는 체크박스로 선택.
- 녹음 파일은 용량 문제로 JSON에 포함하지 않고 별도 ZIP 옵션으로 분리(**제공 범위는 결정 필요**, §14) — 스피킹 기능 자체가 Phase 23 미착수라 이번 구현에서도 포함하지 않음.
- **구현 편차**: 위 샘플의 단일 `studyHistory` 배열 대신 실제로는 `studySessions`/`studyResults` 두 배열로 분리했다 — 가져오기 시 `session_id`/`word_id` 관계를 그대로 보존한 채 복원하려면 두 엔티티를 구분해서 다뤄야 하기 때문(`docs/DECISION_LOG.md` 2026-07-19).

### 13-2. 가져오기 처리 ✅ 구현 완료(Guest 전용, 2026-07-19)

```text
Schema Version 검증 — 미래 버전이면 거부, 과거 버전이면 마이그레이션 함수 체인 적용
중복 데이터 처리 — id 기준 존재 시 skip 또는 사용자 선택(덮어쓰기/건너뛰기)
손상 파일 처리 — JSON 파싱 실패 시 명확한 에러 메시지, 부분 데이터라도 파싱 가능한 범위까지 시도하지 않음(전체 거부가 안전)
대량 데이터 — 청크 단위 처리(docs/MIGRATION_DESIGN.md §7과 동일한 배치 전략 재사용)
Pro 단어 한도 초과 — 가져오기 대상이 Remote(Pro)인 경우 §5-1과 동일 규칙(초과분 포함 이전, 신규 등록만 차단)
Guest 로컬 저장 용량 부족 — 가져오기 전 사전 용량 추정 후 경고, 실패 시 부분 커밋 없이 롤백
```

**구현 편차**:
- 현재는 `schemaVersion` v1만 존재해 마이그레이션 체인은 아직 없음(향후 v2 도입 시 추가 필요, 코드에 주석으로 명시).
- 중복 데이터 처리는 "사용자 선택(덮어쓰기/건너뛰기)" 대신 **항상 덮어쓰기로 고정**했다 — Guest 백업 복원이라는 용도상 최신 백업으로 되돌리는 것이 자연스러운 기본 동작이라고 판단(`docs/DECISION_LOG.md` 2026-07-19). Dexie `bulkPut`이 "존재하면 덮어쓰기, 없으면 삽입"을 그대로 구현해준다.
- 대량 데이터 청크 처리는 필요 없었다 — Dexie `bulkPut`은 단일 호출로 대량 배열을 처리하므로 Guest(로컬) 가져오기에는 청크 분할이 애초에 불필요.
- Pro 단어 한도/Guest 저장 용량 부족 시나리오는 이번 범위에서 다루지 않는다 — 가져오기 자체가 Guest 전용으로 스코프가 좁혀졌기 때문(Remote 가져오기 UI 자체를 만들지 않음).

---

## 14. 결정 필요 항목

| 항목 | 비고 |
|---|---|
| Native SQLite Bridge로의 전환 시점 | §5 검증 결과에 따름 |
| 데이터 내보내기 시 녹음 파일 ZIP 제공 범위 | 전체/최근 N일/미제공 중 선택 |
| Storage Persistence API 요청 UX(사용자 동의 흐름) | 브라우저별 프롬프트 방식 상이 |
