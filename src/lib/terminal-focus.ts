/**
 * Keyboard-focus policy: in a terminal app the shell owns the keyboard, so DOM
 * focus must fall back to the active terminal whenever it lands on app chrome.
 *
 * Without this, focus silently parks on a tab / navbar item / pane root — all
 * of which dnd-kit makes focusable (`tabIndex: 0` on its drag nodes) — and every
 * keystroke is dropped. Worse, Tab (pressed constantly for shell completion) is
 * a browser focus-navigation key, so it walks the focus ring across the tab
 * titles instead of reaching the pty.
 */

/** The bits of `document.activeElement` the decision needs — keeps it testable without a DOM. */
export interface FocusedElementInfo {
  tagName: string
  isContentEditable: boolean
  /** Sits inside an open menu / dialog / popover, which owns focus while it lives. */
  inOverlay: boolean
}

/** Elements that legitimately hold the keyboard: the user is typing into them. */
const EDITABLE_TAGS = ['INPUT', 'TEXTAREA', 'SELECT']

/** Overlays that manage their own focus — Radix menus, dialogs, popovers. */
export const OVERLAY_SELECTOR =
  '[role="menu"],[role="dialog"],[role="listbox"],[data-radix-popper-content-wrapper]'

/** True when keyboard focus should be handed back to the active terminal. */
export function shouldReturnFocus(focused: FocusedElementInfo | null): boolean {
  if (focused === null) return true
  if (focused.inOverlay) return false
  if (focused.isContentEditable) return false
  return !EDITABLE_TAGS.includes(focused.tagName.toUpperCase())
}

/** DOM adapter for `shouldReturnFocus` — the only part that touches the document. */
export function describeFocusedElement(element: Element | null): FocusedElementInfo | null {
  if (element === null) return null
  return {
    tagName: element.tagName,
    isContentEditable: element instanceof HTMLElement && element.isContentEditable,
    inOverlay: element.closest(OVERLAY_SELECTOR) !== null
  }
}

/**
 * Marks a region whose clicks should hand the keyboard back to the terminal:
 * the tab strip, the navbar workspace list, and the panes themselves. Regions
 * that own the keyboard (Welcome, Settings, the right panel) are deliberately
 * unmarked, so this never fights them for focus.
 */
export const FOCUS_RETURN_ATTR = 'data-focus-return'
