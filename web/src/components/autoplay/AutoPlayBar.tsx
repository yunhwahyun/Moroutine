import { PlayIcon, PauseIcon, PrevIcon, NextIcon } from '@/components/icons'

interface Props {
  term: string
  caption: string
  playing: boolean
  onToggle: () => void
  onNext: () => void
  onPrevious: () => void
}

// 음악 앱 스타일 미니 플레이어 — 자동재생 세션이 시작된 동안에만 렌더링된다(호출부에서 active로 감싼다).
export default function AutoPlayBar({ term, caption, playing, onToggle, onNext, onPrevious }: Props) {
  return (
    <div>
      <div className="flex justify-center">
        <div className="w-9 h-5 bg-gray-900 rounded-t-lg flex items-center justify-center -mb-px">
          <span className="text-gray-500 text-xs">▲</span>
        </div>
      </div>
      <div className="bg-gray-900 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-lg">
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm truncate">{term}</p>
          <p className="text-gray-400 text-xs truncate mt-0.5">{caption}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
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
