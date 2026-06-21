/**
 * Click handling for terminal links, kept free of xterm and Tauri imports so the
 * decision is pure and unit-testable. The registry wires the side effect (open
 * the URL in the OS browser) around it.
 */

/** The subset of a MouseEvent the decision needs. */
export interface ClickModifiers {
  ctrlKey: boolean
  metaKey: boolean
}

/**
 * Whether a click on a terminal link should open it. Mirrors VS Code: follow on
 * Cmd+click (macOS) / Ctrl+click (Windows/Linux). A plain click returns false so
 * it falls through to xterm's text selection instead of opening a browser.
 */
export function shouldFollowLink(e: ClickModifiers, isMac: boolean): boolean {
  return isMac ? e.metaKey : e.ctrlKey
}
