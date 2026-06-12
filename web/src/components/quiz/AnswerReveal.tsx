import { renderLineBreaks } from '@/lib/text'

interface Props {
  isCorrect: boolean
  correctDefinition: string
  description: string | null
}

export default function AnswerReveal({ isCorrect, correctDefinition, description }: Props) {
  return (
    <div
      className={`rounded-xl p-4 ${isCorrect ? 'bg-green-50' : 'bg-red-50'}`}
    >
      {isCorrect ? (
        <p className="text-green-600 font-medium flex items-center gap-1.5">
          <span>✓</span> 정답입니다!
        </p>
      ) : (
        <div>
          <p className="text-red-500 font-medium flex items-center gap-1.5">
            <span>⊙</span> 아쉬워요
          </p>
          <p className="text-red-500 text-sm mt-0.5">정답: {correctDefinition}</p>
        </div>
      )}
      {isCorrect && description && (
        <p className="text-gray-600 text-sm mt-2">{renderLineBreaks(description)}</p>
      )}
    </div>
  )
}
