/**
 * `file://` URL -> local path. Shared by both link mechanisms: OSC 7 reports the
 * shell's cwd as a file URL, and Claude Code's OSC 8 hyperlinks target one. Pure
 * so it can be tested without a terminal.
 */
export function parseFileUrl(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'file:') return null

  let pathname: string
  try {
    // A file URL may carry percent-escapes for spaces and other literals. An
    // invalid escape throws rather than yielding a wrong path.
    pathname = decodeURIComponent(parsed.pathname)
  } catch {
    return null
  }

  // A Windows drive path arrives as `/C:/Users/...`; the leading slash is URL
  // syntax, not part of the path. Posix paths keep theirs.
  if (/^\/[A-Za-z]:/.test(pathname)) return pathname.slice(1)
  return pathname
}
