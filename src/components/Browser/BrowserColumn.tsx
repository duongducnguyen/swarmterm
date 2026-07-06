import { useState, type ReactElement } from 'react'
import { useAppStore } from '@/store/app-store'
import { useBrowserStore } from '@/store/browser-store'
import { findLeaf } from '@/lib/layout-tree'
import { AddressBar } from './AddressBar'

/**
 * The 3rd column, scoped to the focused terminal: each terminal owns at most
 * one preview URL, so "switching tabs" is just focusing another pane. The web
 * renders in an in-DOM iframe (no focus steal, no z-order/paint bugs); a
 * pop-out button in AddressBar opens a real WebviewWindow for sites that
 * block framing.
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
  const [reloadNonce, setReloadNonce] = useState(0)

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <AddressBar
        terminalId={focusedTerminalId}
        preview={preview}
        onReload={() => setReloadNonce((n) => n + 1)}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        {preview && focusedTerminalId ? (
          /* Keyed by terminal (not url): switching panes or reloading remounts
             the frame, while in-terminal navigation just swaps src and lets
             the iframe navigate itself. */
          <iframe
            key={`${focusedTerminalId}:${reloadNonce}`}
            src={preview.url}
            title={preview.title ?? preview.url}
            className="min-h-0 w-full flex-1 border-0 bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            No preview for this terminal
          </div>
        )}
      </div>
    </div>
  )
}
