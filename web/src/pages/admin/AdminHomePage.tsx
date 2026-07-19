import { Link } from 'react-router-dom'

const SECTIONS = [
  { to: '/admin/wordbooks', title: '공용 단어장', description: 'Pro/Premium/Master가 열람하는 공용 콘텐츠 관리' },
  { to: '/admin/masters', title: 'Master 관리', description: '이메일 초대, 초대 목록, 권한 해제' },
  { to: '/admin/audit-log', title: '감사 로그', description: '관리자 작업 기록 조회(읽기 전용)' },
]

export default function AdminHomePage() {
  return (
    <div className="px-6 py-8">
      <div className="max-w-lg mx-auto flex flex-col gap-4">
        <h1 className="text-lg font-bold text-gray-900">관리자 홈</h1>
        {SECTIONS.map((section) => (
          <Link
            key={section.to}
            to={section.to}
            className="block border border-gray-100 rounded-lg px-4 py-4 hover:border-gray-300"
          >
            <p className="text-sm font-semibold text-gray-900">{section.title}</p>
            <p className="text-xs text-gray-400 mt-1">{section.description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
