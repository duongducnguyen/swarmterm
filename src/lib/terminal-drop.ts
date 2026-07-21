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
