import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { bridge, isNative, registerBridgeListener } from '@/bridge'
import { usePermissions } from '@/hooks/usePermissions'
import { useAppConfig } from '@/hooks/useAppConfig'
import { useAuthStore } from '@/stores/authStore'
import { useSubscriptionDowngrade } from '@/hooks/useSubscriptionDowngrade'
import { clearSignupPending, isSignupPending } from '@/lib/signupFlow'
import { BackIcon } from '@/components/icons'
import type { SubscriptionPlan } from '@/types'

// docs/SUBSCRIPTION_DESIGN.md §10 결정 필요 항목 — RevenueCat 실계정/스토어 상품이 아직 없어 실제
// 가격을 동적으로 가져올 방법이 없다(2026-07-19 결정: 플레이스홀더 텍스트로 표시, 실제 상품 확정 후 교체).
const PRO_PRICE_PLACEHOLDER = '월 ₩4,900 (예시 — 실제 스토어 가격 확정 전)'

async function fetchProPlan(): Promise<SubscriptionPlan | null> {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('code', 'pro')
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw error
  return data
}

type PurchaseState = 'idle' | 'processing' | 'success' | 'error'

// docs/UI_FLOW.md "요금제 비교 / 결제 진입" — Guest가 가입 유도 목적으로 진입. Free는 Guest의 실제
// 권한(GUEST_PERMISSIONS)을 그대로 보여주는 고정 카드, Pro만 subscription_plans에서 동적 로드한다
// (2026-09-02: Premium 티어 폐지, Pro만 유지 — docs/DECISION_LOG.md 2026-09-02).
export default function PricingPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { permissions } = usePermissions()
  const { paymentsEnabled } = useAppConfig()
  const tier = permissions?.serviceTier ?? 'guest'
  const [purchaseState, setPurchaseState] = useState<PurchaseState>('idle')
  const [purchaseError, setPurchaseError] = useState('')
  const { progress: downgradeProgress, start: startDowngrade } = useSubscriptionDowngrade()
  const showContinueFree = !!user && tier === 'guest' && isSignupPending()

  const { data: proPlan } = useQuery({ queryKey: ['subscription-plans', 'pro'], queryFn: fetchProPlan })

  useEffect(() => {
    return registerBridgeListener((msg) => {
      if (msg.type === 'PURCHASE_RESULT') {
        setPurchaseState(msg.payload.success ? 'success' : 'error')
        if (!msg.payload.success) setPurchaseError(msg.payload.error ?? '구매를 완료하지 못했습니다.')
      }
      if (msg.type === 'RESTORE_RESULT') {
        setPurchaseState(msg.payload.success ? 'success' : 'error')
        if (!msg.payload.success) setPurchaseError(msg.payload.error ?? '복원에 실패했습니다.')
      }
    })
  }, [])

  const handlePurchase = () => {
    if (!user) {
      navigate('/login')
      return
    }
    setPurchaseState('processing')
    bridge.requestPurchase({ planCode: 'pro' })
  }

  const handleRestore = () => {
    setPurchaseState('processing')
    bridge.restorePurchases()
  }

  // docs/TODO.md Phase 16 후속 — 회원가입 직후 강제 라우팅된 경우에만 노출되는 이탈구.
  // 성공(로컬 저장 완료)했을 때만 플래그를 지운다 — 실패 시에는 남겨 둬서 SignupPricingGate가
  // 계속 /pricing으로 되돌리고, 여기서 재시도할 수 있게 한다(DowngradeGate와 동일한 재시도 패턴).
  const handleContinueFree = () => {
    if (!user) return
    startDowngrade(user.id)
      .then((result) => { if (result.success) clearSignupPending() })
      .catch((err) => console.error('[signup continue free]', err))
  }

  const isProCurrent = tier === 'pro'
  // docs/SUBSCRIPTION_DESIGN.md §11 — 결제가 아직 없는 무료 출시 기간에는 구매 버튼 자체를 숨긴다
  // (사업자 등록 전 앱 심사에 결제 UI가 노출되지 않도록). 로그인 사용자는 이미 tier==='pro'라
  // isProCurrent가 true가 되어 어차피 버튼이 필요 없다 — 이 분기가 실질적으로 가리는 대상은
  // 아직 가입하지 않은 Guest뿐이다.
  const showProButton = paymentsEnabled && !isProCurrent && tier !== 'master' && tier !== 'admin'

  return (
    <div className="px-6 py-8" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)' }}>
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-gray-600 mb-4 -ml-1"
        aria-label="뒤로"
      >
        <BackIcon size={20} />
        뒤로
      </button>
      <h1 className="text-lg font-bold text-gray-900 mb-6">요금제 비교</h1>

      {!paymentsEnabled && (
        <div className="bg-gray-50 rounded-lg px-4 py-3 mb-4 text-sm text-gray-600">
          출시 기념으로 지금 가입하면 Pro 기능을 무료로 이용할 수 있어요!
        </div>
      )}

      {purchaseState === 'processing' && (
        <div className="bg-gray-50 rounded-lg px-4 py-3 mb-4 text-sm text-gray-600">처리 중이에요...</div>
      )}
      {purchaseState === 'success' && (
        <div className="bg-green-50 rounded-lg px-4 py-3 mb-4 text-sm text-green-700">Pro 구독이 완료되었습니다.</div>
      )}
      {purchaseState === 'error' && (
        <div className="bg-red-50 rounded-lg px-4 py-3 mb-4 text-sm text-red-600">{purchaseError}</div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {/* Free */}
        <div className="border border-gray-200 rounded-2xl p-5 flex flex-col gap-3">
          <div>
            <p className="text-base font-bold text-gray-900">
              Free
              {tier === 'guest' && <span className="ml-2 text-xs font-normal text-gray-400">현재 요금제</span>}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">무료</p>
          </div>
          <div className="flex flex-col gap-1.5 text-xs text-gray-600">
            <p>저장 위치: 이 기기에만 저장(다른 기기와 동기화 안 됨)</p>
            <p>개인 단어 한도: 무제한</p>
            <p>일괄 등록: 불가</p>
            <p>공용 단어장: 이용 불가</p>
          </div>
        </div>

        {/* Pro */}
        <div className="border border-gray-200 rounded-2xl p-5 flex flex-col gap-3">
          <div>
            <p className="text-base font-bold text-gray-900">
              Pro
              {isProCurrent && <span className="ml-2 text-xs font-normal text-gray-400">현재 요금제</span>}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">
              {paymentsEnabled ? PRO_PRICE_PLACEHOLDER : '무료 체험 중(출시 기념)'}
            </p>
          </div>
          <div className="flex flex-col gap-1.5 text-xs text-gray-600">
            <p>저장 위치: {proPlan?.sync_enabled ? '클라우드 저장(다른 기기에서도 동기화)' : '클라우드 저장'}</p>
            <p>
              개인 단어 한도:{' '}
              {proPlan ? (proPlan.personal_word_limit === null ? '무제한' : `${proPlan.personal_word_limit}개`) : '-'}
            </p>
            <p>일괄 등록: {proPlan?.bulk_import_enabled ? '가능' : '불가'}</p>
            <p>공용 단어장: {proPlan?.public_wordbook_enabled ? '이용 가능' : '이용 불가'}</p>
          </div>
          {showProButton && (
            isNative() ? (
              <button
                onClick={handlePurchase}
                disabled={purchaseState === 'processing'}
                className="w-full py-3 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
              >
                Pro 시작하기
              </button>
            ) : (
              <p className="text-xs text-gray-400 text-center py-2">모바일 앱에서 구독을 시작할 수 있어요.</p>
            )
          )}
          {!paymentsEnabled && !user && (
            <button
              onClick={() => navigate('/login')}
              className="w-full py-3 rounded-lg bg-gray-900 text-white text-sm font-medium"
            >
              무료로 회원가입하기
            </button>
          )}
        </div>
      </div>

      {paymentsEnabled && isNative() && (
        <button onClick={handleRestore} disabled={purchaseState === 'processing'} className="w-full mt-4 py-3 text-sm text-gray-400 disabled:opacity-50">
          구매 복원
        </button>
      )}

      {showContinueFree && (
        <div className="mt-6 border-t border-gray-100 pt-6">
          <p className="text-xs text-gray-400 text-center mb-3">
            지금 결제하지 않아도 이 기기에서 무료로 계속 사용할 수 있어요.
          </p>
          {downgradeProgress.phase === 'idle' && (
            <button
              onClick={handleContinueFree}
              className="w-full py-3 rounded-lg border border-gray-200 text-sm font-medium text-gray-600"
            >
              무료로 계속 사용하기
            </button>
          )}
          {(downgradeProgress.phase === 'in_progress' || downgradeProgress.phase === 'verifying') && (
            <p className="text-xs text-gray-400 text-center">데이터를 이 기기에 저장하는 중...</p>
          )}
          {downgradeProgress.phase === 'failed' && (
            <>
              <p className="text-xs text-red-500 text-center mb-2">{downgradeProgress.errorMessage}</p>
              <button
                onClick={handleContinueFree}
                className="w-full py-3 rounded-lg border border-gray-200 text-sm font-medium text-gray-600"
              >
                다시 시도
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
