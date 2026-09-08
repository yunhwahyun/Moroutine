import { CalendarIcon, ClockIcon } from '@/components/icons'

interface Props {
  type: 'date' | 'time'
  value: string
  onChange: (value: string) => void
  // 배치(flex 비율/너비 등)만 여기로 — 테두리/배경/패딩 등 입력창 자체의 모양은 컴포넌트가 고정으로
  // 그린다(그래야 아이콘과 함께 항상 같은 모양을 보장할 수 있다).
  wrapperClassName?: string
  disabled?: boolean
}

// 네이티브 <input type="date">/<input type="time">의 달력·시계 아이콘은 Android/iOS/데스크톱
// 브라우저마다 모양이 제각각이다 — 네이티브 피커 자체(탭했을 때 열리는 UI)는 그대로 두되, 닫힌
// 상태의 아이콘만 우리 아이콘으로 통일한다. 네이티브 picker-indicator는 투명하게 만들어 입력 전체를
// 덮게 하고(그래야 클릭 영역은 그대로 유지), 그 위에 우리 아이콘을 그린다.
export default function NativeDateTimeInput({ type, value, onChange, wrapperClassName = '', disabled }: Props) {
  const Icon = type === 'date' ? CalendarIcon : ClockIcon
  return (
    <div className={`relative ${wrapperClassName}`}>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`
          w-full min-w-0 border border-gray-200 rounded-lg pl-3 pr-8 py-2.5 text-sm outline-none
          focus:border-gray-400 bg-white disabled:opacity-50 disabled:bg-gray-50
          [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0
          [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full
          [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0
        `}
      />
      <Icon size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    </div>
  )
}
