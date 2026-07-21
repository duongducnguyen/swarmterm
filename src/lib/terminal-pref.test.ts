import { describe, it, expect } from 'vitest'
import {
  KNOWN_SHELLS,
  DEFAULT_SHELL_ID,
  SHELL_STORAGE_KEY,
  readStoredShellId,
  storeShellId,
  visibleShells,
  platformShells,
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
  it('contains the Windows and unix shell ids', () => {
    const ids = KNOWN_SHELLS.map((s) => s.id)
    expect(ids).toEqual([
      'default',
      'powershell',
      'cmd',
      'pwsh',
      'git-bash',
      'wsl',
      'zsh',
      'bash',
      'fish'
    ])
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

describe('visibleShells', () => {
  it('shows only shells the backend probe reported available', () => {
    // A macOS probe: no PowerShell / cmd / WSL anywhere in the result.
    const macProbe = { default: true, zsh: true, bash: true, fish: false }
    const ids = visibleShells(macProbe).map((s) => s.id)
    expect(ids).toEqual(['default', 'zsh', 'bash'])
    expect(ids).not.toContain('powershell')
    expect(ids).not.toContain('wsl')
  })

  it('shows the Windows catalog on a Windows probe', () => {
    const winProbe = { default: true, powershell: true, cmd: true, pwsh: false, 'git-bash': true, wsl: false }
    expect(visibleShells(winProbe).map((s) => s.id)).toEqual([
      'default',
      'powershell',
      'cmd',
      'git-bash'
    ])
  })

  it('falls back to Default alone before the probe resolves', () => {
    // Empty map = "we do not know yet". Being pessimistic here is deliberate:
    // an optimistic default would flash the full Windows catalog on macOS,
    // which is the exact bug this function exists to prevent.
    expect(visibleShells({}).map((s) => s.id)).toEqual(['default'])
  })

  it('preserves catalog order regardless of probe key order', () => {
    const ids = visibleShells({ zsh: true, default: true, bash: true }).map((s) => s.id)
    expect(ids).toEqual(['default', 'zsh', 'bash'])
  })
})

describe('the shell catalog', () => {
  it('tags every entry with the platforms it can appear on', () => {
    const byId = Object.fromEntries(KNOWN_SHELLS.map((s) => [s.id, s]))
    expect(byId.powershell.platforms).toEqual(['windows'])
    expect(byId.cmd.platforms).toEqual(['windows'])
    expect(byId.wsl.platforms).toEqual(['windows'])
    expect(byId.zsh.platforms).toEqual(['macos', 'linux'])
    expect(byId.default.platforms).toEqual(['windows', 'macos', 'linux'])
  })
})

describe('platformShells', () => {
  it('keeps not-installed shells so Settings can explain what is missing', () => {
    // The probe reports every id it knows for the OS it was built for, with
    // `available` telling install state — fish here is known but not installed.
    const ids = platformShells({ default: true, zsh: true, bash: true, fish: false }).map((s) => s.id)
    expect(ids).toEqual(['default', 'zsh', 'bash', 'fish'])
  })

  it('still excludes shells the platform has no concept of', () => {
    const ids = platformShells({ default: true, zsh: true, bash: true, fish: false }).map((s) => s.id)
    expect(ids).not.toContain('powershell')
    expect(ids).not.toContain('wsl')
  })

  it('degrades to Default alone before the probe resolves', () => {
    expect(platformShells({}).map((s) => s.id)).toEqual(['default'])
  })
})
