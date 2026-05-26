/** Available visual styles for the app. Extensible — today there is only one. */
export type Style = 'default'

/** The style used when nothing is persisted yet. */
export const DEFAULT_STYLE: Style = 'default'

/** localStorage key the style preference is persisted under. */
export const APPEARANCE_STORAGE_KEY = 'cc-appearance-style'

/** Minimal storage surface — lets tests pass a fake in place of localStorage. */
export interface AppearanceStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

/** All known style ids — used to validate persisted values. */
const KNOWN_STYLES: readonly Style[] = ['default'] as const

function isStyle(value: string | null): value is Style {
  return value !== null && (KNOWN_STYLES as readonly string[]).includes(value)
}

/** Read the persisted style, defaulting to DEFAULT_STYLE for missing/invalid values. */
export function readStoredStyle(storage: AppearanceStorage): Style {
  const raw = storage.getItem(APPEARANCE_STORAGE_KEY)
  return isStyle(raw) ? raw : DEFAULT_STYLE
}

/** Persist the chosen style. */
export function storeStyle(storage: AppearanceStorage, style: Style): void {
  storage.setItem(APPEARANCE_STORAGE_KEY, style)
}
