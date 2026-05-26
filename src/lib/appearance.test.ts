import { describe, it, expect } from 'vitest'
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_STYLE,
  readStoredStyle,
  storeStyle,
  type AppearanceStorage
} from './appearance'

/** An in-memory AppearanceStorage backed by a plain object. */
function fakeStorage(initial: Record<string, string> = {}): AppearanceStorage {
  const data: Record<string, string> = { ...initial }
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value
    }
  }
}

describe('DEFAULT_STYLE', () => {
  it('is "default"', () => {
    expect(DEFAULT_STYLE).toBe('default')
  })
})

describe('readStoredStyle', () => {
  it('returns DEFAULT_STYLE when nothing is stored', () => {
    expect(readStoredStyle(fakeStorage())).toBe(DEFAULT_STYLE)
  })

  it('returns DEFAULT_STYLE for an unknown stored value', () => {
    expect(readStoredStyle(fakeStorage({ [APPEARANCE_STORAGE_KEY]: 'banana' }))).toBe(DEFAULT_STYLE)
  })

  it('returns the stored default style', () => {
    expect(readStoredStyle(fakeStorage({ [APPEARANCE_STORAGE_KEY]: 'default' }))).toBe('default')
  })
})

describe('storeStyle', () => {
  it('persists the style under the storage key', () => {
    const storage = fakeStorage()
    storeStyle(storage, 'default')
    expect(storage.getItem(APPEARANCE_STORAGE_KEY)).toBe('default')
  })
})
