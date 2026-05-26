/** localStorage key the sidebar visibility flag is persisted under. */
export const NAVBAR_VISIBILITY_STORAGE_KEY = 'cc-navbar-visible'

/** The visibility used on first run, before anything is persisted. */
export const DEFAULT_NAVBAR_VISIBLE = true

/** Minimal storage surface — lets tests pass a fake in place of localStorage. */
export interface NavbarVisibilityStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

/** Read the persisted visibility, defaulting for missing or invalid values. */
export function readStoredNavbarVisible(storage: NavbarVisibilityStorage): boolean {
  const raw = storage.getItem(NAVBAR_VISIBILITY_STORAGE_KEY)
  if (raw === 'true') return true
  if (raw === 'false') return false
  return DEFAULT_NAVBAR_VISIBLE
}

/** Persist the visibility as the literal string "true" / "false". */
export function storeNavbarVisible(storage: NavbarVisibilityStorage, visible: boolean): void {
  storage.setItem(NAVBAR_VISIBILITY_STORAGE_KEY, visible ? 'true' : 'false')
}
