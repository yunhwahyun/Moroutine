// 브라우저에서 직접 호출하는 master-* Edge Function 전용 CORS 헤더.
// revenuecat-webhook은 서버-서버 호출이라 필요 없었지만, 이 5개는 web 클라이언트가 직접 호출한다.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  return null
}
