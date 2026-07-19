import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import AdminLayout from '@/components/layout/AdminLayout'
import ProtectedRoute from '@/components/layout/ProtectedRoute'
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
import AdminHomePage from '@/pages/admin/AdminHomePage'
import AdminAuditLogPage from '@/pages/admin/AdminAuditLogPage'
import PublicWordbookListPage from '@/pages/public-wordbook/PublicWordbookListPage'
import PublicWordbookViewPage from '@/pages/public-wordbook/PublicWordbookViewPage'

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/*
        docs/UI_FLOW.md §0 — Guest(비로그인)도 접근 가능한 공개 라우트.
        화면 내부는 usePermissions()의 serviceTier로 Local/Remote를 분기한다(로그인 강제하지 않음).
      */}
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/wordbooks" element={<WordbookListPage />} />
        <Route path="/public-wordbooks" element={<PublicWordbookListPage />} />
        <Route path="/schedules" element={<ScheduleListPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="/learn" element={<LearnPage />} />
      <Route path="/quiz" element={<QuizPage />} />
      <Route path="/quiz/complete" element={<QuizCompletePage />} />
      <Route path="/wordbooks/:id" element={<WordbookDetailPage />} />
      <Route path="/public-wordbooks/:id" element={<PublicWordbookViewPage />} />
      <Route path="/schedules/new" element={<ScheduleFormPage />} />
      <Route path="/schedules/:id/edit" element={<ScheduleFormPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/master/accept" element={<MasterAcceptPage />} />

      <Route element={<ProtectedRoute requireRole="admin" />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<AdminHomePage />} />
          <Route path="/admin/masters" element={<AdminMastersPage />} />
          <Route path="/admin/wordbooks" element={<AdminWordbookListPage />} />
          <Route path="/admin/wordbooks/new" element={<AdminWordbookFormPage />} />
          <Route path="/admin/wordbooks/:id" element={<AdminWordbookDetailPage />} />
          <Route path="/admin/audit-log" element={<AdminAuditLogPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
