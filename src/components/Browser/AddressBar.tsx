import { useEffect, useState, type ReactElement } from 'react'
import { ArrowLeft, ArrowRight, ExternalLink, RotateCw, X } from 'lucide-react'
import { type Preview } from '@/store/browser-store'
import { searchOrUrl } from '@/lib/web-url'
import {
  closePreview,
  openPreview,
  previewGoBack,
  previewGoForward,
  reloadPreview
} from '@/lib/preview-registry'
import { openExternalWindow } from '@/tauri/popout'

interface AddressBarProps {
  terminalId: string | null
  preview: Preview | null
}

export function AddressBar({ terminalId, preview }: AddressBarProps): ReactElement {
  const [draft, setDraft] = useState(preview?.url ?? '')

  // Rendered unconditionally (not gated on `preview`) so the bar's layout
  // doesn't shift width as previews open/close — only their disabled state
  // reacts to history position.
  const backDisabled = !preview || !terminalId || preview.historyIndex <= 0
  const forwardDisabled = !preview || !terminalId || preview.historyIndex >= preview.history.length - 1

  // Keep the input in sync when the focused terminal (or its url) changes.
  useEffect(() => {
    setDraft(preview?.url ?? '')
  }, [terminalId, preview?.url])

  const submit = (e: React.FormEvent): void => {
    e.preventDefault()
    // No focused terminal (Welcome overlay, empty workspace) — nowhere to bind.
    if (!terminalId) return
    const url = searchOrUrl(draft)
    if (!url) return
    // openPreview's history push is a no-op on the currently shown url, so
    // Enter on the identical address must fall through to a real reload
    // instead of silently doing nothing.
    if (url === preview?.url) {
      reloadPreview(terminalId)
      return
    }
    // openPreview creates or navigates — the same gesture either way.
    openPreview(terminalId, url)
  }

  return (
    <div className="flex items-center gap-1 border-b border-border bg-background px-2 py-1">
      <button
        type="button"
        aria-label="Back"
        disabled={backDisabled}
        onClick={() => terminalId && previewGoBack(terminalId)}
        className="rounded p-1 hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
      >
        <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="Forward"
        disabled={forwardDisabled}
        onClick={() => terminalId && previewGoForward(terminalId)}
        className="rounded p-1 hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
      >
        <ArrowRight aria-hidden className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="Reload"
        onClick={() => terminalId && reloadPreview(terminalId)}
        className="rounded p-1 hover:bg-muted"
      >
        <RotateCw aria-hidden className={'h-3.5 w-3.5' + (preview?.loading ? ' animate-spin' : '')} />
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
