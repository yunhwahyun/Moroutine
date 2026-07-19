# Moroutine — Claude Code 작업 규칙

## 문서 구조

모든 설계 문서는 `docs/` 디렉토리에 있다. 루트 `DESIGN.md`는 인덱스 파일이다.

| 파일 | 역할 |
|------|------|
| `docs/DESIGN.md` | **SSOT** — 아키텍처, 알고리즘, 폴더 구조 |
| `docs/PROJECT_STATUS.md` | 완료/진행중/다음 작업 현황 |
| `docs/DECISION_LOG.md` | 날짜별 설계 결정 이력 |
| `docs/DEVELOPMENT_RULES.md` | 개발 규칙 (보안, 코드 스타일, 상태관리) |
| `docs/DB_SCHEMA.md` | 전체 DDL + RLS + 마이그레이션 순서 |
| `docs/API_SPEC.md` | SelectionTarget + Edge Function 스펙 |
| `docs/UI_FLOW.md` | 화면 흐름, 라우팅, 각 화면 상세 |
| `docs/TODO.md` | Todo / Doing / Done |
| `docs/PERMISSION_DESIGN.md` | Guest/Pro/Premium/Master/Admin 권한 모델 (인증상태·역할·서비스권한 3축, `buildPermissions()`, RLS 판정 함수) |
| `docs/SUBSCRIPTION_DESIGN.md` | 구독 상태 머신, RevenueCat Webhook, Pro 단어 한도, 사용자 상태 전이 26종 |
| `docs/DATA_STORAGE_DESIGN.md` | Guest 로컬 저장(IndexedDB), Repository 계층(Local/Remote/Admin), Export/Import |
| `docs/MIGRATION_DESIGN.md` | Guest↔Remote 데이터 이전 엔진 (Idempotency/청크/롤백) |
| `docs/ADMIN_DESIGN.md` | 공용 단어장 CRUD, 관리자 접근 범위, 감사 로그 |
| `docs/MASTER_INVITATION_DESIGN.md` | Master 초대·해제 절차 및 보안 |
| `docs/DATA_RETENTION_DESIGN.md` | 3개월 데이터 보관·알림·삭제 파이프라인 |

> `docs/PERMISSION_DESIGN.md`~`docs/DATA_RETENTION_DESIGN.md` 7개 문서와 `docs/SPEAKING_DESIGN.md`(평가 기능 삭제 후 재작성)는 **2026-07-18 무료·유료·관리자 정책 전면 개편**의 산출물이다. 배경·범위는 `docs/DECISION_LOG.md` 2026-07-18 항목 참고. 코드 구현은 아직 착수 전이며, **다음 세션에서 이어갈 작업은 `docs/TODO.md`의 `Phase 11 — 권한 모델`부터**다(구현 순서는 `docs/PROJECT_STATUS.md`의 "Next — Phase 11 이후 구현 순서" 표 참고, Phase 11→12→13 순서로 의존관계가 있으므로 건너뛰지 말 것).

---

## 작업 규칙

1. `docs/DESIGN.md`를 단일 진실 소스(SSOT)로 사용한다.
2. 설계 변경 시 `docs/DESIGN.md`를 최신 상태로 갱신한다.
3. 주요 의사결정은 `docs/DECISION_LOG.md`에 날짜 + 이유와 함께 기록한다.
4. 작업 완료 시 `docs/PROJECT_STATUS.md`를 갱신한다.
5. 새로운 기능이 추가되면 `docs/TODO.md`를 갱신한다.
6. DB 변경 시 `docs/DB_SCHEMA.md`를 갱신한다.
7. API 변경 시 `docs/API_SPEC.md`를 갱신한다.
8. UI 흐름 변경 시 `docs/UI_FLOW.md`를 갱신한다.

---

## 작업 종료 보고 형식

모든 작업 완료 시 반드시 아래 형식으로 보고한다.

```
## Completed
* 완료된 작업 목록

## Changed Files
* 수정된 파일 목록

## Updated Docs
* 갱신된 문서 목록

## Next Recommended Task
* 다음 작업 추천
```

---

## 개발 규칙 요약 (상세는 docs/DEVELOPMENT_RULES.md 참고)

- `service_role` 키는 절대 웹앱/RN에 포함하지 않는다.
- 새 테이블 추가 시 RLS 4가지 정책 필수.
- 공용 컴포넌트(`EditIcon`, `Spinner` 등)는 반드시 `src/components/`에서 import.
- 서버 데이터 → TanStack Query / 로컬 상태 → Zustand.
- Phase 완료 후 즉시 `docs/PROJECT_STATUS.md` 갱신.

---

## 환경

- Node.js: **22.14.0** (nvm 사용, `.nvmrc` 파일 존재)
- mobile/ 작업 시 `source ~/.nvm/nvm.sh && nvm use 22.14.0` 선행 필요

---

## 언어

모든 답변은 한국어로 한다.
