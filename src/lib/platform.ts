/**
 * Platform detection for the renderer, kept free of Tauri imports so it stays
 * unit-testable. macOS drives several differences: Cmd-based shortcuts,
 * Cmd-based clipboard, and the native traffic-light titlebar overlay.
 */

/** True when running on macOS. */
export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  const platform = navigator.platform || ''
  if (platform) return /mac/i.test(platform)
  return /mac/i.test(navigator.userAgent || '')
}
