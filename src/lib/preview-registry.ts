import { useBrowserStore } from '@/store/browser-store'
import {
  onPreviewPopup,
  onPreviewState,
  previewBack,
  previewClose,
  previewForward,
  previewNavigate,
  previewOpen,
  previewReload,
  previewSetBounds,
  previewSetVisible
} from '@/tauri/preview'
import { boundsEqual, toLogicalBounds, type PreviewBounds } from '@/lib/preview-bounds'

/**
 * Pairs browser-store mutations with the native webview IPC so callers can't
 * get the two out of step (the terminal-registry pattern). Every IPC call
 * fails soft: on platforms where child webviews misbehave (Linux/webkitgtk)
 * the store still tracks state and the pop-out button remains the escape
 * hatch — a preview must never take the app down.
 */
const logSoft = (e: unknown): void => console.warn('preview:', e)

/**
 * Creation needs bounds before the placeholder has ever reported any (an MCP
 * open for a background pane): fall back to a hidden 1×1 — the webview is
 * created invisible and BrowserColumn syncs real bounds when it shows it.
 */
const lastBounds = new Map<string, PreviewBounds>()
const FALLBACK_BOUNDS: PreviewBounds = { x: 0, y: 0, width: 1, height: 1 }

export function openPreview(terminalId: string, url: string): void {
  useBrowserStore.getState().openPreview(terminalId, url)
  void previewOpen(terminalId, url, lastBounds.get(terminalId) ?? FALLBACK_BOUNDS).catch(logSoft)
}

export function closePreview(terminalId: string): void {
  useBrowserStore.getState().closePreview(terminalId)
  lastBounds.delete(terminalId)
  void previewClose(terminalId).catch(logSoft)
}

export function reloadPreview(terminalId: string): void {
  void previewReload(terminalId).catch(logSoft)
}

// Store updates arrive via the resulting preview:state event, not here —
// history.back() on an empty session history produces no event and no change.
export function previewGoBack(terminalId: string): void {
  void previewBack(terminalId).catch(logSoft)
}

export function previewGoForward(terminalId: string): void {
  void previewForward(terminalId).catch(logSoft)
}

export function syncPreviewBounds(
  terminalId: string,
  rect: { x: number; y: number; width: number; height: number }
): void {
  const bounds = toLogicalBounds(rect)
  if (boundsEqual(bounds, lastBounds.get(terminalId))) return
  lastBounds.set(terminalId, bounds)
  void previewSetBounds(terminalId, bounds).catch(logSoft)
}

export function setPreviewVisible(terminalId: string, visible: boolean): void {
  void previewSetVisible(terminalId, visible).catch(logSoft)
}

/** Wire native webview events into the store. Call once at app mount. */
export function wirePreviewEvents(): () => void {
  const unState = onPreviewState((e) =>
    useBrowserStore.getState().applyNavState(e.terminalId, e)
  )
  // A denied window.open navigates the same preview in place (mobile-browser
  // style): session history keeps Back working, and no native OS window can
  // pop over the terminal grid.
  const unPopup = onPreviewPopup((e) => {
    void previewNavigate(e.terminalId, e.url).catch(logSoft)
  })
  return () => {
    void unState.then((f) => f())
    void unPopup.then((f) => f())
  }
}
