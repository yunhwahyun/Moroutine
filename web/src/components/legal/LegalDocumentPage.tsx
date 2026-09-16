import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { BackIcon } from '@/components/icons'
import Spinner from '@/components/ui/Spinner'

// docs/legal/*_PHASE1.md 전문을 보여주는 뷰어. 마크다운을 실제로 렌더링한다(제목/굵게/표 등) —
// 예전엔 마크다운 렌더러 없이 `<pre>`로 원문 텍스트를 그대로 찍어서 `**`/`#`/표 구분선(`|`, `---`)
// 같은 마크다운 기호가 화면에 그대로 보이는 문제가 있었다(사용자 리포트, 2026-09-16). 아직 게시
// 전이라 문서에 남아있는 `[확인 필요]` 같은 표시는 렌더링 후에도(백틱 → 인라인 코드 스타일로)
// 여전히 눈에 띄게 남아, 임의로 실값을 채워 넣지 않는다는 원래 의도는 그대로 유지된다.
// 실제 내용은 web/public/legal/*.md에 docs/legal 원문을 그대로 복사해 둔 것이다 — docs/legal 쪽이
// 갱신되면 이 사본도 함께 갱신해야 한다(웹 빌드 산출물은 docs/ 밖 파일을 직접 참조할 수 없음).

// react-markdown은 기본적으로 raw HTML을 실행하지 않고 그대로 이스케이프해서 문자 그대로
// 화면에 찍는다(`allowDangerousHtml` 미설정) — 문서 안의 `<!-- 주석 -->`(H1 제목 숨김용,
// docs/legal/*_PHASE1.md·web/public/legal/*.md 공통 패턴)이 안 숨겨지고 그대로 노출되는
// 문제가 있었다(사용자 리포트, 2026-09-16). rehype-raw로 raw HTML을 실제로 파싱하게 해도
// 되지만, 이 문서에서 실제로 쓰는 HTML은 주석뿐이라 그것만 처리하면 충분한데도 rehype-raw는
// HTML 파서(parse5 등)를 통째로 끌고 와서 지연 로딩 청크가 gzip 48KB→101KB로 두 배 넘게
// 커졌다 — 대신 마크다운 파서에 넘기기 전에 정규식으로 HTML 주석만 직접 제거한다.
function stripHtmlComments(markdown: string): string {
  return markdown.replace(/<!--[\s\S]*?-->/g, '')
}
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
          <div className="text-sm text-gray-700 leading-relaxed flex flex-col gap-3">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => <h1 className="text-lg font-bold text-gray-900 mt-2">{children}</h1>,
                h2: ({ children }) => <h2 className="text-base font-bold text-gray-900 mt-3">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-bold text-gray-900 mt-2">{children}</h3>,
                // 커먼마크 기본 규칙상 한 문단 안의 줄바꿈(개행 1개)은 공백으로 합쳐진다 —
                // ①②③④ 항목을 줄마다 나눠 적어도(2026-09-16, 사용자 수정) whitespace-pre-line
                // 없이는 화면에서 다시 한 줄로 붙어 보인다(직접 렌더링해 확인).
                p: ({ children }) => <p className="whitespace-pre-line">{children}</p>,
                strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                    {children}
                  </a>
                ),
                ul: ({ children }) => <ul className="list-disc pl-5 flex flex-col gap-1">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-5 flex flex-col gap-1">{children}</ol>,
                hr: () => <hr className="border-gray-100" />,
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-gray-200 pl-3 text-gray-500">{children}</blockquote>
                ),
                code: ({ children }) => (
                  <code className="bg-gray-100 text-gray-600 rounded px-1 py-0.5 text-xs">{children}</code>
                ),
                table: ({ children }) => (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">{children}</table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="border border-gray-200 bg-gray-50 px-2 py-1.5 text-left font-semibold text-gray-900">
                    {children}
                  </th>
                ),
                td: ({ children }) => <td className="border border-gray-200 px-2 py-1.5 align-top">{children}</td>,
              }}
            >
              {stripHtmlComments(text)}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}
