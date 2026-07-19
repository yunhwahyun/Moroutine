// RevenueCat Webhook 처리 Edge Function
// 스펙 원문: docs/SUBSCRIPTION_DESIGN.md §3-1, docs/API_SPEC.md
//
// 필요한 환경변수 (supabase secrets set 으로 등록):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — Supabase Edge Function 런타임이 기본 제공
//   REVENUECAT_WEBHOOK_TOKEN — RevenueCat 대시보드 Webhook 설정에 등록한 Authorization Bearer 토큰
//
// 실계정 준비 전까지는 코드 스캐폴딩 상태다. ENTITLEMENT_TO_PLAN 매핑은 실제 RevenueCat
// 대시보드에서 Entitlement/Product ID를 확정한 뒤 다시 확인해야 한다.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const GRACE_PERIOD_DAYS = 16 // docs/SUBSCRIPTION_DESIGN.md §10 확정값 (Google Play 기본값)
const RETENTION_MONTHS = 3

const ENTITLEMENT_TO_PLAN: Record<string, 'pro' | 'premium'> = {
  pro: 'pro',
  premium: 'premium',
}

type RevenueCatEvent = {
  id: string
  type: string
  app_user_id: string
  product_id?: string
  entitlement_ids?: string[]
  expiration_at_ms?: number
}

type SubscriptionRow = {
  id: string
  user_id: string
  plan_code: string
  status: string
  billing_retry_started_at: string | null
}

function resolvePlanCode(event: RevenueCatEvent): 'pro' | 'premium' | null {
  for (const id of event.entitlement_ids ?? []) {
    const mapped = ENTITLEMENT_TO_PLAN[id]
    if (mapped) return mapped
  }
  const productId = event.product_id ?? ''
  if (productId.includes('premium')) return 'premium'
  if (productId.includes('pro')) return 'pro'
  return null
}

function addDays(base: Date, days: number): string {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

function addMonths(base: Date, months: number): string {
  const d = new Date(base)
  d.setMonth(d.getMonth() + months)
  return d.toISOString()
}

async function findActiveSubscription(
  supabase: SupabaseClient,
  userId: string,
): Promise<SubscriptionRow | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['active', 'grace_period', 'billing_retry'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

// docs/DATA_RETENTION_DESIGN.md §2 — 3개월 이내 재구독 시 삭제 대상에서 제외한다.
async function cancelActiveRetention(supabase: SupabaseClient, userId: string) {
  const { error } = await supabase
    .from('retention_schedules')
    .update({ status: 'canceled' })
    .eq('user_id', userId)
    .eq('status', 'active')
  if (error) throw error
}

async function writeAuditLog(
  supabase: SupabaseClient,
  userId: string,
  eventType: string,
  beforeStatus: string | null,
  afterStatus: string | null,
  rawPayload: unknown,
) {
  const { error } = await supabase.from('subscription_audit_log').insert({
    user_id: userId,
    event_type: eventType,
    before_status: beforeStatus,
    after_status: afterStatus,
    raw_payload: rawPayload,
  })
  if (error) throw error
}

async function handleActivation(
  supabase: SupabaseClient,
  event: RevenueCatEvent,
  userId: string,
) {
  const planCode = resolvePlanCode(event)
  if (!planCode) {
    throw new Error(`cannot resolve plan_code from event: ${JSON.stringify(event)}`)
  }
  const currentPeriodEnd = event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null
  const existing = await findActiveSubscription(supabase, userId)

  if (existing && existing.plan_code !== planCode) {
    // 다른 요금제로 전환 — idx_subscriptions_user_active 충돌 방지를 위해 기존 행을 먼저 비활성 상태로 전이
    const { error: cancelError } = await supabase
      .from('subscriptions')
      .update({ status: 'canceled' })
      .eq('id', existing.id)
    if (cancelError) throw cancelError

    const { error: insertError } = await supabase.from('subscriptions').insert({
      user_id: userId,
      plan_code: planCode,
      status: 'active',
      provider: 'revenuecat',
      provider_subscription_id: event.app_user_id,
      current_period_end: currentPeriodEnd,
      billing_retry_started_at: null,
    })
    if (insertError) throw insertError
    await cancelActiveRetention(supabase, userId)
    return { beforeStatus: existing.status, afterStatus: 'active' }
  }

  if (existing && existing.plan_code === planCode) {
    const { error } = await supabase
      .from('subscriptions')
      .update({
        status: 'active',
        current_period_end: currentPeriodEnd,
        billing_retry_started_at: null,
        canceled_at: null,
      })
      .eq('id', existing.id)
    if (error) throw error
    await cancelActiveRetention(supabase, userId)
    return { beforeStatus: existing.status, afterStatus: 'active' }
  }

  const { error } = await supabase.from('subscriptions').insert({
    user_id: userId,
    plan_code: planCode,
    status: 'active',
    provider: 'revenuecat',
    provider_subscription_id: event.app_user_id,
    current_period_end: currentPeriodEnd,
  })
  if (error) throw error
  await cancelActiveRetention(supabase, userId)
  return { beforeStatus: null, afterStatus: 'active' }
}

async function handleBillingIssue(supabase: SupabaseClient, userId: string) {
  const existing = await findActiveSubscription(supabase, userId)
  if (!existing) return { beforeStatus: null, afterStatus: null }

  const { error } = await supabase
    .from('subscriptions')
    .update({
      status: 'billing_retry',
      billing_retry_started_at: existing.billing_retry_started_at ?? new Date().toISOString(),
    })
    .eq('id', existing.id)
  if (error) throw error
  return { beforeStatus: existing.status, afterStatus: 'billing_retry' }
}

async function handleGracePeriod(supabase: SupabaseClient, event: RevenueCatEvent, userId: string) {
  const existing = await findActiveSubscription(supabase, userId)
  if (!existing) return { beforeStatus: null, afterStatus: null }

  const gracePeriodEnd = event.expiration_at_ms
    ? new Date(event.expiration_at_ms).toISOString()
    : addDays(new Date(), GRACE_PERIOD_DAYS)

  const { error } = await supabase
    .from('subscriptions')
    .update({ status: 'grace_period', grace_period_end: gracePeriodEnd })
    .eq('id', existing.id)
  if (error) throw error
  return { beforeStatus: existing.status, afterStatus: 'grace_period' }
}

async function handleCancellation(supabase: SupabaseClient, userId: string) {
  const existing = await findActiveSubscription(supabase, userId)
  if (!existing) return { beforeStatus: null, afterStatus: null }

  const { error } = await supabase
    .from('subscriptions')
    .update({ canceled_at: new Date().toISOString() })
    .eq('id', existing.id)
  if (error) throw error
  return { beforeStatus: existing.status, afterStatus: existing.status }
}

async function handleTermination(
  supabase: SupabaseClient,
  userId: string,
  finalStatus: 'expired' | 'revoked',
) {
  const existing = await findActiveSubscription(supabase, userId)
  if (!existing) return { beforeStatus: null, afterStatus: null }

  const now = new Date()
  const retentionExpiresAt = addMonths(now, RETENTION_MONTHS)
  const { error } = await supabase
    .from('subscriptions')
    .update({
      status: finalStatus,
      expired_at: now.toISOString(),
      retention_expires_at: retentionExpiresAt,
      billing_retry_started_at: null,
    })
    .eq('id', existing.id)
  if (error) throw error

  // docs/DATA_RETENTION_DESIGN.md §2 — 만료/해지 시점에 삭제 스케줄 행을 생성한다.
  const { error: retentionError } = await supabase.from('retention_schedules').insert({
    user_id: userId,
    source: finalStatus === 'expired' ? 'subscription_expired' : 'subscription_revoked',
    source_ref_id: existing.id,
    retention_expires_at: retentionExpiresAt,
  })
  if (retentionError) throw retentionError

  return { beforeStatus: existing.status, afterStatus: finalStatus }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  const expectedToken = Deno.env.get('REVENUECAT_WEBHOOK_TOKEN')
  const authHeader = req.headers.get('authorization') ?? ''
  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return new Response('unauthorized', { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let body: { event: RevenueCatEvent }
  try {
    body = await req.json()
  } catch {
    return new Response('invalid json', { status: 400 })
  }

  const event = body?.event
  if (!event?.id || !event?.type || !event?.app_user_id) {
    return new Response('missing required event fields', { status: 400 })
  }

  // Idempotency: 이미 처리한 event.id면 아무 것도 하지 않고 200으로 응답
  const { error: idempotencyError } = await supabase
    .from('processed_webhook_events')
    .insert({ event_id: event.id, provider: 'revenuecat' })
  if (idempotencyError) {
    if (idempotencyError.code === '23505') {
      // unique_violation — 중복 이벤트, no-op
      return new Response('already processed', { status: 200 })
    }
    console.error('idempotency insert failed', idempotencyError)
    return new Response('internal error', { status: 500 })
  }

  const userId = event.app_user_id

  try {
    let result: { beforeStatus: string | null; afterStatus: string | null }

    switch (event.type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'UNCANCELLATION':
        result = await handleActivation(supabase, event, userId)
        break
      case 'BILLING_ISSUE':
        result = await handleBillingIssue(supabase, userId)
        break
      case 'GRACE_PERIOD':
        result = await handleGracePeriod(supabase, event, userId)
        break
      case 'CANCELLATION':
        result = await handleCancellation(supabase, userId)
        break
      case 'EXPIRATION':
        result = await handleTermination(supabase, userId, 'expired')
        break
      case 'REFUND':
      case 'REVOKE':
        result = await handleTermination(supabase, userId, 'revoked')
        break
      default:
        // 처리 대상이 아닌 이벤트 타입 — 감사 로그만 남기고 200
        result = { beforeStatus: null, afterStatus: null }
    }

    await writeAuditLog(supabase, userId, event.type, result.beforeStatus, result.afterStatus, body)
    return new Response('ok', { status: 200 })
  } catch (err) {
    console.error('revenuecat-webhook processing error', err)
    return new Response('internal error', { status: 500 })
  }
})
