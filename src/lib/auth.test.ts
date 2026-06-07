import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Session } from '@supabase/supabase-js'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: vi.fn(),
      signOut: vi.fn(),
      exchangeCodeForSession: vi.fn(),
    },
  },
}))

vi.mock('@/tauri/auth', () => ({
  openUrl: vi.fn(),
  saveAuthSession: vi.fn(),
  loadAuthSession: vi.fn(),
  clearAuthSession: vi.fn(),
  onAuthCallback: vi.fn(),
}))

import { supabase } from '@/lib/supabase'
import { openUrl } from '@/tauri/auth'
import { signInWithOAuth, signOut, exchangeCode } from './auth'

describe('signInWithOAuth', () => {
  beforeEach(() => vi.clearAllMocks())

  it('opens the OAuth URL in system browser', async () => {
    vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValue({
      data: { provider: 'github', url: 'https://github.com/login/oauth/authorize?...' },
      error: null,
    } as any)

    await signInWithOAuth('github')

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'github',
      options: {
        redirectTo: 'swarmterm://auth/callback',
        skipBrowserRedirect: true,
      },
    })
    expect(openUrl).toHaveBeenCalledWith('https://github.com/login/oauth/authorize?...')
  })

  it('works for google provider', async () => {
    vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValue({
      data: { provider: 'google', url: 'https://accounts.google.com/o/oauth2/auth?...' },
      error: null,
    } as any)

    await signInWithOAuth('google')

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google' })
    )
    expect(openUrl).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/auth?...')
  })

  it('throws when supabase returns error', async () => {
    vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValue({
      data: { provider: 'github', url: null },
      error: { message: 'provider disabled' } as any,
    } as any)

    await expect(signInWithOAuth('github')).rejects.toMatchObject({ message: 'provider disabled' })
  })
})

describe('exchangeCode', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns session on success', async () => {
    const mockSession = { access_token: 'tok_abc', user: { id: 'u1' } } as Session
    vi.mocked(supabase.auth.exchangeCodeForSession).mockResolvedValue({
      data: { session: mockSession, user: mockSession.user },
      error: null,
    } as any)

    const result = await exchangeCode('pkce_code_123')

    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith('pkce_code_123')
    expect(result).toBe(mockSession)
  })

  it('throws when exchange fails', async () => {
    vi.mocked(supabase.auth.exchangeCodeForSession).mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'invalid code' } as any,
    } as any)

    await expect(exchangeCode('bad')).rejects.toMatchObject({ message: 'invalid code' })
  })
})

describe('signOut', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls supabase.auth.signOut', async () => {
    vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null })
    await signOut()
    expect(supabase.auth.signOut).toHaveBeenCalledOnce()
  })
})
