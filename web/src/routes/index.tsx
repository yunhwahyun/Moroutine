import { Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from '@/components/layout/ProtectedRoute'
import AppLayout from '@/components/layout/AppLayout'
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

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        {/* 하단 탭 레이아웃 */}
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/wordbooks" element={<WordbookListPage />} />
          <Route path="/schedules" element={<ScheduleListPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        {/* 전체화면 (탭 없음) */}
        <Route path="/learn" element={<LearnPage />} />
        <Route path="/quiz" element={<QuizPage />} />
        <Route path="/quiz/complete" element={<QuizCompletePage />} />
        <Route path="/wordbooks/:id" element={<WordbookDetailPage />} />
        <Route path="/schedules/new" element={<ScheduleFormPage />} />
        <Route path="/schedules/:id/edit" element={<ScheduleFormPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
