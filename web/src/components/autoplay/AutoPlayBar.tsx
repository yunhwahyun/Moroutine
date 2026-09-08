import { useState } from 'react'
import { PlayIcon, PauseIcon, PrevIcon, NextIcon, CloseIcon } from '@/components/icons'
import { AUTOPLAY_MIN_RATE, AUTOPLAY_MAX_RATE } from '@/stores/autoplayStore'

interface Props {
  term: string
  caption: string
  index: number
  total: number
  playing: boolean
  rate: number
  onToggle: () => void
  onNext: () => void
  onPrevious: () => void
  onRateChange: (rate: number) => void
  onClose: () => void
}

const RATE_STEP = 0.1
const RATE_TICKS = (() => {
  const ticks: number[] = []
  for (let r = AUTOPLAY_MIN_RATE; r <= AUTOPLAY_MAX_RATE + 1e-9; r += RATE_STEP) {
    ticks.push(Math.round(r * 10) / 10)
  }
  return ticks
})()

// 음악 앱 스타일 미니 플레이어 — 자동재생 세션이 시작된 동안에만 렌더링된다(호출부에서 active로 감싼다).
export default function AutoPlayBar({
  term, caption, index, total, playing, rate, onToggle, onNext, onPrevious, onRateChange, onClose,
}: Props) {
  const [showSpeed, setShowSpeed] = useState(false)

  return (
    <div>
      <div className="flex justify-end mb-1">
        <button
          onClick={onClose}
          className="text-gray-900"
          aria-label="자동재생 숨기기"
        >
          <CloseIcon size={20} />
        </button>
      </div>

      {showSpeed && (
        <div className="bg-gray-900 rounded-2xl px-4 pt-3 pb-2.5 mb-2 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white text-sm font-semibold">배속</span>
            <button
              onClick={() => setShowSpeed(false)}
              className="text-gray-400 hover:text-white transition-colors"
              aria-label="배속 조절 닫기"
            >
              <span className="text-xs">▼</span>
            </button>
          </div>
          <input
            type="range"
            min={AUTOPLAY_MIN_RATE}
            max={AUTOPLAY_MAX_RATE}
            step={RATE_STEP}
            value={rate}
            onChange={(e) => onRateChange(Number(e.target.value))}
            className="w-full accent-white"
            aria-label="자동재생 배속"
          />
          <div className="flex justify-between mt-1 px-0.5">
            {RATE_TICKS.map((tick) => (
              <span
                key={tick}
                className={`text-[10px] ${Math.abs(tick - rate) < 0.05 ? 'text-white font-semibold' : 'text-gray-500'}`}
              >
                {tick.toFixed(1)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="bg-gray-900 rounded-2xl px-4 py-3 flex items-center gap-2 shadow-lg">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <p className="text-white font-bold text-sm truncate">{term}</p>
            <span className="text-gray-400 text-[11px] shrink-0">{index + 1}/{total}</span>
          </div>
          <p className="text-gray-400 text-xs truncate mt-0.5">{caption}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setShowSpeed((v) => !v)}
            className={`px-2 py-1 rounded-md border text-xs font-medium transition-colors ${
              showSpeed
                ? 'border-white text-white'
                : 'border-gray-600 text-gray-300 hover:text-white hover:border-gray-400'
            }`}
            aria-label="배속 조절"
          >
            {rate.toFixed(1)}x
          </button>
          <button
            onClick={onPrevious}
            className="p-2 text-gray-300 hover:text-white active:text-white transition-colors"
            aria-label="이전 단어"
          >
            <PrevIcon size={16} />
          </button>
          <button
            onClick={onToggle}
            className="p-2 text-white"
            aria-label={playing ? '일시정지' : '재생'}
          >
            {playing ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
          </button>
          <button
            onClick={onNext}
            className="p-2 text-gray-300 hover:text-white active:text-white transition-colors"
            aria-label="다음 단어"
          >
            <NextIcon size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
