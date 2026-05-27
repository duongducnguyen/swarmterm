import { describe, it, expect } from 'vitest'
import {
  DEFAULT_NAVBAR_VISIBLE,
  NAVBAR_VISIBILITY_STORAGE_KEY,
  readStoredNavbarVisible,
  storeNavbarVisible,
  type NavbarVisibilityStorage
} from './navbar-visibility'

/** An in-memory NavbarVisibilityStorage backed by a plain object. */
function fakeStorage(initial: Record<string, string> = {}): NavbarVisibilityStorage {
  const data: Record<string, string> = { ...initial }
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value
    }
  }
}

describe('DEFAULT_NAVBAR_VISIBLE', () => {
  it('is true (first-run users see the sidebar)', () => {
    expect(DEFAULT_NAVBAR_VISIBLE).toBe(true)
  })
})

describe('readStoredNavbarVisible', () => {
  it('returns DEFAULT_NAVBAR_VISIBLE when nothing is stored', () => {
    expect(readStoredNavbarVisible(fakeStorage())).toBe(DEFAULT_NAVBAR_VISIBLE)
  })

  it('returns DEFAULT_NAVBAR_VISIBLE for an invalid stored value', () => {
    expect(
      readStoredNavbarVisible(fakeStorage({ [NAVBAR_VISIBILITY_STORAGE_KEY]: 'banana' }))
    ).toBe(DEFAULT_NAVBAR_VISIBLE)
  })

  it('returns true when storage holds "true"', () => {
    expect(
      readStoredNavbarVisible(fakeStorage({ [NAVBAR_VISIBILITY_STORAGE_KEY]: 'true' }))
    ).toBe(true)
  })

  it('returns false when storage holds "false"', () => {
    expect(
      readStoredNavbarVisible(fakeStorage({ [NAVBAR_VISIBILITY_STORAGE_KEY]: 'false' }))
    ).toBe(false)
  })
})

describe('storeNavbarVisible', () => {
  it('persists true under the storage key', () => {
    const storage = fakeStorage()
    storeNavbarVisible(storage, true)
    expect(storage.getItem(NAVBAR_VISIBILITY_STORAGE_KEY)).toBe('true')
  })

  it('persists false under the storage key', () => {
    const storage = fakeStorage()
    storeNavbarVisible(storage, false)
    expect(storage.getItem(NAVBAR_VISIBILITY_STORAGE_KEY)).toBe('false')
  })
})
