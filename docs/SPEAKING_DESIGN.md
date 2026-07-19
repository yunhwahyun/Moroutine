# Speaking Feature 설계

> 작성일: 2026-06-18 / **전면 개정: 2026-07-18** (AI 발음 평가 서비스 폐지)
> 이전 버전(Beta/Free/Premium 플랜, Azure Pronunciation Assessment 기반 평가)은 전량 폐기. 사유는 `docs/DECISION_LOG.md` 2026-07-18 항목 참고.
> 전제: `docs/PERMISSION_DESIGN.md`(3축 권한 모델), `docs/DATA_STORAGE_DESIGN.md`(Repository/Local DB).

---

## 1. 확정 범위

스피킹 기능은 아래로만 유지한다. **AI 발음 평가·점수·피드백·성장 그래프는 제공하지 않는다.**

```text
문장 등록
문장 보기
TTS 발음 듣기       (기존 useTTS 훅 그대로 재사용)
따라 말하기 녹음
내 녹음 재생
다시 녹음
```

스피킹 문장은 관리자가 배포하는 콘텐츠가 아니라 **사용자 개인 데이터**다. 단어장/단어와 동일하게 Guest는 로컬에, Pro/Premium/Master는 서버에 저장한다(`docs/DATA_STORAGE_DESIGN.md` §2). 이전 버전에 있던 "관리자 과제 배정(`speaking_tasks`)", "오늘의 과제", "Beta/Free/Premium 접근 제한"은 전부 폐지 — **모든 등급(Guest 포함)이 스피킹 기능을 사용할 수 있다.** 등급에 따라 달라지는 것은 오직 저장 위치(로컬 vs 서버)뿐이다.

---

## 2. IA 구조

```
Moroutine
├── 홈 (/)
├── 단어장 (/wordbooks)
├── 스피킹 (/speaking)
│   ├── SpeakingListPage        — 등록한 문장 목록 + 녹음 상태(미녹음/녹음완료)
│   ├── SpeakingSentenceFormPage — 문장 등록/수정
│   └── SpeakingRecordPage      — 문장 표시 + TTS + 녹음 컨트롤 + 내 녹음 재생
├── 일정 (/schedules)
└── 설정 (/settings)
```

**하단 탭 (5개, 유지)**

```
[ 홈 ]  [ 단어장 ]  [ 스피킹 ]  [ 일정 ]  [ 설정 ]
```

---

## 3. User Flow

```
스피킹 탭 진입 → SpeakingListPage (등록 문장 목록)
  ├── [+ 문장 등록] → SpeakingSentenceFormPage → 저장 → 목록 복귀
  └── 문장 탭 → SpeakingRecordPage
        상태 A: 미녹음
          [TTS 듣기]  [녹음 시작] → 녹음 중 → [녹음 중지] → 상태 B
        상태 B: 녹음 완료
          [TTS 듣기]  [내 녹음 듣기]  [다시 녹음]
          다시 녹음 → 기존 녹음 덮어쓰기(1문장 1녹음, 이력 없음)
```

---

## 4. 데이터 모델

### 4-1. Remote (Supabase) — Pro/Premium/Master

```sql
-- 마이그레이션 19(신규) — speaking_sentences
CREATE TABLE speaking_sentences (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text         text NOT NULL,
  translation  text,
  language     text NOT NULL DEFAULT 'en-US',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_speaking_sentences_user ON speaking_sentences(user_id, created_at DESC);

ALTER TABLE speaking_sentences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "speaking_sentences_select" ON speaking_sentences FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "speaking_sentences_insert" ON speaking_sentences FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "speaking_sentences_update" ON speaking_sentences FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "speaking_sentences_delete" ON speaking_sentences FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 마이그레이션 20(신규) — speaking_recordings (평가 없는 단순 녹음 메타)
CREATE TABLE speaking_recordings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sentence_id    uuid NOT NULL REFERENCES speaking_sentences(id) ON DELETE CASCADE,
  storage_path   text NOT NULL,
  mime_type      text,
    -- Web: 'audio/webm;codecs=opus' → .webm  /  Native: 'audio/m4a' → .m4a
  duration_ms    int,
  recorded_at    timestamptz NOT NULL DEFAULT now()
);
-- 문장당 녹음 1개 (다시 녹음 = UPSERT)
CREATE UNIQUE INDEX idx_speaking_recordings_sentence ON speaking_recordings(sentence_id);

ALTER TABLE speaking_recordings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "speaking_recordings_select" ON speaking_recordings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "speaking_recordings_insert" ON speaking_recordings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "speaking_recordings_update" ON speaking_recordings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "speaking_recordings_delete" ON speaking_recordings FOR DELETE TO authenticated USING (auth.uid() = user_id);
```

> **삭제된 테이블**: `pronunciation_evaluations`, `speaking_tasks`, `speaking_sessions`(과제 세션 개념 폐지) — 이전 버전에서 문서 계획으로만 존재했고 실제 마이그레이션 파일이 없었으므로 DROP 문 없이 계획 자체를 제거.

### 4-2. Local (Guest, IndexedDB)

`docs/DATA_STORAGE_DESIGN.md` §7의 `speakingSentences` / `speakingRecordings` / `recordingBlobs` Dexie 테이블을 그대로 사용. 필드 셋은 Remote와 동일(camelCase)하게 맞춘다.

### 4-3. Repository 반영

`DataRepository` 인터페이스(`docs/DATA_STORAGE_DESIGN.md` §6-1)에 스피킹 메서드를 추가한다.

```typescript
interface DataRepository {
  // ...기존 메서드
  getSpeakingSentences(): Promise<SpeakingSentence[]>
  createSpeakingSentence(input: CreateSpeakingSentenceInput): Promise<SpeakingSentence>
  updateSpeakingSentence(id: string, input: UpdateSpeakingSentenceInput): Promise<void>
  deleteSpeakingSentence(id: string): Promise<void>
  saveRecording(sentenceId: string, blob: Blob, meta: { mimeType: string; durationMs: number }): Promise<void>
  getRecording(sentenceId: string): Promise<{ blob: Blob; mimeType: string; durationMs: number } | null>
}
```

- 단어 등록과 달리 스피킹 문장에는 **Pro 한도 개념이 없다**(원문에 단어 총등록 수만 한도 대상으로 명시, 문장은 대상 아님). 필요 시 향후 별도 한도를 도입할 수 있으나 현재는 무제한.

---

## 5. Storage 구조 (Remote)

```
버킷명: speaking-recordings (private, authenticated 접근)

speaking-recordings/
└── {user_id}/
    └── {sentence_id}.webm   ← Web 경로 (덮어쓰기)
    └── {sentence_id}.m4a    ← Native Bridge 경로 (덮어쓰기)
```

Storage RLS는 기존 설계(§6 RLS 정책, 본인 폴더만 read/insert/update/delete)를 그대로 유지 — `docs/DB_SCHEMA.md`에 통합.

Guest는 Supabase Storage를 사용하지 않고 IndexedDB `recordingBlobs`에 Blob을 직접 저장한다(`docs/DATA_STORAGE_DESIGN.md` §3).

---

## 6. 녹음 정책

| 항목 | 정책 |
|---|---|
| 녹음 개수 | 문장당 1개 |
| 다시 녹음 | 기존 녹음 덮어쓰기(UPSERT, 이력 보관 안 함) |
| Guest 녹음 저장 위치 | 로컬 파일 시스템(IndexedDB Blob) |
| Pro/Premium/Master 녹음 저장 위치 | Supabase Storage |
| 오디오 포맷 | Web: `audio/webm;codecs=opus` → `.webm` / Native Bridge: `audio/m4a` → `.m4a` (MIME Type 처리 기존 설계 유지) |
| 녹음 파일 보관기간 | **결정 필요**(§9) — 평가 기능이 없어 이전 버전의 "7일 후 자동 삭제(Azure 비용 절감 목적)" 근거가 사라짐. 사용자가 자신의 녹음을 계속 듣고 싶어할 가능성이 높아 기본값은 "문장이 삭제될 때까지 보존"으로 잠정하되, Storage 비용 관리를 위한 TTL 재도입 여부는 별도 결정 |

---

## 7. WebView 녹음 환경 검증 (평가 관련 항목 제거)

`docs/DATA_STORAGE_DESIGN.md` §5(로컬 저장 검증)와 별개로, 녹음 자체의 사전 검증은 아래 6항목만 유지(기존 8항목 중 Azure 연동 관련 7~8번 삭제).

| # | 항목 | 검증 방법 | 기대 결과 |
|---|---|---|---|
| 1 | Android WebView MediaRecorder 사용 가능 여부 | 실기기에서 `getUserMedia` 호출 | Promise resolve + stream 획득 |
| 2 | iOS WKWebView MediaRecorder 사용 가능 여부 | 동일 | 동일 |
| 3 | WebM/Opus 포맷 지원 여부 | `MediaRecorder.isTypeSupported('audio/webm;codecs=opus')` | `true` |
| 4 | 마이크 권한 요청 정상 동작 | 최초 실행 시 권한 다이얼로그 노출 여부 | 시스템 권한 팝업 표시 |
| 5 | Android `onPermissionRequest` 동작 | `req => req.grant(req.resources)` 설정 후 테스트 | 권한 거부 없이 성공 |
| 6 | iOS `NSMicrophoneUsageDescription` 적용 | app.json 반영 후 EAS 빌드, 권한 요청 | 앱 이름+설명 포함 팝업 |

검증 실패(항목 1~2) 시 기존 설계의 §13 Native Bridge 폴백(아래 §8)으로 즉시 전환한다.

---

## 8. 네이티브 녹음 Bridge 폴백

이전 버전 §13 설계를 그대로 유지(Azure 연동과 무관한 순수 녹음 파이프라인이므로 변경 없음): `START_RECORDING`/`STOP_RECORDING`/`RECORDING_COMPLETE`/`RECORDING_ERROR` Bridge 메시지, `expo-av` + `expo-file-system` 기반 녹음, Signed Upload URL 방식. `web/src/types/bridge.ts`의 `BridgeOutbound`/`BridgeInbound`에 이 4개 메시지 타입을 추가하는 작업이 여전히 필요하다(§10 영향도 참고).

---

## 9. 결정 필요 항목

| 항목 | 비고 |
|---|---|
| 녹음 파일 보관기간(TTL 재도입 여부) | §6 참고 |
| 스피킹 문장 개수 제한 여부 | 현재 무제한 |

---

## 10. 영향도 요약

| 항목 | 상태 |
|---|---|
| 이전 버전 `speaking_tasks`/`speaking_sessions`/`pronunciation_evaluations` | 실제 마이그레이션 파일·코드 없음 → **문서에서만 제거, DB 작업 불필요** |
| `planStore.ts`(Beta/Free/Premium, `canUsePronunciationEvaluation` 등) | 미구현 상태였으므로 **작성 자체를 하지 않음**(원래 계획 폐기) |
| Azure 관련 Edge Function/환경변수 | 미구현 상태 → 폐기 |
| `web/src/types/bridge.ts` | `START_RECORDING`/`STOP_RECORDING`/`RECORDING_COMPLETE`/`RECORDING_ERROR` 신규 추가 필요(§8) — 이 부분만 실제 코드 작업 대상 |
| `web/src/hooks/useTTS.ts`, `useSpeechRecognition.ts` | 변경 없음, 그대로 재사용 |
