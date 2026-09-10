import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import AdminLayout from '@/components/layout/AdminLayout'
import ProtectedRoute from '@/components/layout/ProtectedRoute'
import UserRouteGuard from '@/components/layout/UserRouteGuard'
import PublicContentGuestGuard from '@/components/layout/PublicContentGuestGuard'
import LoginPage from '@/pages/auth/LoginPage'
import HomePage from '@/pages/home/HomePage'
import LearnPage from '@/pages/learn/LearnPage'
import QuizPage from '@/pages/quiz/QuizPage'
import QuizCompletePage from '@/pages/quiz/QuizCompletePage'
import WordbookListPage from '@/pages/wordbook/WordbookListPage'
import WordbookDetailPage from '@/pages/wordbook/WordbookDetailPage'
import ScheduleListPage from '@/pages/schedule/ScheduleListPage'
import ScheduleFormPage from '@/pages/schedule/ScheduleFormPage'
import SettingsPage from '@/pages/settings/SettingsPage'
import PricingPage from '@/pages/pricing/PricingPage'
import MasterAcceptPage from '@/pages/master/MasterAcceptPage'
import AdminMastersPage from '@/pages/master/AdminMastersPage'
import AdminWordbookListPage from '@/pages/admin/AdminWordbookListPage'
import AdminWordbookFormPage from '@/pages/admin/AdminWordbookFormPage'
import AdminWordbookDetailPage from '@/pages/admin/AdminWordbookDetailPage'
import AdminAuditLogPage from '@/pages/admin/AdminAuditLogPage'
import PublicWordbookListPage from '@/pages/public-wordbook/PublicWordbookListPage'
import PublicWordbookViewPage from '@/pages/public-wordbook/PublicWordbookViewPage'
import BookshelfListPage from '@/pages/bookshelf/BookshelfListPage'
import BookDetailPage from '@/pages/bookshelf/BookDetailPage'
import PublicBookListPage from '@/pages/public-book/PublicBookListPage'
import PublicBookViewPage from '@/pages/public-book/PublicBookViewPage'
import AdminBookListPage from '@/pages/admin/AdminBookListPage'
import AdminBookFormPage from '@/pages/admin/AdminBookFormPage'
import AdminBookDetailPage from '@/pages/admin/AdminBookDetailPage'
import PrivacyPolicyPage from '@/pages/legal/PrivacyPolicyPage'
import TermsPage from '@/pages/legal/TermsPage'

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/*
        docs/UI_FLOW.md §0 — Guest(비로그인)도 접근 가능한 공개 라우트.
        화면 내부는 usePermissions()의 serviceTier로 Local/Remote를 분기한다(로그인 강제하지 않음).
        docs/ADMIN_DESIGN.md §2 — 관리자는 UserRouteGuard가 /admin/wordbooks로 되돌려보낸다.
      */}
      <Route element={<UserRouteGuard />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/wordbooks" element={<WordbookListPage />} />
          <Route path="/schedules" element={<ScheduleListPage />} />
          <Route path="/books" element={<BookshelfListPage />} />
        </Route>
        <Route path="/learn" element={<LearnPage />} />
        <Route path="/quiz" element={<QuizPage />} />
        <Route path="/quiz/complete" element={<QuizCompletePage />} />
        <Route path="/wordbooks/:id" element={<WordbookDetailPage />} />
        <Route path="/books/:id" element={<BookDetailPage />} />
        <Route path="/schedules/new" element={<ScheduleFormPage />} />
        <Route path="/schedules/:id/edit" element={<ScheduleFormPage />} />
        <Route path="/pricing" element={<PricingPage />} />

        {/*
          docs/launch/PHASE1_POLICY.md §8(B안) — 공용 단어장/책장은 메뉴 비노출뿐 아니라 Guest의
          URL 직접 접근도 라우트 레벨에서 차단한다(PublicContentGuestGuard).
        */}
        <Route element={<PublicContentGuestGuard />}>
          <Route element={<AppLayout />}>
            <Route path="/public-wordbooks" element={<PublicWordbookListPage />} />
            <Route path="/public-books" element={<PublicBookListPage />} />
          </Route>
          <Route path="/public-wordbooks/:id" element={<PublicWordbookViewPage />} />
          <Route path="/public-books/:id" element={<PublicBookViewPage />} />
        </Route>
      </Route>

      {/* /settings는 사용자/관리자 공유 라우트 — UserRouteGuard 밖에 둔다. */}
      <Route element={<AppLayout />}>
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      {/* 개인정보처리방침/이용약관 — 비로그인 포함 누구나 열람 가능(가입 전 열람 필요, docs/launch/PHASE1_POLICY.md §5). */}
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/terms" element={<TermsPage />} />

      <Route path="/master/accept" element={<MasterAcceptPage />} />

      <Route element={<ProtectedRoute requireRole="admin" />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<Navigate to="/admin/wordbooks" replace />} />
          <Route path="/admin/masters" element={<AdminMastersPage />} />
          <Route path="/admin/wordbooks" element={<AdminWordbookListPage />} />
          <Route path="/admin/wordbooks/new" element={<AdminWordbookFormPage />} />
          <Route path="/admin/wordbooks/:id" element={<AdminWordbookDetailPage />} />
          <Route path="/admin/books" element={<AdminBookListPage />} />
          <Route path="/admin/books/new" element={<AdminBookFormPage />} />
          <Route path="/admin/books/:id" element={<AdminBookDetailPage />} />
          <Route path="/admin/audit-log" element={<AdminAuditLogPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
