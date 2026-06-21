// Generic "open a URL/path in the OS default app" bridge. Thin re-export of the
// Tauri opener plugin so callers (terminal link clicks, auth flows) depend on the
// src/tauri/* IPC surface rather than importing the plugin directly.
export { openUrl } from '@tauri-apps/plugin-opener'
