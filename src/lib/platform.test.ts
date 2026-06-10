import { afterEach, describe, expect, it, vi } from 'vitest'
import { isMacPlatform } from './platform'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isMacPlatform', () => {
  it('returns true when navigator.platform is MacIntel', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: '' })
    expect(isMacPlatform()).toBe(true)
  })

  it('returns false when navigator.platform is Win32', () => {
    vi.stubGlobal('navigator', { platform: 'Win32', userAgent: '' })
    expect(isMacPlatform()).toBe(false)
  })

  it('falls back to userAgent when platform is empty', () => {
    vi.stubGlobal('navigator', {
      platform: '',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
    })
    expect(isMacPlatform()).toBe(true)
  })

  it('returns false when navigator is undefined', () => {
    vi.stubGlobal('navigator', undefined)
    expect(isMacPlatform()).toBe(false)
  })
})
