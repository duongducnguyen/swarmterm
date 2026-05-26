/** Known shell ids the UI / backend agree on. `default` means platform default. */
export type ShellId =
  | 'default'
  | 'powershell'
  | 'cmd'
  | 'pwsh'
  | 'git-bash'
  | 'wsl'

/** UI-only metadata for a shell. Availability + paths come from the backend. */
export interface ShellMeta {
  id: ShellId
  label: string
  family: string
  promptSample: string
}

/** Catalog of every shell the UI knows how to render. Order = display order. */
export const KNOWN_SHELLS: readonly ShellMeta[] = [
  { id: 'default', label: 'default', family: 'platform', promptSample: '$ swarmterm' },
  { id: 'powershell', label: 'powershell', family: 'windows · 1', promptSample: 'PS C:\\>' },
  { id: 'cmd', label: 'cmd', family: 'command prompt', promptSample: 'C:\\Users\\>' },
  { id: 'pwsh', label: 'pwsh', family: 'powershell · 7', promptSample: 'PS >' },
  { id: 'git-bash', label: 'git bash', family: 'msys2', promptSample: 'MINGW64 ~$' },
  { id: 'wsl', label: 'wsl', family: 'linux', promptSample: 'user@distro:~$' }
] as const

/** The shell id used when nothing is persisted yet. */
export const DEFAULT_SHELL_ID: ShellId = 'default'

/** localStorage key the shell preference is persisted under. */
export const SHELL_STORAGE_KEY = 'cc-terminal-shell'

/** Minimal storage surface — lets tests pass a fake in place of localStorage. */
export interface ShellPrefStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

const KNOWN_IDS: readonly ShellId[] = KNOWN_SHELLS.map((s) => s.id) as readonly ShellId[]

function isShellId(value: string | null): value is ShellId {
  return value !== null && (KNOWN_IDS as readonly string[]).includes(value)
}

/** Read the persisted id, defaulting to DEFAULT_SHELL_ID for missing/invalid values. */
export function readStoredShellId(storage: ShellPrefStorage): ShellId {
  const raw = storage.getItem(SHELL_STORAGE_KEY)
  return isShellId(raw) ? raw : DEFAULT_SHELL_ID
}

/** Persist the chosen id. */
export function storeShellId(storage: ShellPrefStorage, id: ShellId): void {
  storage.setItem(SHELL_STORAGE_KEY, id)
}
