import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/tauri/auth', () => ({
  saveAuthSession: vi.fn(),
  loadAuthSession: vi.fn(),
  clearAuthSession: vi.fn(),
  openUrl: vi.fn(),
  onAuthCallback: vi.fn(),
}))

import * as tauriAuth from '@/tauri/auth'
import { authStorageAdapter } from './auth-storage'

describe('authStorageAdapter', () => {
  beforeEach(() => vi.clearAllMocks())

  it('getItem delegates to loadAuthSession with the key', async () => {
    vi.mocked(tauriAuth.loadAuthSession).mockResolvedValue('{"access_token":"abc"}')
    const result = await authStorageAdapter.getItem('sb-localhost-auth-token')
    expect(tauriAuth.loadAuthSession).toHaveBeenCalledWith('sb-localhost-auth-token')
    expect(result).toBe('{"access_token":"abc"}')
  })

  it('getItem returns null when key not found', async () => {
    vi.mocked(tauriAuth.loadAuthSession).mockResolvedValue(null)
    const result = await authStorageAdapter.getItem('missing')
    expect(result).toBeNull()
  })

  it('setItem delegates to saveAuthSession with key and value', async () => {
    vi.mocked(tauriAuth.saveAuthSession).mockResolvedValue(undefined)
    await authStorageAdapter.setItem('sb-localhost-auth-token', '{"access_token":"xyz"}')
    expect(tauriAuth.saveAuthSession).toHaveBeenCalledWith(
      'sb-localhost-auth-token',
      '{"access_token":"xyz"}'
    )
  })

  it('removeItem delegates to clearAuthSession with the key', async () => {
    vi.mocked(tauriAuth.clearAuthSession).mockResolvedValue(undefined)
    await authStorageAdapter.removeItem('sb-localhost-auth-token')
    expect(tauriAuth.clearAuthSession).toHaveBeenCalledWith('sb-localhost-auth-token')
  })
})
