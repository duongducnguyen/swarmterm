import { useEffect, useRef, type ReactElement } from 'react'
import { useBrowserStore } from '@/store/browser-store'
import { TabStrip } from './TabStrip'
import { AddressBar } from './AddressBar'
import { previewSetBounds, previewShow, previewSetVisible } from '@/tauri/preview'

interface BrowserColumnProps {
  terminalIndexOf: (terminalId: string) => number
}

/**
 * The 3rd column. Toolbar (tabs + address bar) is DOM; the actual web renders in
 * a native webview the backend positions over `contentRef`'s rect. We push the
 * rect on every layout change and the active tab's url whenever it changes.
 */
export function BrowserColumn({ terminalIndexOf }: BrowserColumnProps): ReactElement {
  const tabs = useBrowserStore((s) => s.tabs)
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const contentRef = useRef<HTMLDivElement>(null)

  const active = tabs.find((t) => t.id === activeTabId) ?? null

  // Report the content rect (logical px relative to the window) to the backend.
  const pushBounds = (): void => {
    const el = contentRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    void previewSetBounds({ x: r.left, y: r.top, width: r.width, height: r.height })
  }

  // Drive the webview to the active tab's url; create/position on first show.
  useEffect(() => {
    const el = contentRef.current
    if (!el || !active) {
      void previewSetVisible(false)
      return
    }
    const r = el.getBoundingClientRect()
    void previewShow(active.url, { x: r.left, y: r.top, width: r.width, height: r.height })
    void previewSetVisible(true)
  }, [active?.id, active?.url])

  // Keep the webview glued to the content rect as the column resizes / window resizes.
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const ro = new ResizeObserver(() => pushBounds())
    ro.observe(el)
    window.addEventListener('resize', pushBounds)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', pushBounds)
    }
  }, [])

  return (
    <div className="flex h-full w-full flex-col overflow-hidden border-l border-border bg-background">
      <TabStrip terminalIndexOf={terminalIndexOf} />
      <AddressBar />
      {/* The native webview overlays this box; keep it empty. */}
      <div ref={contentRef} className="min-h-0 flex-1" />
    </div>
  )
}
