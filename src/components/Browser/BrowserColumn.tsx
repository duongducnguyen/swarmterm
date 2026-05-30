import { useState, type ReactElement } from 'react'
import { useBrowserStore } from '@/store/browser-store'
import { TabStrip } from './TabStrip'
import { AddressBar } from './AddressBar'

interface BrowserColumnProps {
  terminalIndexOf: (terminalId: string) => number
}

/**
 * The 3rd column. Toolbar (tabs + address bar) is DOM; the actual web renders
 * in an iframe (in-DOM — no focus steal, no z-order/paint bugs). A pop-out
 * button in AddressBar opens a real WebviewWindow for sites that block framing.
 */
export function BrowserColumn({ terminalIndexOf }: BrowserColumnProps): ReactElement {
  const tabs = useBrowserStore((s) => s.tabs)
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const [reloadNonce, setReloadNonce] = useState(0)

  const active = tabs.find((t) => t.id === activeTabId) ?? null

  return (
    <div className="flex h-full w-full flex-col overflow-hidden border-l border-border bg-background">
      <TabStrip terminalIndexOf={terminalIndexOf} />
      <AddressBar onReload={() => setReloadNonce((n) => n + 1)} />
      <div className="flex min-h-0 flex-1 flex-col">
        {active ? (
          <iframe
            key={`${active.id}:${reloadNonce}`}
            src={active.url}
            title={active.title ?? active.url}
            className="min-h-0 w-full flex-1 border-0 bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            Không có tab nào đang mở
          </div>
        )}
      </div>
    </div>
  )
}
