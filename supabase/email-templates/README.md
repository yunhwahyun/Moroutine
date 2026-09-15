# 이메일 템플릿 (Supabase Dashboard 수동 동기화)

Moroutine이 보내는 메일 세 종류(Master 초대/로그인 링크/비밀번호 재설정)는 전부 같은 디자인
(`emailShell()`, `supabase/functions/_shared/masterInvite.ts`)을 쓴다. 다만 발송 경로가 다르다.

| 메일 | 발송 방식 | 템플릿 관리 위치 |
|---|---|---|
| Master 초대 | Edge Function이 Resend API 직접 호출 | 코드(`_shared/masterInvite.ts`의 `emailShell()`) — 배포하면 바로 반영됨 |
| 로그인 링크(Magic Link) | Supabase Auth가 커스텀 SMTP(Resend)로 발송 | `magic-link.html` → Supabase Dashboard에 수동 붙여넣기 |
| 비밀번호 재설정 | Supabase Auth가 커스텀 SMTP(Resend)로 발송 | `reset-password.html` → Supabase Dashboard에 수동 붙여넣기 |

## 왜 코드로 자동 배포하지 못하는가

`supabase config push`로 `config.toml`의 `[auth.email.template.*]`를 밀어 올리는 방법이 있긴 하지만,
이 프로젝트엔 `config.toml`이 없고(사업자용 CLI 워크플로우를 안 씀), 새로 만들어서 push하면
그 파일에 선언된 다른 모든 설정(OTP 길이, MFA, SMTP, site_url, rate limit 등)도 같이 밀어붙여서
현재 운영 중인 값을 실수로 되돌릴 위험이 크다(2026-09-15 `config pull --dry-run`으로 실제 원격
설정과 로컬 기본값이 14곳이나 다른 것을 확인함). 그래서 이 두 템플릿은 Dashboard에서 수동으로
관리한다.

## 적용 방법

1. Supabase Dashboard → Authentication → Email Templates
2. **Magic Link** 선택 → Message body에 `magic-link.html` 내용을 그대로 붙여넣기
3. **Reset Password** 선택 → Message body에 `reset-password.html` 내용을 그대로 붙여넣기
4. 제목(Subject)은 각각 자유롭게(예: "Moroutine 로그인 링크", "Moroutine 비밀번호 재설정")

## 디자인을 바꿀 때

`_shared/masterInvite.ts`의 `emailShell()`을 바꾸면, 이 두 파일도 같은 스타일로 같이 고치고
Dashboard에 다시 붙여넣어야 한다 — 자동 동기화가 아니다(`web/public/legal/*.md`가
`docs/legal/*.md`을 수동으로 따라가는 것과 같은 방식).
