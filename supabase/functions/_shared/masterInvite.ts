import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export const INVITE_TTL_DAYS = 7 // docs/MASTER_INVITATION_DESIGN.md §7 확정값(2026-07-18)

export function addDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

function isAlreadyRegisteredError(message: string | undefined): boolean {
  if (!message) return false
  return /already.*registered|already.*exists/i.test(message)
}

// docs/MASTER_INVITATION_DESIGN.md §2~§4 편차(2026-07-18): 자체 토큰 대신 Supabase 세션 인증으로 단순화.
// 신규 이메일은 inviteUserByEmail, 이미 가입된 이메일은 signInWithOtp(매직 링크)로 자동 폴백한다.
export async function sendInviteEmail(
  serviceClient: SupabaseClient,
  email: string,
  redirectTo: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(email, { redirectTo })
  if (!inviteError) return { ok: true }

  if (isAlreadyRegisteredError(inviteError.message)) {
    const { error: otpError } = await serviceClient.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    })
    if (!otpError) return { ok: true }
    return { ok: false, error: otpError.message }
  }
  return { ok: false, error: inviteError.message }
}

export function inviteRedirectTo(): string {
  const siteUrl = Deno.env.get('SITE_URL') ?? 'https://moroutine.vercel.app'
  return `${siteUrl}/master/accept`
}
