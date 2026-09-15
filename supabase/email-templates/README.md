# 이메일 템플릿

Moroutine이 보내는 메일 세 종류(Master 초대/로그인 링크/비밀번호 재설정)는 발송 경로가 다르다.

| 메일 | 발송 방식 | 템플릿 관리 위치 |
|---|---|---|
| Master 초대 | Edge Function이 Resend API 직접 호출 | 코드(`supabase/functions/_shared/masterInvite.ts`의 `sendInviteEmailViaResend`) — 배포하면 바로 반영됨 |
| 로그인 링크(Magic Link) | Supabase Auth가 커스텀 SMTP(Resend)로 발송 | Supabase Dashboard → Authentication → Email Templates(사용자가 직접 관리) |
| 비밀번호 재설정 | Supabase Auth가 커스텀 SMTP(Resend)로 발송 | Supabase Dashboard → Authentication → Email Templates(사용자가 직접 관리) |

## 디자인

셋 다 같은 카드형 레이아웃(테두리 박스 + Moroutine 로고 + 제목 + 본문 + 구분선 + 링크 버튼)을
쓰기로 했다(2026-09-15, `docs/DECISION_LOG.md` 참고) — Master 초대 메일의 실제 마크업은
`_shared/masterInvite.ts`의 `sendInviteEmailViaResend` 안에 있다. 로그인 링크/비밀번호 재설정은
사용자가 Supabase Dashboard에서 이미 같은 스타일로 직접 설정해뒀다(코드로 관리하지 않음).

**둘 중 하나의 디자인을 바꾸면 다른 쪽도 같이 맞춰야 한다** — 자동 동기화가 아니라 수동으로
챙겨야 하는 대상이다(`web/public/legal/*.md`가 `docs/legal/*.md`를 수동으로 따라가는 것과 같은
방식). 예전에 여기 있던 `magic-link.html`/`reset-password.html` 초안(단순한 디자인)은 이번
변경으로 실제 운영 중인 디자인과 달라져 삭제했다 — 필요하면 Supabase Dashboard에서 현재 설정을
그대로 내려받아 다시 채워두는 걸 권장한다.

## `config.toml` 기반 자동 배포를 안 쓰는 이유

`supabase config push`로 `config.toml`의 `[auth.email.template.*]`를 밀어 올리는 방법이 있긴 하지만,
이 프로젝트엔 `config.toml`이 없고(CLI 기반 워크플로우를 안 씀), 새로 만들어서 push하면 그 파일에
선언된 다른 모든 설정(OTP 길이, MFA, SMTP, site_url, rate limit 등)도 같이 밀어붙여서 현재 운영
중인 값을 실수로 되돌릴 위험이 크다(2026-09-15 `config pull --dry-run`으로 실제 원격 설정과 로컬
기본값이 14곳이나 다른 것을 확인함).
