import { useEffect, useState, type ReactElement } from 'react'
import { ExternalLink, RotateCw, X } from 'lucide-react'
import { useBrowserStore } from '@/store/browser-store'
import { useAppStore, selectActiveWorkspace } from '@/store/app-store'
import { findLeaf } from '@/lib/layout-tree'
import { normalizeUrl } from '@/lib/web-url'
import { openExternalWindow } from '@/tauri/popout'

interface AddressBarProps {
  onReload: () => void
}

export function AddressBar({ onReload }: AddressBarProps): ReactElement {
  const tabs = useBrowserStore((s) => s.tabs)
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const navigate = useBrowserStore((s) => s.navigate)
  const openTab = useBrowserStore((s) => s.openTab)
  const closeTab = useBrowserStore((s) => s.closeTab)

  const active = tabs.find((t) => t.id === activeTabId) ?? null
  const [draft, setDraft] = useState(active?.url ?? '')

  // Keep the input in sync when the active tab (or its url) changes.
  useEffect(() => {
    setDraft(active?.url ?? '')
  }, [active?.id, active?.url])

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    const url = normalizeUrl(draft)
    if (!url) return
    if (active) {
      navigate(active.id, url)
      return
    }
    // Panel opened manually with no tab yet — create one against the focused
    // terminal so the entered URL actually loads.
    const ws = selectActiveWorkspace(useAppStore.getState())
    const leaf = ws ? findLeaf(ws.layout, ws.focusedLeafId) : null
    openTab({ terminalId: leaf?.terminalId ?? 'preview', url })
  }

  return (
    <div className="flex items-center gap-1 border-b border-border bg-background px-2 py-1">
      <button
        type="button"
        aria-label="Reload"
        onClick={onReload}
        className="rounded p-1 hover:bg-muted"
      >
        <RotateCw aria-hidden className="h-3.5 w-3.5" />
      </button>
      <form onSubmit={submit} className="flex-1">
        <input
          aria-label="Web address"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="localhost:3000 or https://…"
          className="w-full rounded-full bg-muted px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
        />
      </form>
      {active && (
        <>
          <button
            type="button"
            aria-label="Open in new window"
            onClick={() => openExternalWindow(active.url)}
            className="rounded p-1 hover:bg-muted"
          >
            <ExternalLink aria-hidden className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Close preview"
            onClick={() => closeTab(active.id)}
            className="rounded p-1 hover:bg-muted"
          >
            <X aria-hidden className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  )
}
