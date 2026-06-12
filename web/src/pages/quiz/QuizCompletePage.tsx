import { useNavigate, useLocation } from 'react-router-dom'
import { CloseIcon } from '@/components/icons'

interface CompleteState {
  correctCount: number
  total: number
}

export default function QuizCompletePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state as CompleteState) ?? { correctCount: 0, total: 0 }
  const { correctCount, total } = state
  const rate = total > 0 ? Math.round((correctCount / total) * 100) : 0

  return (
    <div className="flex flex-col min-h-dvh bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="text-sm font-medium text-gray-900">학습 완료</span>
        <button onClick={() => navigate('/')} className="text-gray-400">
          <CloseIcon />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 gap-6">
        {/* Check icon */}
        <div className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12L10 17L19 8"
              stroke="#22C55E"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div className="text-center">
          <p className="text-xl font-bold text-gray-900">학습을 완료했어요!</p>
          <p className="text-gray-400 text-sm mt-1">수고하셨습니다</p>
        </div>

        {/* Stats */}
        <div className="w-full border border-gray-100 rounded-2xl p-5 flex justify-around">
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-1">정답률</p>
            <p className="text-2xl font-bold text-blue-600">{rate}%</p>
          </div>
          <div className="w-px bg-gray-100" />
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-1">완료</p>
            <p className="text-2xl font-bold text-gray-900">{total}개</p>
          </div>
        </div>
      </div>

      {/* Buttons */}
      <div className="px-4 pb-10 flex flex-col gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-full py-4 rounded-lg bg-gray-900 text-white text-sm font-medium"
        >
          다시 학습하기
        </button>
        <button
          onClick={() => navigate('/')}
          className="w-full py-4 rounded-lg border border-gray-200 text-gray-900 text-sm font-medium"
        >
          홈으로 돌아가기
        </button>
      </div>
    </div>
  )
}
