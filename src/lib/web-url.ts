/** `:3000` is a port, not a scheme — hence the digit lookahead. */
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:(?!\d)/i
const LOOPBACK_RE = /^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i
const GOOGLE = 'https://www.google.com/search?q='

/**
 * The human omnibox: URL-ish input navigates, everything else searches.
 * Deliberately permissive — the strict gate for agent-supplied URLs lives in
 * Rust (`validate_preview_url`) and in the webview's on_navigation handler.
 */
export function searchOrUrl(input: string): string | null {
  const trimmed = input.trim()
  if (trimmed === '') return null
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return new URL(trimmed).href
    } catch {
      return GOOGLE + encodeURIComponent(trimmed)
    }
  }
  // Non-http schemes (javascript:, file:, mailto:) are searched, not navigated.
  if (SCHEME_RE.test(trimmed)) return GOOGLE + encodeURIComponent(trimmed)
  const hostLike = !/\s/.test(trimmed) && (trimmed.includes('.') || LOOPBACK_RE.test(trimmed))
  if (hostLike) {
    // Dev servers are http; the public web defaults to https.
    const scheme = LOOPBACK_RE.test(trimmed) ? 'http://' : 'https://'
    try {
      return new URL(scheme + trimmed).href
    } catch {
      // fall through to search
    }
  }
  return GOOGLE + encodeURIComponent(trimmed)
}
