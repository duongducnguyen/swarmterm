/**
 * Turns paths dropped from the OS file manager into the text to type at the
 * pane's prompt. Kept free of DOM and Tauri imports so the quoting rules are
 * unit-testable on their own.
 */
import { quoteForShell, type ShellFlavor } from '@/lib/agent-spawn-command'

// Characters that survive a shell word unquoted. Quoting everything would work
// too, but a bare `/Users/me/a.ts` reads far better at the prompt — this is the
// same trade-off Terminal.app makes.
const SAFE_POSIX = /^[A-Za-z0-9_@%+=:,./-]+$/
// Windows paths carry `\` and may start at `~`; both are inert to PowerShell
// and cmd inside a bare word.
const SAFE_WINDOWS = /^[A-Za-z0-9_@%+=:,./\\~-]+$/

/** A point in the coordinate space `document.elementFromPoint` expects (CSS px). */
export interface CssPoint {
  x: number
  y: number
}

/**
 * Convert a drop position reported by Tauri into CSS pixels.
 *
 * The type Tauri hands us is called `PhysicalPosition`, but on macOS wry fills
 * it from `NSEvent.locationInWindow`, which is in *logical* points — no scaling
 * applied. Measured on a Retina display: `scale_factor` 2.0 and window
 * `inner_size` 2560x1640, while drag positions over the full window never
 * exceeded ~1280x820. Dividing by devicePixelRatio there halves every
 * coordinate into the top-left quadrant, so drops land on the wrong pane or on
 * nothing at all — intermittently, which is what makes it look flaky.
 *
 * Windows and Linux do report true physical pixels, so they still need the
 * divide. Only the macOS branch is verified against a running app.
 */
export function dropPointToCss(
  position: CssPoint,
  devicePixelRatio: number,
  isMac: boolean
): CssPoint {
  if (isMac) return { x: position.x, y: position.y }
  const ratio = devicePixelRatio || 1
  return { x: position.x / ratio, y: position.y / ratio }
}

/**
 * Build the string to write into the pty for `paths`, quoted for `flavor`.
 * Ends with a single trailing space so the user can keep typing, and returns
 * `''` when nothing usable is left (caller should then write nothing).
 */
export function formatDroppedPaths(paths: string[], flavor: ShellFlavor): string {
  const usable = paths.filter((path) => {
    if (path === '') return false
    if (/[\r\n]/.test(path)) {
      // Writing this to the pty would press Enter mid-line and run a truncated
      // command. Newlines are legal in Unix filenames, so refuse rather than
      // mangle.
      console.warn('Ignoring dropped path containing a newline:', JSON.stringify(path))
      return false
    }
    return true
  })
  if (usable.length === 0) return ''

  const safe = flavor === 'posix' ? SAFE_POSIX : SAFE_WINDOWS
  const words = usable.map((path) => (safe.test(path) ? path : quoteForShell(path, flavor)))
  return `${words.join(' ')} `
}
