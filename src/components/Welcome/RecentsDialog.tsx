import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { filterRecents, folderName } from '@/lib/recent-folders'
import { useRecentsStore } from '@/store/recents-store'

interface RecentsDialogProps {
  open: boolean
  onClose: () => void
  /** The picked path — Welcome points this at the Working-folder field. */
  onPick: (path: string) => void
}

/**
 * Modal over EVERY recent folder: search on top, pick-one list below. Unlike
 * SessionsDialog's tick-many, choosing a row is terminal — it fills the
 * Working-folder field and closes. Recents live in the global store (not
 * per-folder props) so removal here updates the composer list and the
 * title-bar dropdown alike. Hand-rolled overlay per SessionsDialog;
 * role="dialog" is what overlay-watch and terminal-focus key on.
 */
export function RecentsDialog({ open, onClose, onPick }: RecentsDialogProps): ReactElement | null {
  const recents = useRecentsStore((s) => s.recents)
  const removeRecent = useRecentsStore((s) => s.remove)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // "Show all" means ALL: every visit restarts unfiltered with the caret in
  // the search box. Runs after the open render, so the input exists.
  useEffect(() => {
    if (open) {
      setQuery('')
      inputRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const visible = filterRecents(recents, query)

  const choose = (path: string): void => {
    onPick(path)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Recent folders"
        className="flex h-[440px] max-h-[85vh] w-[520px] max-w-[90vw] flex-col overflow-hidden rounded-lg border border-border bg-card text-sm shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="m-3 mb-2 flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 focus-within:ring-1 focus-within:ring-ring">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recent folders…"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1.5">
          {visible.length === 0 ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground">
              No matching folders
            </div>
          ) : (
            visible.map((path) => (
              <div
                key={path}
                role="button"
                tabIndex={0}
                onClick={() => choose(path)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    choose(path)
                  }
                }}
                className="group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent"
              >
                <span
                  title={folderName(path)}
                  className="min-w-0 max-w-[50%] shrink-0 truncate text-sm font-medium text-foreground"
                >
                  {folderName(path)}
                </span>
                <span title={path} className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {path}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeRecent(path)
                  }}
                  aria-label={`Remove ${folderName(path)} from recents`}
                  className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2.5">
          <span className="mr-auto text-xs tabular-nums text-muted-foreground">
            {recents.length} {recents.length === 1 ? 'folder' : 'folders'}
          </span>
          <Button size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
