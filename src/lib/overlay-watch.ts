import { OVERLAY_SELECTOR } from './terminal-focus'

/**
 * A native child webview paints ABOVE every DOM element — a Radix menu or
 * dialog opened over the preview column would render underneath it. The fix is
 * to hide the webview while any overlay is open; this module is the "any
 * overlay is open" signal. Selector shared with terminal-focus.ts, which
 * already encodes which floating chrome owns the screen.
 */
export interface OverlayRoot {
  querySelector(selectors: string): unknown
}

export function hasOpenOverlay(root: OverlayRoot): boolean {
  return root.querySelector(OVERLAY_SELECTOR) !== null
}

/**
 * DOM adapter: report overlay open/close transitions. Fires the callback
 * immediately with the current state so subscribers need no separate read.
 * Radix mounts portals as direct children of body, so a subtree childList
 * observer catches every open/close; the querySelector per mutation batch is
 * microseconds.
 */
export function watchOverlays(cb: (open: boolean) => void): () => void {
  let last = hasOpenOverlay(document)
  cb(last)
  const observer = new MutationObserver(() => {
    const now = hasOpenOverlay(document)
    if (now !== last) {
      last = now
      cb(now)
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
  return () => observer.disconnect()
}
