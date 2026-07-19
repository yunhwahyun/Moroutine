import type { MigrationProgress } from '@/lib/migration/types'

// docs/UI_FLOW.md "만료/Master 해제 → Guest 전환 안내" 목업 그대로 — 닫기/나중에 버튼은 없지만
// (닫기 불가, 로컬 이전 완료 전까지 다른 화면 이동 차단) 다운로드 시작 자체는 사용자가
// "지금 저장하고 계속하기"를 눌러야 시작한다(GuestMigrationModal과 동일하게 idle에서 대기).
export default function DowngradeModal({
  progress,
  onStart,
  onRetry,
}: {
  progress: MigrationProgress
  onStart: () => void
  onRetry: () => void
}) {
  const isBusy = progress.phase === 'in_progress' || progress.phase === 'verifying'
  const percent =
    progress.totalRecords > 0 ? Math.round((progress.processedRecords / progress.totalRecords) * 100) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-sm bg-white rounded-2xl p-6 flex flex-col gap-4">
        <p className="text-base font-bold text-gray-900 text-center leading-relaxed">
          유효한 구독이 없습니다.
          <br />
          데이터를 이 기기에 저장하고
          <br />
          무료로 계속 사용하시겠습니까?
        </p>

        {progress.phase === 'idle' && (
          <button
            onClick={onStart}
            className="w-full py-3.5 rounded-lg bg-gray-900 text-white text-sm font-medium"
          >
            지금 저장하고 계속하기
          </button>
        )}

        {isBusy && (
          <>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gray-900 transition-all duration-200"
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 text-center">
              {progress.processedRecords} / {progress.totalRecords}
            </p>
          </>
        )}

        {progress.phase === 'failed' && (
          <>
            <p className="text-sm text-gray-500 text-center leading-relaxed">
              네트워크 문제로 데이터를 옮기지 못했습니다.
              <br />
              계정 데이터는 안전하게 보존되어 있으니 다시 시도해 주세요.
              <br />
              {progress.errorMessage}
            </p>
            <button
              onClick={onRetry}
              className="w-full py-3.5 rounded-lg bg-gray-900 text-white text-sm font-medium"
            >
              다시 시도
            </button>
          </>
        )}

        {progress.phase === 'completed' && (
          <p className="text-sm text-gray-500 text-center leading-relaxed">
            이전이 완료되었습니다. 잠시 후 로컬 모드로 전환됩니다.
          </p>
        )}
      </div>
    </div>
  )
}
