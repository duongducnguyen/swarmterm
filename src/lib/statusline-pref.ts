/** localStorage key the Claude Code status line preference is persisted under. */
export const STATUSLINE_STORAGE_KEY = 'cc-claude-statusline'

/**
 * On by default: the status line is the only place a pane says whether Claude
 * actually reached our MCP server, and a setting you have to discover before it
 * can tell you something went wrong is a setting nobody turns on.
 */
export const DEFAULT_STATUSLINE_ENABLED = true

/** Minimal storage surface — lets tests pass a fake in place of localStorage. */
export interface StatuslinePrefStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

/** Read the persisted flag, defaulting for missing or invalid values. */
export function readStoredStatuslineEnabled(storage: StatuslinePrefStorage): boolean {
  const raw = storage.getItem(STATUSLINE_STORAGE_KEY)
  if (raw === 'true') return true
  if (raw === 'false') return false
  return DEFAULT_STATUSLINE_ENABLED
}

/** Persist the flag as the literal string "true" / "false". */
export function storeStatuslineEnabled(
  storage: StatuslinePrefStorage,
  enabled: boolean
): void {
  storage.setItem(STATUSLINE_STORAGE_KEY, enabled ? 'true' : 'false')
}
