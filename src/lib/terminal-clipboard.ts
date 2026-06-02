/**
 * Clipboard keyboard handling for the terminal, kept free of xterm and Tauri
 * imports so the decision logic is pure and unit-testable. The registry wires
 * the side effects (read/write clipboard, xterm selection) around it.
 */

/** The subset of a KeyboardEvent the decision needs. */
export interface KeyEventLike {
  type: string
  key: string
  ctrlKey: boolean
  metaKey: boolean
}

/** What the terminal should do with a key event. */
export type ClipboardAction = 'copy' | 'paste' | 'passthrough'

export interface ClipboardContext {
  /** Whether the terminal currently has a text selection. */
  hasSelection: boolean
  /** macOS uses Cmd (meta) for copy/paste and leaves Ctrl+C as SIGINT. */
  isMac: boolean
}

/**
 * Decide what a key event means for the clipboard. Mirrors VS Code's terminal:
 * Ctrl+C (Cmd+C on mac) copies only when there is a selection — otherwise it
 * passes through so the shell still receives SIGINT. Ctrl/Cmd+V always pastes.
 */
export function decideClipboardAction(
  event: KeyEventLike,
  ctx: ClipboardContext
): ClipboardAction {
  if (event.type !== 'keydown') return 'passthrough'

  const modifier = ctx.isMac ? event.metaKey : event.ctrlKey
  if (!modifier) return 'passthrough'

  const key = event.key.toLowerCase()
  if (key === 'c') return ctx.hasSelection ? 'copy' : 'passthrough'
  if (key === 'v') return 'paste'
  return 'passthrough'
}

/** True when running on macOS (Cmd-based copy/paste). */
export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  const platform = navigator.platform || ''
  if (platform) return /mac/i.test(platform)
  return /mac/i.test(navigator.userAgent || '')
}
