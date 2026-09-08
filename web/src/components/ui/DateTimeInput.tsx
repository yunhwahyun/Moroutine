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

// 네이티브 <input type="date">/<input type="time">를 iOS/Android/데스크톱에서 동일하게 보이도록
// 재시도(1차 시도는 opacity로만 숨기다 iOS에서 내부 렌더링과 충돌해 되돌림, docs/DECISION_LOG.md
// 2026-09-08 참고). 이번엔 훨씬 표준적인 3단계로 고친다:
//  1) appearance-none — iOS의 기본 셰도우 DOM 스타일 자체를 초기화(가장 중요, 이게 없으면 이후
//     트릭이 안 먹는다).
//  2) ::-webkit-date-and-time-value — iOS가 기본으로 가운데 정렬 + 비정상 높이를 주는 내부 텍스트
//     요소를 왼쪽 정렬 + 최소 높이로 고정.
//  3) ::-webkit-calendar-picker-indicator를 opacity가 아니라 display:none으로 완전히 제거(Android의
//     자체 드롭다운 화살표까지 함께 없어진다) — 인디케이터가 사라져도 입력 영역 자체를 탭하면 여전히
//     네이티브 피커가 열린다.
const RESET_CLASS = `
  appearance-none box-border
  [&::-webkit-date-and-time-value]:text-left [&::-webkit-date-and-time-value]:min-h-[1em]
  [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none
`

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
          focus:border-gray-400 bg-white disabled:opacity-50 disabled:bg-gray-50 ${RESET_CLASS}
        `}
      />
      <Icon size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    </div>
  )
}
