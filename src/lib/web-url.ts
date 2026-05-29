/**
 * Turn user address-bar input into a canonical http(s) URL string, or null when
 * it cannot be interpreted as a web address. A bare `host:port` (or host) gets
 * an `http://` prefix; existing http/https URLs are normalised via the URL parser.
 */
export function normalizeUrl(input: string): string | null {
  const trimmed = input.trim()
  if (trimmed === '') return null
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  try {
    return new URL(candidate).href
  } catch {
    return null
  }
}

/** True only for http/https URLs — the schemes safe to render in a webview. */
export function isPreviewableUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}
