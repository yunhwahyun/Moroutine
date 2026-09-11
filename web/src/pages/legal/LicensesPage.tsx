import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BackIcon } from '@/components/icons'
import Spinner from '@/components/ui/Spinner'

// scripts/generate-oss-licenses.mjs가 생성하는 web/public/licenses/oss-licenses.json을 그대로 읽어
// 렌더링한다. 이 페이지 자체는 어떤 라이선스 텍스트도 하드코딩하지 않는다 — 목록을 갱신하려면
// 문서를 직접 고치는 게 아니라 스크립트를 다시 실행해야 한다(README 참고).
type LicensePackage = {
  name: string
  version: string
  license: string | null
  author: string | null
  repository: string | null
  homepage: string | null
  licenseFileName: string | null
  licenseText: string | null
  licenseFileSourceNote: string | null
  noticeFileName: string | null
  noticeText: string | null
  apps: string[]
  note?: string
}

type LicenseData = {
  generatedAt: string
  totalCount: number
  licenseCounts: Record<string, number>
  packages: LicensePackage[]
}

const APP_LABEL: Record<string, string> = { web: '웹', mobile: '앱(모바일)' }

export default function LicensesPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<LicenseData | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/licenses/oss-licenses.json')
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status))
        return res.json()
      })
      .then((body) => {
        if (!cancelled) setData(body)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white px-4 pt-6 pb-4 border-b border-gray-100 flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="p-1 -ml-1 text-gray-600" aria-label="뒤로">
          <BackIcon />
        </button>
        <h1 className="text-lg font-bold text-gray-900">오픈소스 라이선스</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <p className="text-sm text-gray-600 leading-relaxed mb-4">
          Moroutine은 오픈소스 소프트웨어를 사용하고 있습니다.
          <br />
          각 소프트웨어의 저작권 및 라이선스는 해당 저작권자에게 있습니다.
        </p>

        {data === null && !error && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}
        {error && <p className="text-sm text-red-500 text-center py-10">목록을 불러오지 못했습니다.</p>}

        {data !== null && (
          <>
            <p className="text-xs text-gray-400 mb-3">총 {data.totalCount}개 패키지</p>
            <div className="flex flex-col gap-2">
              {data.packages.map((pkg) => (
                <details
                  key={`${pkg.name}@${pkg.version}`}
                  className="border border-gray-100 rounded-lg overflow-hidden [&_summary::-webkit-details-marker]:hidden"
                >
                  <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between gap-2 list-none">
                    <span className="text-sm text-gray-800 truncate">
                      {pkg.name} <span className="text-gray-400">{pkg.version}</span>
                    </span>
                    <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {pkg.license ?? 'UNKNOWN'}
                    </span>
                  </summary>
                  <div className="px-4 pb-4 pt-1 border-t border-gray-100 flex flex-col gap-2">
                    {pkg.author && <p className="text-xs text-gray-500">저작권: {pkg.author}</p>}
                    {pkg.repository && (
                      <p className="text-xs text-gray-500 break-all">저장소: {pkg.repository}</p>
                    )}
                    <p className="text-xs text-gray-400">
                      포함 위치: {pkg.apps.map((a) => APP_LABEL[a] ?? a).join(', ')}
                    </p>
                    {pkg.licenseFileSourceNote && (
                      <p className="text-xs text-amber-600">{pkg.licenseFileSourceNote}</p>
                    )}
                    {pkg.note && <p className="text-xs text-amber-600">{pkg.note}</p>}
                    {pkg.licenseText ? (
                      <pre className="whitespace-pre-wrap break-words font-sans text-xs text-gray-600 leading-relaxed bg-gray-50 rounded-md p-3 mt-1">
                        {pkg.licenseText}
                      </pre>
                    ) : (
                      <p className="text-xs text-gray-400">라이선스 전문을 확인할 수 없습니다.</p>
                    )}
                    {pkg.noticeText && (
                      <>
                        <p className="text-xs text-gray-500 mt-1">NOTICE</p>
                        <pre className="whitespace-pre-wrap break-words font-sans text-xs text-gray-600 leading-relaxed bg-gray-50 rounded-md p-3">
                          {pkg.noticeText}
                        </pre>
                      </>
                    )}
                  </div>
                </details>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
