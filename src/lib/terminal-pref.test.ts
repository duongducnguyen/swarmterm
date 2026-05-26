import { describe, it, expect } from 'vitest'
import {
  KNOWN_SHELLS,
  DEFAULT_SHELL_ID,
  SHELL_STORAGE_KEY,
  readStoredShellId,
  storeShellId,
  type ShellPrefStorage
} from './terminal-pref'

function fakeStorage(initial: Record<string, string> = {}): ShellPrefStorage {
  const data: Record<string, string> = { ...initial }
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value
    }
  }
}

describe('KNOWN_SHELLS catalog', () => {
  it('contains the six v1 shell ids', () => {
    const ids = KNOWN_SHELLS.map((s) => s.id)
    expect(ids).toEqual(['default', 'powershell', 'cmd', 'pwsh', 'git-bash', 'wsl'])
  })

  it('every entry has a non-empty label and prompt sample', () => {
    for (const shell of KNOWN_SHELLS) {
      expect(shell.label.length).toBeGreaterThan(0)
      expect(shell.promptSample.length).toBeGreaterThan(0)
    }
  })
})

describe('DEFAULT_SHELL_ID', () => {
  it('is "default"', () => {
    expect(DEFAULT_SHELL_ID).toBe('default')
  })
})

describe('readStoredShellId', () => {
  it('returns DEFAULT_SHELL_ID when nothing is stored', () => {
    expect(readStoredShellId(fakeStorage())).toBe(DEFAULT_SHELL_ID)
  })

  it('returns DEFAULT_SHELL_ID for an unknown stored value', () => {
    expect(readStoredShellId(fakeStorage({ [SHELL_STORAGE_KEY]: 'banana' }))).toBe(DEFAULT_SHELL_ID)
  })

  it('returns the stored id when it is a known shell', () => {
    expect(readStoredShellId(fakeStorage({ [SHELL_STORAGE_KEY]: 'powershell' }))).toBe('powershell')
    expect(readStoredShellId(fakeStorage({ [SHELL_STORAGE_KEY]: 'git-bash' }))).toBe('git-bash')
  })
})

describe('storeShellId', () => {
  it('persists the id under the storage key', () => {
    const storage = fakeStorage()
    storeShellId(storage, 'wsl')
    expect(storage.getItem(SHELL_STORAGE_KEY)).toBe('wsl')
  })
})
