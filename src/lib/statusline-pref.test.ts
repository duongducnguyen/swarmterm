import { describe, it, expect } from 'vitest'
import {
  STATUSLINE_STORAGE_KEY,
  DEFAULT_STATUSLINE_ENABLED,
  readStoredStatuslineEnabled,
  storeStatuslineEnabled,
  type StatuslinePrefStorage
} from './statusline-pref'

function fakeStorage(initial: Record<string, string> = {}): StatuslinePrefStorage {
  const data: Record<string, string> = { ...initial }
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value
    }
  }
}

describe('statusline-pref', () => {
  it('defaults to enabled on first run', () => {
    expect(DEFAULT_STATUSLINE_ENABLED).toBe(true)
    expect(readStoredStatuslineEnabled(fakeStorage())).toBe(true)
  })

  it('reads a persisted false', () => {
    const storage = fakeStorage({ [STATUSLINE_STORAGE_KEY]: 'false' })
    expect(readStoredStatuslineEnabled(storage)).toBe(false)
  })

  it('reads a persisted true', () => {
    const storage = fakeStorage({ [STATUSLINE_STORAGE_KEY]: 'true' })
    expect(readStoredStatuslineEnabled(storage)).toBe(true)
  })

  it('falls back to the default for junk values', () => {
    const storage = fakeStorage({ [STATUSLINE_STORAGE_KEY]: 'yes please' })
    expect(readStoredStatuslineEnabled(storage)).toBe(DEFAULT_STATUSLINE_ENABLED)
  })

  it('round-trips through storage', () => {
    const storage = fakeStorage()
    storeStatuslineEnabled(storage, false)
    expect(readStoredStatuslineEnabled(storage)).toBe(false)
    storeStatuslineEnabled(storage, true)
    expect(readStoredStatuslineEnabled(storage)).toBe(true)
  })
})
