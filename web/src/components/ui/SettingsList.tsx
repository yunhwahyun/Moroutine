// SettingsPage.tsx의 섹션/행 리스트 패턴 — 다른 화면(AdminMastersPage 등)과 디자인을 통일하기 위해
// 공용 컴포넌트로 분리(docs/DEVELOPMENT_RULES.md).
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 pt-5 pb-2">
        {title}
      </p>
      <div className="bg-white border-y border-gray-100 divide-y divide-gray-100">
        {children}
      </div>
    </div>
  )
}

export function Row({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5 min-h-[52px]">
      <span className="text-sm text-gray-800">{label}</span>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}
