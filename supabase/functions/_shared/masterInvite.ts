// docs/MASTER_INVITATION_DESIGN.md §2~§4 — 2026-09-12부터 원래 설계(자체 토큰)로 복귀.
// 2026-07-18에 Supabase inviteUserByEmail()로 단순화했었는데, 그 방식은 "초대 발송" 시점에
// auth.users 계정이 즉시 생성돼(Supabase 자체 동작) 사용자가 수락하기도 전에 Supabase Dashboard의
// 회원 목록에 계정이 뜨는 문제가 있었다(2026-09-12 QA 발견). 이제는 우리가 직접 임의 토큰을
// 발급·해시 저장하고, 실제 계정(auth.users) 생성은 accept 시점(master-accept)에만 한다.
export const INVITE_TTL_DAYS = 7

// 로그인/비밀번호 재설정 링크(Supabase의 Email OTP Expiration 설정, 대시보드 확인값 3600초=1시간)
// 보다 초대 토큰 유효기간이 짧아지면 안 된다는 게 사용자 요구사항(2026-09-12) — 값이 바뀌어도
// 이 비교식이 항상 참이어야 한다.
const LOGIN_OTP_EXPIRATION_SECONDS = 3600
if (INVITE_TTL_DAYS * 24 * 60 * 60 <= LOGIN_OTP_EXPIRATION_SECONDS) {
  throw new Error('INVITE_TTL_DAYS must stay longer than the login/reset OTP expiration')
}

export function addDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

// URL-safe, 256비트 랜덤 토큰(base64url). UUID보다 엔트로피가 크고 하이픈이 없어 URL에 그대로 쓰기 좋다.
export function generateInviteToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// master_invitations.token_hash에 저장할 값 — 원문 토큰은 저장하지 않는다(테이블 코멘트 그대로 유지).
// Postgres 쪽 검증 RPC(check_master_invitation, 마이그레이션 50)도 동일하게
// encode(digest(p_token, 'sha256'), 'hex')를 쓰므로 인코딩을 맞춰야 한다.
export async function hashInviteToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function acceptUrl(token: string): string {
  const siteUrl = Deno.env.get('SITE_URL') ?? 'https://www.moroutine.kr'
  return `${siteUrl}/master/accept?token=${token}`
}

// Resend API를 직접 호출한다(2026-09-12 — Supabase Auth의 커스텀 SMTP 경유가 아니라 우리가 임의
// 내용의 메일을 직접 구성해서 보내야 해서, RESEND_API_KEY를 새 시크릿으로 등록해 직접 호출한다).
// 발신 주소는 Supabase SMTP 설정과 동일하게 맞춘다(docs/DECISION_LOG.md 2026-09-09 확인값).
const FROM_ADDRESS = 'Moroutine <noreply@moroutine.kr>'

export async function sendInviteEmailViaResend(
  email: string,
  token: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY가 설정되지 않았습니다.' }

  const url = acceptUrl(token)
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #111827;">Moroutine Master 초대</h2>
      <p style="color: #374151; line-height: 1.6;">
        Moroutine의 Master로 초대되었습니다. 아래 버튼을 눌러 가입을 완료해주세요.
      </p>
      <p style="text-align: center; margin: 32px 0;">
        <a href="${url}" style="background:#111827;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;">
          가입 완료하기
        </a>
      </p>
      <p style="color: #9ca3af; font-size: 12px;">
        이 링크는 ${INVITE_TTL_DAYS}일간 유효합니다. 본인이 요청하지 않았다면 이 메일을 무시하세요.
      </p>
    </div>
  `.trim()

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [email],
      subject: 'Moroutine Master 초대',
      html,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    return { ok: false, error: `Resend 발송 실패(${res.status}): ${body}` }
  }
  return { ok: true }
}

// 이미 가입된 이메일(재초대 등)에 매직 링크로 대체 발송하던 기존 폴백은 더 이상 쓰지 않는다 —
// 자체 토큰 방식에서는 "가입"이 accept 시점에만 일어나므로 auth.users에 미리 계정이 있을 이유가
// 없다(있다면 실제로 이미 정상 가입 완료된 사용자라는 뜻이라 초대 자체가 잘못된 요청이다).
