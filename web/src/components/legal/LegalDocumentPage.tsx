import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BackIcon } from '@/components/icons'
import Spinner from '@/components/ui/Spinner'

// docs/legal/*_PHASE1.md 전문을 그대로 보여주는 뷰어. 마크다운 렌더러를 새로 들이는 대신, 게시
// 전 [확인 필요] 표시를 포함한 원문을 있는 그대로 보여준다(임의로 실값을 채워 넣지 않는다).
// 실제 내용은 web/public/legal/*.md에 docs/legal 원문을 그대로 복사해 둔 것이다 — docs/legal 쪽이
// 갱신되면 이 사본도 함께 갱신해야 한다(웹 빌드 산출물은 docs/ 밖 파일을 직접 참조할 수 없음).
export default function LegalDocumentPage({ title, src }: { title: string; src: string }) {
  const navigate = useNavigate()
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status))
        return res.text()
      })
      .then((body) => {
        if (!cancelled) setText(body)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [src])

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white px-4 pt-6 pb-4 border-b border-gray-100 flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="p-1 -ml-1 text-gray-600" aria-label="뒤로">
          <BackIcon />
        </button>
        <h1 className="text-lg font-bold text-gray-900">{title}</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {text === null && !error && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}
        {error && <p className="text-sm text-red-500 text-center py-10">문서를 불러오지 못했습니다.</p>}
        {text !== null && (
          <pre className="whitespace-pre-wrap break-words font-sans text-sm text-gray-700 leading-relaxed">
            {text}
          </pre>
        )}
      </div>
    </div>
  )
}
