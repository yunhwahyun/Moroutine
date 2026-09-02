import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/ui/Spinner'

type AuditLogEntry = {
  id: string
  actor_id: string | null
  action: string
  target_type: string | null
  target_id: string | null
  detail: Record<string, unknown> | null
  created_at: string
}

async function fetchAuditLog(): Promise<AuditLogEntry[]> {
  const { data, error } = await supabase
    .from('admin_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return data ?? []
}

// docs/ADMIN_DESIGN.md §4 — actor_id를 이메일로 조인하지 않고 그대로 표시(RPC 없이 최소 구현).
// actor_id가 NULL이면 사람이 아닌 Scheduled Function(retention-cleanup 등)이 실행한 것이다.
// 헤더/컨텐츠 너비/배경은 WordbookListPage.tsx와 통일(사용자·관리자 디자인 통일감, 2026-09-02).
export default function AdminAuditLogPage() {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['admin', 'audit-log'],
    queryFn: fetchAuditLog,
  })

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="bg-white flex items-center justify-between px-4 pt-6 pb-4 border-b border-gray-100">
        <h1 className="text-lg font-bold text-gray-900">감사 로그</h1>
        <span className="text-xs text-gray-400">최근 200건만 표시</span>
      </div>

      {/* 리스트 */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {isLoading && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}

        {!isLoading && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-1">
            <p className="text-gray-400 text-sm">기록이 없습니다</p>
          </div>
        )}

        {entries.map((entry) => (
          <div key={entry.id} className="bg-white rounded-2xl shadow-sm overflow-hidden px-4 py-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-900">{entry.action}</span>
              <span className="text-xs text-gray-400">{new Date(entry.created_at).toLocaleString('ko-KR')}</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              실행자: {entry.actor_id ?? '시스템 자동 실행'}
              {entry.target_type && ` · 대상: ${entry.target_type}${entry.target_id ? `(${entry.target_id})` : ''}`}
            </p>
            {entry.detail && (
              <pre className="text-xs text-gray-400 mt-2 bg-gray-50 rounded-lg p-2 overflow-x-auto">
                {JSON.stringify(entry.detail, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
