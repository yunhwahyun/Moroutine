import { isNative } from '@/bridge'
import { CalendarIcon, ClockIcon } from '@/components/icons'

interface NativeDateTimeInputProps {
  type: 'date' | 'time'
  value: string
  onChange: (value: string) => void
  className: string
}

// 앱(WebView)에서만 네이티브 아이콘을 지우고 공용 아이콘으로 통일한다 — 데스크톱/모바일 브라우저는
// 과거 이 CSS 레시피(appearance-none + ::-webkit-calendar-picker-indicator 제거)를 적용했다가
// 날짜/시간 값 자체가 안 보이는 문제가 있었던 반면(docs/DECISION_LOG.md 2026-09-08),
// 앱 WebView에서 실패한 적은 없어 isNative()로만 분기한다.
export default function NativeDateTimeInput({ type, value, onChange, className }: NativeDateTimeInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)

  if (!isNative()) {
    return <input type={type} value={value} onChange={handleChange} className={className} />
  }

  const Icon = type === 'date' ? CalendarIcon : ClockIcon
  return (
    <div className="relative">
      <input
        type={type}
        value={value}
        onChange={handleChange}
        className={`${className} native-datetime-input`}
        style={{ paddingRight: '2.25rem' }}
      />
      <Icon
        size={18}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
      />
    </div>
  )
}
