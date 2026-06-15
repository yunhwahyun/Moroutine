import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useUserSettings } from '@/hooks/useUserSettings'
import type { UserSettings } from '@/types'

// ─── 상수 ─────────────────────────────────────────────────────

const APP_VERSION = '0.1.0'

const REVIEW_INTERVAL_OPTIONS = [
  { value: '1d',   label: '1일' },
  { value: '3d',   label: '3일' },
  { value: '7d',   label: '7일' },
  { value: '30d',  label: '30일' },
  { value: '365d', label: '365일' },
]

// ─── UI 공통 컴포넌트 ─────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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

function Row({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5 min-h-[52px]">
      <span className="text-sm text-gray-800">{label}</span>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}

function SegmentControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            value === opt.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
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

// ─── 닉네임 인라인 편집 ─────────────────────────────────────────

function NicknameRow({
  value,
  onSave,
}: {
  value: string | null
  onSave: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')

  const handleSave = () => {
    onSave(draft.trim())
    setEditing(false)
  }

  return (
    <div className="flex items-center justify-between px-4 py-3.5 min-h-[52px]">
      <span className="text-sm text-gray-800">닉네임</span>
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-gray-400 w-36"
          />
          <button onClick={handleSave} className="text-xs font-medium text-gray-900 px-2 py-1.5">저장</button>
          <button onClick={() => setEditing(false)} className="text-xs text-gray-400 px-1 py-1.5">취소</button>
        </div>
      ) : (
        <button onClick={() => { setDraft(value ?? ''); setEditing(true) }} className="flex items-center gap-2">
          <span className="text-sm text-gray-400">{value || '미설정'}</span>
          <span className="text-xs text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">편집</span>
        </button>
      )}
    </div>
  )
}

// ─── 복습 주기 체크박스 ─────────────────────────────────────────

function ReviewIntervalsRow({
  value,
  onChange,
}: {
  value: string[]
  onChange: (v: string[]) => void
}) {
  const toggle = (iv: string) => {
    if (value.includes(iv)) {
      if (value.length === 1) return  // 최소 1개는 선택 유지
      onChange(value.filter((v) => v !== iv))
    } else {
      // 자연 오름차순 유지
      const order = REVIEW_INTERVAL_OPTIONS.map((o) => o.value)
      onChange([...value, iv].sort((a, b) => order.indexOf(a) - order.indexOf(b)))
    }
  }

  return (
    <>
    <div className="flex items-center justify-between px-4 py-3.5 min-h-[52px]">
      <p className="text-sm text-gray-800">복습 주기</p>
      <div className="flex items-center gap-0.5">
        {REVIEW_INTERVAL_OPTIONS.map((opt) => {
          const checked = value.includes(opt.value)
          return (
            <button
              key={opt.value}
              onClick={() => toggle(opt.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                checked
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-500 border-gray-200'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
    <div className="px-4 py-3">
      <p className="text-xs text-gray-400 leading-relaxed">
        선택 순서대로 복습 단계가 됩니다 · 현재 {value.length}단계
      </p>
    </div>
    </>
  )
}

// ─── 페이지 ──────────────────────────────────────────────────────

export default function SettingsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { settings, update } = useUserSettings()

  const set = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) =>
    update({ [key]: value })

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  const handleDeleteAccount = async () => {
    if (!window.confirm('계정을 탈퇴하면 모든 데이터가 삭제됩니다. 계속하시겠습니까?')) return
    // 실제 탈퇴는 Edge Function 필요. 현재는 로그아웃만 처리
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex flex-col min-h-full bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white flex items-center justify-between px-4 pt-6 pb-4 border-b border-gray-100">
        <h1 className="text-lg font-bold text-gray-900">설정</h1>
        <button onClick={handleLogout} className="text-sm text-gray-500 font-medium px-3 py-1.5 rounded-lg border border-gray-200">
          로그아웃
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-8">

        {/* 계정 */}
        <Section title="계정">
          <NicknameRow
            value={settings.nickname}
            onSave={(v) => set('nickname', v || null)}
          />
          <Row label="이메일">
            <span className="text-sm text-gray-400">{user?.email ?? '-'}</span>
          </Row>
          <button
            onClick={handleDeleteAccount}
            className="w-full flex items-center px-4 py-3.5 min-h-[52px]"
          >
            <span className="text-sm text-red-500">회원탈퇴</span>
          </button>
        </Section>

        {/* 학습 */}
        <Section title="학습">
          <Row label="퀴즈 기본 모드">
            <SegmentControl
              value={settings.quizMode}
              options={[
                { value: 'multiple_choice', label: '객관식' },
                { value: 'short_answer', label: '주관식' },
              ]}
              onChange={(v) => set('quizMode', v)}
            />
          </Row>
          <Row label="문제 순서">
            <SegmentControl
              value={settings.questionOrder}
              options={[
                { value: 'random', label: '랜덤' },
                { value: 'asc', label: '오름차순' },
                { value: 'desc', label: '내림차순' },
              ]}
              onChange={(v) => set('questionOrder', v)}
            />
          </Row>
          <Row label="주관식 입력 방식">
            <SegmentControl
              value={settings.shortAnswerInput}
              options={[
                { value: 'keyboard', label: '키보드' },
                { value: 'voice', label: '음성' },
                { value: 'both', label: '둘 다' },
              ]}
              onChange={(v) => set('shortAnswerInput', v)}
            />
          </Row>
        </Section>

        {/* 복습 */}
        <Section title="복습">
          <ReviewIntervalsRow
            value={settings.reviewIntervals}
            onChange={(v) => set('reviewIntervals', v)}
          />
          <Row label="복습 정책">
            <SegmentControl
              value={settings.reviewPolicy}
              options={[
                { value: 'keep', label: '유지' },
                { value: 'downgrade', label: '강등' },
              ]}
              onChange={(v) => set('reviewPolicy', v)}
            />
          </Row>
          {settings.reviewPolicy === 'downgrade' && (
            <div className="px-4 py-3">
              <p className="text-xs text-gray-400 leading-relaxed">
                복습 실패 시 단계 강등<br />
                1차 실패 → 1차 재도전<br />
                2차 실패 → 1차로 강등<br />
                N차(≥3) 실패 → N-1차로 강등
              </p>
            </div>
          )}
        </Section>

        {/* 알림 */}
        <Section title="알림">
          <Row label="일정 알림">
            <Toggle
              value={settings.scheduleNotification}
              onChange={(v) => set('scheduleNotification', v)}
            />
          </Row>
          <Row label="복습 알림">
            <Toggle
              value={settings.reviewNotification}
              onChange={(v) => set('reviewNotification', v)}
            />
          </Row>
          {settings.reviewNotification && (
            <Row label="알림 시간">
              <input
                type="time"
                value={settings.reviewNotificationTime}
                onChange={(e) => set('reviewNotificationTime', e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-gray-400 bg-white w-36"
              />
            </Row>
          )}
        </Section>

        {/* 정보 */}
        <Section title="정보">
          <Row label="버전">
            <span className="text-sm text-gray-400">{APP_VERSION}</span>
          </Row>
          <button className="w-full flex items-center justify-between px-4 py-3.5 min-h-[52px]">
            <span className="text-sm text-gray-800">개인정보처리방침</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          <button className="w-full flex items-center justify-between px-4 py-3.5 min-h-[52px]">
            <span className="text-sm text-gray-800">오픈소스 라이선스</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </Section>

      </div>
    </div>
  )
}
