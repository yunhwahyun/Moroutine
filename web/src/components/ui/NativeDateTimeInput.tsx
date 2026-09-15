import { isNative } from '@/bridge'

interface NativeDateTimeInputProps {
  type: 'date' | 'time'
  value: string
  onChange: (value: string) => void
  className: string
  // 부모 flex 행에서의 크기 배분(flex-*, min-w-0 등). 앱에서 wrapperClassName을 주면 input을
  // <div>로 한 번 감싸 그 값을 이 div에 준다 — flex 비율이 항상 의도한 대로(flex-[1] 등)
  // 고정되게 하기 위함(웹은 input에 직접 준다).
  wrapperClassName?: string
}

// 앱(WebView)에서는 네이티브 달력/시계 아이콘을 지운다(따로 공용 SVG 아이콘을 겹쳐 그리던
// 방식은 실기기에서 두 아이콘이 겹쳐 보이는 등 화면이 깨지는 문제가 있어 폐기 — 아이콘 없이
// 텍스트 값만 노출, docs/DECISION_LOG.md 2026-09-15). 데스크톱/모바일 브라우저는 과거 이
// CSS(appearance-none)를 적용했다가 날짜/시간 값 자체가 안 보이는 문제가 있었던 반면
// (docs/DECISION_LOG.md 2026-09-08), 앱 WebView에서 실패한 적은 없어 isNative()로만 분기한다.
export default function NativeDateTimeInput({
  type, value, onChange, className, wrapperClassName,
}: NativeDateTimeInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)
  const input = (
    <input
      type={type}
      value={value}
      onChange={handleChange}
      className={isNative() ? `${className} native-datetime-input` : className}
    />
  )
  return wrapperClassName ? <div className={wrapperClassName}>{input}</div> : input
}
