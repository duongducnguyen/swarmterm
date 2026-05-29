import { useEffect, useState, type ReactElement } from 'react'
import { ArrowLeft, ArrowRight, ExternalLink, Maximize2, Minimize2, RotateCw } from 'lucide-react'
import { useBrowserStore } from '@/store/browser-store'
import { normalizeUrl } from '@/lib/web-url'
import { openExternalWindow } from '@/tauri/popout'

interface AddressBarProps {
  onReload: () => void
}

export function AddressBar({ onReload }: AddressBarProps): ReactElement {
  const tabs = useBrowserStore((s) => s.tabs)
  const activeTabId = useBrowserStore((s) => s.activeTabId)
  const navigate = useBrowserStore((s) => s.navigate)
  const goBack = useBrowserStore((s) => s.goBack)
  const goForward = useBrowserStore((s) => s.goForward)
  const fullscreen = useBrowserStore((s) => s.fullscreen)
  const setFullscreen = useBrowserStore((s) => s.setFullscreen)

  const active = tabs.find((t) => t.id === activeTabId) ?? null
  const [draft, setDraft] = useState(active?.url ?? '')

  // Keep the input in sync when the active tab (or its url) changes.
  useEffect(() => {
    setDraft(active?.url ?? '')
  }, [active?.id, active?.url])

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (!active) return
    const url = normalizeUrl(draft)
    if (url) navigate(active.id, url)
  }

  return (
    <div className="flex items-center gap-1 border-b border-border bg-background px-2 py-1">
      <button
        type="button"
        aria-label="Lùi"
        onClick={() => { if (active) goBack(active.id) }}
        className="rounded p-1 hover:bg-muted"
      >
        <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="Tới"
        onClick={() => { if (active) goForward(active.id) }}
        className="rounded p-1 hover:bg-muted"
      >
        <ArrowRight aria-hidden className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="Tải lại"
        onClick={onReload}
        className="rounded p-1 hover:bg-muted"
      >
        <RotateCw aria-hidden className="h-3.5 w-3.5" />
      </button>
      <form onSubmit={submit} className="flex-1">
        <input
          aria-label="Địa chỉ web"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="localhost:3000 hoặc https://…"
          className="w-full rounded-full bg-muted px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
        />
      </form>
      {active && (
        <button
          type="button"
          aria-label="Mở ra cửa sổ riêng"
          onClick={() => openExternalWindow(active.url)}
          className="rounded p-1 hover:bg-muted"
        >
          <ExternalLink aria-hidden className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        aria-label={fullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
        onClick={() => setFullscreen(!fullscreen)}
        className="rounded p-1 hover:bg-muted"
      >
        {fullscreen ? <Minimize2 aria-hidden className="h-3.5 w-3.5" /> : <Maximize2 aria-hidden className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}
