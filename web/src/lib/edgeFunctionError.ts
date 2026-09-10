import { FunctionsHttpError } from '@supabase/supabase-js'

// supabase.functions.invoke()가 non-2xx 응답을 받으면 error.message는 항상 뭉뚱그린
// "Edge Function returned a non-2xx status code"만 담고 있다 — 우리 함수가 실제로 응답한 본문
// (예: "master 계정만 이 기능을 사용할 수 있습니다.")은 error.context(Response)에서 직접 읽어야 한다.
// docs/DECISION_LOG.md 2026-09-10 — 회원탈퇴 실패 시 이 뭉뚱그린 메시지가 그대로 알림창에
// 노출되던 문제에서 발견.
export async function getEdgeFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const text = await error.context.text()
      if (text) return text
    } catch {
      // 본문을 못 읽으면 fallback으로 진행
    }
    return fallback
  }
  return error instanceof Error && error.message ? error.message : fallback
}
