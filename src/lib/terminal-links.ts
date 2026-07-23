/**
 * Click handling for terminal links, kept free of xterm and Tauri imports so the
 * decision is pure and unit-testable. The registry wires the side effects (open
 * the preview column, launch the editor) around it.
 */

/** The subset of a MouseEvent the decision needs. */
export interface ClickModifiers {
  ctrlKey: boolean
  metaKey: boolean
}

export type LinkKind = 'url' | 'path'

/**
 * Whether a click on a terminal link should open it. The gate is chosen by the
 * cost of a misclick, not by uniformity:
 *
 * - `url` follows a PLAIN click. It opens the in-app preview column beside the
 *   pane — no focus leaves the app and one click closes it, so an accidental
 *   open is nearly free.
 * - `path` requires Cmd (macOS) / Ctrl (win/linux), because it launches an
 *   EXTERNAL editor, which yanks OS focus out of Swarmterm entirely. That is the
 *   exact failure terminal-focus.ts exists to prevent, and agent output has far
 *   higher path density than an ordinary shell.
 *
 * Defaults to `path` so the stricter gate applies to any caller that forgets.
 */
export function shouldFollowLink(
  e: ClickModifiers,
  isMac: boolean,
  kind: LinkKind = 'path'
): boolean {
  if (kind === 'url') return true
  return isMac ? e.metaKey : e.ctrlKey
}

/** The subset of a MouseEvent the drag guard needs. */
export interface ClickPoint {
  clientX: number
  clientY: number
}

/**
 * xterm's Linkifier already requires that mousedown and mouseup land on the same
 * link, so dragging AWAY from a link is handled upstream. What it does not catch
 * is a drag that selects text within one link's own bounds — that still fires
 * `activate`. Anything past a few pixels of tremor is a selection, not a click.
 */
const DRAG_SLOP_PX = 3

export function isDragNotClick(down: ClickPoint | undefined, up: ClickPoint): boolean {
  // No recorded mousedown (e.g. the press began outside the terminal host) is
  // not evidence of a drag — don't suppress the link on a guess.
  if (!down) return false
  return (
    Math.abs(up.clientX - down.clientX) > DRAG_SLOP_PX ||
    Math.abs(up.clientY - down.clientY) > DRAG_SLOP_PX
  )
}
