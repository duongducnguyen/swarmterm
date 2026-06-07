import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { signInWithOAuth, signOut as authSignOut, exchangeCode } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'error'

interface AuthState {
  status: AuthStatus
  user: User | null
  session: Session | null
  error: string | null
  signIn: (provider: 'google' | 'github') => Promise<void>
  signOut: () => Promise<void>
  handleCallback: (code: string) => Promise<void>
  hydrate: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'idle',
  user: null,
  session: null,
  error: null,

  signIn: async (provider) => {
    set({ status: 'loading', error: null })
    try {
      await signInWithOAuth(provider)
      // Status stays 'loading' until handleCallback resolves via deep link.
    } catch (e) {
      set({ status: 'error', error: String(e) })
    }
  },

  signOut: async () => {
    await authSignOut()
    set({ status: 'idle', user: null, session: null, error: null })
  },

  handleCallback: async (code) => {
    set({ status: 'loading', error: null })
    try {
      const session = await exchangeCode(code)
      set({ status: 'authenticated', session, user: session.user, error: null })
    } catch (e) {
      set({ status: 'error', error: String(e) })
    }
  },

  hydrate: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      set({ status: 'authenticated', session, user: session.user })
    }
  },
}))
