/** The app's two color themes. */
export type Theme = 'light' | 'dark'

/** localStorage key the theme preference is persisted under. */
export const THEME_STORAGE_KEY = 'cc-theme'

/** Minimal storage surface — lets tests pass a fake in place of localStorage. */
export interface ThemeStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

/** Minimal element surface — just the classList toggle the theme needs. */
export interface ThemeRoot {
  classList: { toggle: (token: string, force: boolean) => void }
}

/** The opposite theme — used by the toggle. */
export function nextTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark'
}

/** Read the persisted theme, defaulting to 'dark' for missing/invalid values. */
export function readStoredTheme(storage: ThemeStorage): Theme {
  return storage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
}

/** Persist the chosen theme. */
export function storeTheme(storage: ThemeStorage, theme: Theme): void {
  storage.setItem(THEME_STORAGE_KEY, theme)
}

/** Reflect the theme onto the document root by toggling the `dark` class. */
export function applyThemeClass(root: ThemeRoot, theme: Theme): void {
  root.classList.toggle('dark', theme === 'dark')
}
