const LABELS = ['A', 'B', 'C', 'D']

interface Option {
  id: string
  definition: string
}

interface Props {
  options: Option[]
  selectedId: string | null
  correctId: string | null
  onSelect: (id: string) => void
  disabled: boolean
}

export default function AnswerOptions({
  options,
  selectedId,
  correctId,
  onSelect,
  disabled,
}: Props) {
  const getStyle = (id: string) => {
    if (!correctId) {
      // 아직 채점 전
      return selectedId === id
        ? 'border-gray-900 bg-gray-50'
        : 'border-gray-200 bg-white'
    }
    // 채점 후
    if (id === correctId) return 'border-green-500 bg-green-50'
    if (id === selectedId) return 'border-red-400 bg-red-50'
    return 'border-gray-100 bg-white opacity-50'
  }

  const getLabelStyle = (id: string) => {
    if (!correctId) {
      return selectedId === id ? 'text-gray-900 font-bold' : 'text-gray-400'
    }
    if (id === correctId) return 'text-green-600 font-bold'
    if (id === selectedId) return 'text-red-500 font-bold'
    return 'text-gray-300'
  }

  return (
    <div className="flex flex-col gap-3">
      {options.map((opt, i) => (
        <button
          key={opt.id}
          onClick={() => !disabled && onSelect(opt.id)}
          disabled={disabled}
          className={`flex items-center gap-3 p-4 rounded-lg border-2 text-left transition-all ${getStyle(opt.id)}`}
        >
          <span className={`text-sm font-bold w-5 shrink-0 ${getLabelStyle(opt.id)}`}>
            {LABELS[i]}
          </span>
          <span className={`text-sm ${!correctId && selectedId === opt.id ? 'text-gray-900 font-medium' : correctId && opt.id === correctId ? 'text-green-700 font-medium' : 'text-gray-700'}`}>
            {opt.definition}
          </span>
        </button>
      ))}
    </div>
  )
}
