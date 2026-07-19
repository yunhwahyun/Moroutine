import type { LocalDataSummary, MigrationProgress } from '@/lib/migration/types'

// docs/UI_FLOW.md "Guest → Pro/Premium 전환 확인 모달", docs/MIGRATION_DESIGN.md §2 참고.
// 훅 인스턴스는 상위(GuestMigrationGate)가 소유하고, 이 컴포넌트는 순수하게 표시/콜백만 담당한다.
export default function GuestMigrationModal({
  summary,
  progress,
  onStart,
  onDeleteLocal,
  onClose,
}: {
  summary: LocalDataSummary
  progress: MigrationProgress
  onStart: () => void
  onDeleteLocal: () => void
  onClose: () => void
}) {
  const handleFinishKeepLocal = () => {
    onClose()
  }

  const handleFinishDeleteLocal = () => {
    onDeleteLocal()
  }

  const isBusy = progress.phase === 'in_progress' || progress.phase === 'verifying'
  const percent =
    progress.totalRecords > 0 ? Math.round((progress.processedRecords / progress.totalRecords) * 100) : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6">
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-sm bg-white rounded-2xl p-6 flex flex-col gap-4">
        {progress.phase === 'idle' && (
          <>
            <p className="text-base font-bold text-gray-900 text-center leading-relaxed">
              이 기기에 저장된 학습 데이터를
              <br />
              계정으로 이전하시겠습니까?
            </p>
            <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-600 text-center leading-relaxed">
              개인 단어장 {summary.wordbookCount}개 · 단어 {summary.wordCount}개
              <br />
              학습 기록 {summary.studyHistoryCount}건 · 복습 대상 {summary.reviewDueCount}개
              <br />
              일정 {summary.scheduleCount}건
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={onStart}
                className="w-full py-3.5 rounded-lg bg-gray-900 text-white text-sm font-medium"
              >
                계정으로 이전
              </button>
              <button
                onClick={handleFinishKeepLocal}
                className="w-full py-3.5 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium"
              >
                새로 시작
              </button>
              <button onClick={handleFinishKeepLocal} className="w-full py-2 text-gray-400 text-sm">
                나중에 하기
              </button>
            </div>
          </>
        )}

        {isBusy && (
          <>
            <p className="text-base font-bold text-gray-900 text-center">
              {progress.phase === 'verifying' ? '이전 결과 확인 중...' : '데이터를 이전하고 있어요'}
            </p>
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

        {progress.phase === 'completed' && (
          <>
            <p className="text-base font-bold text-gray-900 text-center">이전이 완료되었습니다</p>
            <p className="text-sm text-gray-500 text-center leading-relaxed">
              이 기기에 저장돼 있던 데이터는 그대로 두시겠습니까,
              <br />
              아니면 삭제하시겠습니까?
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={handleFinishKeepLocal}
                className="w-full py-3.5 rounded-lg bg-gray-900 text-white text-sm font-medium"
              >
                기기에는 그대로 두기
              </button>
              <button
                onClick={handleFinishDeleteLocal}
                className="w-full py-3.5 rounded-lg border border-gray-200 text-gray-700 text-sm font-medium"
              >
                기기 데이터 삭제
              </button>
            </div>
          </>
        )}

        {progress.phase === 'failed' && (
          <>
            <p className="text-base font-bold text-gray-900 text-center">이전에 실패했습니다</p>
            <p className="text-sm text-gray-500 text-center leading-relaxed">
              로컬 데이터는 안전하게 보존되어 있습니다.
              <br />
              {progress.errorMessage}
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={onStart}
                className="w-full py-3.5 rounded-lg bg-gray-900 text-white text-sm font-medium"
              >
                다시 시도
              </button>
              <button
                onClick={handleFinishKeepLocal}
                className="w-full py-2 text-gray-400 text-sm"
              >
                나중에 다시 하기
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
