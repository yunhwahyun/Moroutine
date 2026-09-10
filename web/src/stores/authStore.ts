import { create } from 'zustand'
import type { User, Session } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  session: Session | null
  isLoading: boolean
  // 비밀번호 재설정 이메일 링크로 세션이 확립된 경우에만 true — App.tsx의 AuthProvider가
  // supabase.auth.onAuthStateChange()의 'PASSWORD_RECOVERY' 이벤트를 보고 설정한다.
  // ResetPasswordPage가 이 값으로 "정말 재설정 링크를 타고 들어왔는지"를 판단한다(단순 세션 존재
  // 여부만으로는, 이미 로그인된 사용자가 URL을 직접 입력해 들어온 경우와 구분할 수 없다).
  isPasswordRecovery: boolean
  setSession: (session: Session | null) => void
  setLoading: (loading: boolean) => void
  setPasswordRecovery: (value: boolean) => void
  signOut: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  isLoading: true,
  isPasswordRecovery: false,
  setSession: (session) => set({ session, user: session?.user ?? null }),
  setLoading: (isLoading) => set({ isLoading }),
  setPasswordRecovery: (isPasswordRecovery) => set({ isPasswordRecovery }),
  signOut: () => set({ user: null, session: null, isPasswordRecovery: false }),
}))
