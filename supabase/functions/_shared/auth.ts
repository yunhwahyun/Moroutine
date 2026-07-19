import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

export function createServiceClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
}

export type CallerUser = { id: string; email: string }

// Authorization 헤더(호출자의 세션 JWT)로 호출자를 식별한다. service_role 클라이언트는 auth.uid()가
// 항상 NULL이라 "누가 호출했는지"를 알 수 없으므로, anon key + 호출자 헤더로 별도 클라이언트를 만들어
// auth.getUser()로 실제 신원을 확인한다.
export async function getCallerUser(req: Request): Promise<CallerUser | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return null

  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data, error } = await anonClient.auth.getUser()
  if (error || !data.user?.email) return null
  return { id: data.user.id, email: data.user.email }
}

// 호출자가 관리자인지 확인. 아니면 그대로 응답으로 쓸 수 있는 Response를 던진다.
export async function requireAdmin(req: Request, serviceClient: SupabaseClient): Promise<CallerUser> {
  const caller = await getCallerUser(req)
  if (!caller) throw new Response('unauthorized', { status: 401 })

  const { data, error } = await serviceClient.from('profiles').select('role').eq('id', caller.id).single()
  if (error || data?.role !== 'admin') throw new Response('forbidden', { status: 403 })
  return caller
}
