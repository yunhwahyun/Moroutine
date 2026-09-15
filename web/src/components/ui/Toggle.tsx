// SettingsPage.tsx에 있던 토글 스위치를 다른 화면(ScheduleListPage.tsx의 "종일" 등)과 디자인을
// 통일하기 위해 공용 컴포넌트로 분리(docs/DEVELOPMENT_RULES.md, docs/DECISION_LOG.md 2026-09-15).
export default function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={`relative w-11 h-6 rounded-full transition-colors ${value ? 'bg-gray-900' : 'bg-gray-200'}`}
    >
      <span
        className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
          value ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}
