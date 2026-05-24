import { describe, it, expect, vi } from 'vitest'
import {
  applyThemeClass,
  nextTheme,
  readStoredTheme,
  storeTheme,
  THEME_STORAGE_KEY,
  type ThemeStorage
} from './theme'

/** An in-memory ThemeStorage backed by a plain object. */
function fakeStorage(initial: Record<string, string> = {}): ThemeStorage {
  const data: Record<string, string> = { ...initial }
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value
    }
  }
}

describe('nextTheme', () => {
  it('flips dark to light', () => {
    expect(nextTheme('dark')).toBe('light')
  })

  it('flips light to dark', () => {
    expect(nextTheme('light')).toBe('dark')
  })
})

describe('readStoredTheme', () => {
  it('reads a stored light theme', () => {
    expect(readStoredTheme(fakeStorage({ [THEME_STORAGE_KEY]: 'light' }))).toBe('light')
  })

  it('reads a stored dark theme', () => {
    expect(readStoredTheme(fakeStorage({ [THEME_STORAGE_KEY]: 'dark' }))).toBe('dark')
  })

  it('defaults to dark when nothing is stored', () => {
    expect(readStoredTheme(fakeStorage())).toBe('dark')
  })

  it('defaults to dark for an invalid stored value', () => {
    expect(readStoredTheme(fakeStorage({ [THEME_STORAGE_KEY]: 'banana' }))).toBe('dark')
  })
})

describe('storeTheme', () => {
  it('persists the theme under the storage key', () => {
    const storage = fakeStorage()
    storeTheme(storage, 'light')
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })
})

describe('applyThemeClass', () => {
  it('adds the dark class for the dark theme', () => {
    const toggle = vi.fn()
    applyThemeClass({ classList: { toggle } }, 'dark')
    expect(toggle).toHaveBeenCalledWith('dark', true)
  })

  it('removes the dark class for the light theme', () => {
    const toggle = vi.fn()
    applyThemeClass({ classList: { toggle } }, 'light')
    expect(toggle).toHaveBeenCalledWith('dark', false)
  })
})
