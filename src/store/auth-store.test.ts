import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Session, User } from '@supabase/supabase-js'

vi.mock('@/lib/auth', () => ({
  signInWithOAuth: vi.fn(),
  signOut: vi.fn(),
  exchangeCode: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}))

import { signInWithOAuth, signOut as authSignOut, exchangeCode } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './auth-store'

describe('auth-store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ status: 'idle', user: null, session: null, error: null })
  })

  describe('signIn', () => {
    it('sets status to loading while browser auth is pending', async () => {
      vi.mocked(signInWithOAuth).mockResolvedValue(undefined)
      await useAuthStore.getState().signIn('github')
      expect(useAuthStore.getState().status).toBe('loading')
    })

    it('sets status to error when signInWithOAuth throws', async () => {
      vi.mocked(signInWithOAuth).mockRejectedValue(new Error('network error'))
      await useAuthStore.getState().signIn('github')
      const state = useAuthStore.getState()
      expect(state.status).toBe('error')
      expect(state.error).toContain('network error')
    })
  })

  describe('handleCallback', () => {
    it('sets authenticated state on successful code exchange', async () => {
      const mockUser = { id: 'u1', email: 'user@example.com' } as User
      const mockSession = { access_token: 'tok_xyz', user: mockUser } as Session
      vi.mocked(exchangeCode).mockResolvedValue(mockSession)

      await useAuthStore.getState().handleCallback('pkce_code')

      const state = useAuthStore.getState()
      expect(state.status).toBe('authenticated')
      expect(state.user?.id).toBe('u1')
      expect(state.session?.access_token).toBe('tok_xyz')
      expect(state.error).toBeNull()
    })

    it('sets error status when exchange fails', async () => {
      vi.mocked(exchangeCode).mockRejectedValue(new Error('invalid PKCE code'))
      await useAuthStore.getState().handleCallback('bad_code')
      expect(useAuthStore.getState().status).toBe('error')
      expect(useAuthStore.getState().error).toContain('invalid PKCE code')
    })
  })

  describe('signOut', () => {
    it('resets to idle and clears user/session', async () => {
      useAuthStore.setState({
        status: 'authenticated',
        user: { id: 'u1' } as User,
        session: { access_token: 'tok' } as Session,
        error: null,
      })
      vi.mocked(authSignOut).mockResolvedValue(undefined)

      await useAuthStore.getState().signOut()

      const state = useAuthStore.getState()
      expect(state.status).toBe('idle')
      expect(state.user).toBeNull()
      expect(state.session).toBeNull()
    })
  })

  describe('hydrate', () => {
    it('restores authenticated state from stored session', async () => {
      const mockUser = { id: 'u2', email: 'stored@example.com' } as User
      const mockSession = { access_token: 'stored_tok', user: mockUser } as Session
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: mockSession },
        error: null,
      } as any)

      await useAuthStore.getState().hydrate()

      const state = useAuthStore.getState()
      expect(state.status).toBe('authenticated')
      expect(state.user?.id).toBe('u2')
      expect(state.session?.access_token).toBe('stored_tok')
    })

    it('stays idle when no stored session exists', async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      } as any)

      await useAuthStore.getState().hydrate()

      expect(useAuthStore.getState().status).toBe('idle')
      expect(useAuthStore.getState().user).toBeNull()
    })
  })
})
