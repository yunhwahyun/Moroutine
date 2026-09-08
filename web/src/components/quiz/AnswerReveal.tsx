import { renderLineBreaks } from '@/lib/text'
import { SpeakerIcon } from '@/components/icons'

interface Props {
  isCorrect: boolean
  correctDefinition: string
  example: string | null
  onSpeak?: () => void
  onSpeakExample?: () => void
}

export default function AnswerReveal({
  isCorrect,
  correctDefinition,
  example,
  onSpeak,
  onSpeakExample,
}: Props) {
  return (
    <div className={`rounded-xl p-4 ${isCorrect ? 'bg-green-50' : 'bg-red-50'}`}>
      {isCorrect ? (
        <p className="text-green-600 font-medium flex items-center gap-1.5">
          <span>✓</span> 정답입니다!
        </p>
      ) : (
        <div>
          <p className="text-red-500 font-medium flex items-center gap-1.5">
            <span>⊙</span> 아쉬워요
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-red-500 text-sm">정답: {correctDefinition}</p>
            {onSpeak && (
              <button
                onClick={onSpeak}
                className="text-red-400 hover:text-red-600 active:text-red-700 transition-colors"
                aria-label="발음 듣기"
              >
                <SpeakerIcon size={16} />
              </button>
            )}
          </div>
        </div>
      )}
      {isCorrect && example && (
        <p className="text-gray-600 text-sm mt-2">{renderLineBreaks(example)}</p>
      )}
      {isCorrect && example && onSpeakExample && (
        <button
          onClick={onSpeakExample}
          className="mt-2 flex items-center gap-1.5 text-green-500 hover:text-green-700 active:text-green-800 transition-colors text-sm"
          aria-label="예문 듣기"
        >
          <SpeakerIcon size={16} />
          <span>예문 듣기</span>
        </button>
      )}
    </div>
  )
}
