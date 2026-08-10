import { useEffect, useRef, type ReactElement } from 'react'
import { useAppStore } from '@/store/app-store'
import { useBrowserStore } from '@/store/browser-store'
import { findLeaf } from '@/lib/layout-tree'
import { watchOverlays } from '@/lib/overlay-watch'
import { setPreviewVisible, syncPreviewBounds } from '@/lib/preview-registry'
import { AddressBar } from './AddressBar'

/**
 * The 3rd column, scoped to the focused terminal: each terminal owns at most
 * one preview URL, so "switching tabs" is just focusing another pane. The page
 * renders in a NATIVE child webview glued to the placeholder div below —
 * that's what lets sites that refuse framing (X-Frame-Options) render at all.
 * The invariant that keeps the native view honest: it is visible iff this
 * placeholder is mounted AND no overlay (menu/dialog) is open above it.
 */
export function BrowserColumn(): ReactElement {
  const focusedTerminalId = useAppStore((s) => {
    const ws = s.workspaces.find((w) => w.id === s.activeWorkspaceId)
    if (!ws) return null
    return findLeaf(ws.layout, ws.focusedLeafId)?.terminalId ?? null
  })
  const preview = useBrowserStore((s) =>
    focusedTerminalId ? (s.previews[focusedTerminalId] ?? null) : null
  )
  // Welcome renders as an absolute z-20 overlay above this column (App.tsx)
  // but matches nothing in OVERLAY_SELECTOR, so watchOverlays never sees it —
  // without this, the native webview keeps painting over Welcome regardless
  // of DOM z-order (child webviews are always topmost). Folding it into
  // previewTerminalId reuses the same teardown the visibility effect already
  // does for every other "nothing to show" case.
  const showWelcome = useAppStore((s) => s.welcomeFocused || s.workspaces.length === 0)
  const placeholderRef = useRef<HTMLDivElement | null>(null)
  const previewTerminalId = preview && focusedTerminalId && !showWelcome ? focusedTerminalId : null

  // Bounds: keep the native webview glued to the placeholder. ResizeObserver
  // misses position-only shifts (e.g. the macOS fullscreen chrome dodge
  // translates the whole app), so a slow interval backstops it — the registry
  // dedupes identical bounds, making the idle cost one getBoundingClientRect.
  useEffect(() => {
    if (!previewTerminalId) return
    const el = placeholderRef.current
    if (!el) return
    let raf = 0
    const sync = (): void => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect()
        syncPreviewBounds(previewTerminalId, rect)
      })
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(el)
    window.addEventListener('resize', sync)
    const backstop = window.setInterval(sync, 500)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', sync)
      window.clearInterval(backstop)
    }
  }, [previewTerminalId])

  // Visibility invariant: shown while mounted with no overlay open; hidden the
  // moment this effect tears down (panel tab switch, pane drag flipping the
  // panel to War Room, focus moving to a pane without a preview, unmount).
  useEffect(() => {
    if (!previewTerminalId) return
    // watchOverlays fires its callback synchronously on subscribe, which can
    // be the first-ever show-IPC for this terminal (a fresh MCP-driven open
    // has no cached bounds, or the bounds effect above simply hasn't run
    // yet). Sync bounds once, synchronously, right here so show-IPC never
    // precedes the first bounds-IPC — otherwise the webview paints at
    // whatever stale/fallback 1×1 rect it was created with for one frame.
    const rect = placeholderRef.current?.getBoundingClientRect()
    if (rect) syncPreviewBounds(previewTerminalId, rect)
    const unwatch = watchOverlays((open) => setPreviewVisible(previewTerminalId, !open))
    return () => {
      unwatch()
      setPreviewVisible(previewTerminalId, false)
    }
  }, [previewTerminalId])

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <AddressBar terminalId={focusedTerminalId} preview={preview} />
      <div className="flex min-h-0 flex-1 flex-col">
        {preview && focusedTerminalId ? (
          /* The native webview paints over this div; the dimmed URL beneath is
             what shows whenever the webview is suppressed (overlay open) or
             still loading its first paint — never a bare white flash. */
          <div
            ref={placeholderRef}
            className="flex min-h-0 w-full flex-1 items-center justify-center bg-muted/30"
          >
            <span className="max-w-[80%] truncate text-xs text-muted-foreground">
              {preview.title ?? preview.url}
            </span>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            No preview for this terminal
          </div>
        )}
      </div>
    </div>
  )
}
