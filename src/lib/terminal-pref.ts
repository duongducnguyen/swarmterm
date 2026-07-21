/** Known shell ids the UI / backend agree on. `default` means platform default. */
export type ShellId =
  | 'default'
  | 'powershell'
  | 'cmd'
  | 'pwsh'
  | 'git-bash'
  | 'wsl'
  | 'zsh'
  | 'bash'
  | 'fish'

/** Which OS families a catalog entry can ever appear on. */
export type ShellPlatform = 'windows' | 'macos' | 'linux'

/** UI-only metadata for a shell. Availability + paths come from the backend. */
export interface ShellMeta {
  id: ShellId
  label: string
  family: string
  promptSample: string
  /**
   * Documentation of where the entry belongs. The *runtime* filter is the
   * backend probe (see `visibleShells`) — this field exists so the catalog is
   * self-describing and so `platforms` can be asserted in tests, not so the
   * renderer can guess the platform itself.
   */
  platforms: readonly ShellPlatform[]
}

const WINDOWS_ONLY: readonly ShellPlatform[] = ['windows']
const UNIX_ONLY: readonly ShellPlatform[] = ['macos', 'linux']
const EVERYWHERE: readonly ShellPlatform[] = ['windows', 'macos', 'linux']

/** Catalog of every shell the UI knows how to render. Order = display order. */
export const KNOWN_SHELLS: readonly ShellMeta[] = [
  { id: 'default', label: 'Default', family: 'Platform', promptSample: '$ swarmterm', platforms: EVERYWHERE },
  { id: 'powershell', label: 'PowerShell', family: 'Windows', promptSample: 'PS C:\\>', platforms: WINDOWS_ONLY },
  { id: 'cmd', label: 'Command Prompt', family: 'Windows', promptSample: 'C:\\Users\\>', platforms: WINDOWS_ONLY },
  { id: 'pwsh', label: 'PowerShell 7', family: 'Cross-platform', promptSample: 'PS >', platforms: EVERYWHERE },
  { id: 'git-bash', label: 'Git Bash', family: 'MSYS2', promptSample: 'MINGW64 ~$', platforms: WINDOWS_ONLY },
  { id: 'wsl', label: 'WSL', family: 'Linux', promptSample: 'user@distro:~$', platforms: WINDOWS_ONLY },
  { id: 'zsh', label: 'zsh', family: 'POSIX', promptSample: '~ %', platforms: UNIX_ONLY },
  { id: 'bash', label: 'bash', family: 'POSIX', promptSample: '~ $', platforms: UNIX_ONLY },
  { id: 'fish', label: 'fish', family: 'POSIX', promptSample: '~ >', platforms: UNIX_ONLY }
] as const

/** `id -> available`, as reported by the backend `list_available_shells` probe. */
export type ShellAvailabilityMap = Partial<Record<string, boolean>>

/**
 * The catalog entries a shell picker should offer, in catalog order.
 *
 * The backend probe is the single source of truth: it only ever reports ids
 * that exist for the OS it was compiled for, so a macOS build simply never
 * mentions `powershell` and it drops out here. Note the deliberate asymmetry
 * with `isTemplateAvailable` (agents), which treats "unknown" as available: an
 * un-probed *agent* is a CLI that might be installed, but an un-probed *shell*
 * catalog would render Windows shells on macOS — so an empty map collapses to
 * `default` alone until the probe lands.
 */
export function visibleShells(available: ShellAvailabilityMap): readonly ShellMeta[] {
  return KNOWN_SHELLS.filter((s) => (s.id === 'default' ? true : available[s.id] === true))
}

/**
 * The catalog entries that belong to *this* platform, installed or not.
 *
 * The probe reports one entry per id it knows for the OS it was compiled for,
 * with `available` carrying install state — so mere presence of a key means
 * "this platform has such a shell". Settings uses this rather than
 * `visibleShells` because a greyed-out "fish — not detected" card is useful
 * guidance, whereas a greyed-out "WSL" card on macOS is just noise.
 */
export function platformShells(available: ShellAvailabilityMap): readonly ShellMeta[] {
  return KNOWN_SHELLS.filter((s) => s.id === 'default' || s.id in available)
}

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
