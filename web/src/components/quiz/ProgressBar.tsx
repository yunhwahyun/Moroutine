interface Props {
  current: number
  total: number
}

export default function ProgressBar({ current, total }: Props) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
      <div
        className="h-full bg-gray-900 rounded-full transition-all duration-300"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}
