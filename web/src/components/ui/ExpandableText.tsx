import { useState } from 'react'

// 책 목차 내용 미리보기 — 관리자/개인 책장 상세 양쪽에서 표시 방식이 다르던 것을 통일한다
// (개인은 전체 노출, 관리자는 3줄 말줄임뿐이고 둘 다 펼치기 기능이 없었음). 기본은 한 줄
// 말줄임, 버튼으로 전체보기/한줄 보기를 토글한다(사용자 확정, docs/DECISION_LOG.md 2026-09-16).
export default function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  if (!text) return null
  return (
    <div className="mt-1">
      <p className={`text-xs text-gray-600 leading-relaxed ${expanded ? 'whitespace-pre-wrap' : 'truncate'}`}>
        {text}
      </p>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-xs text-gray-400 mt-0.5"
      >
        {expanded ? '한줄 보기' : '전체보기'}
      </button>
    </div>
  )
}
