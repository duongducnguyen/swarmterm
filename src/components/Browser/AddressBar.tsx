import { useEffect, useState, type ReactElement } from 'react'
import { ExternalLink, RotateCw, X } from 'lucide-react'
import { useBrowserStore, type Preview } from '@/store/browser-store'
import { normalizeUrl } from '@/lib/web-url'
import { openExternalWindow } from '@/tauri/popout'

interface AddressBarProps {
  terminalId: string | null
  preview: Preview | null
  onReload: () => void
}

export function AddressBar({ terminalId, preview, onReload }: AddressBarProps): ReactElement {
  const openPreview = useBrowserStore((s) => s.openPreview)
  const closePreview = useBrowserStore((s) => s.closePreview)
  const [draft, setDraft] = useState(preview?.url ?? '')

  // Keep the input in sync when the focused terminal (or its url) changes.
  useEffect(() => {
    setDraft(preview?.url ?? '')
  }, [terminalId, preview?.url])

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    // No focused terminal (Welcome overlay, empty workspace) — nowhere to bind.
    if (!terminalId) return
    const url = normalizeUrl(draft)
    if (!url) return
    // openPreview creates or navigates — the same gesture either way.
    openPreview(terminalId, url)
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
      {preview && terminalId && (
        <>
          <button
            type="button"
            aria-label="Open in new window"
            onClick={() => openExternalWindow(preview.url)}
            className="rounded p-1 hover:bg-muted"
          >
            <ExternalLink aria-hidden className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Close preview"
            onClick={() => closePreview(terminalId)}
            className="rounded p-1 hover:bg-muted"
          >
            <X aria-hidden className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  )
}
