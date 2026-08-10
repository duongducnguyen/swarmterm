import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import { filterRecents, folderName } from '@/lib/recent-folders'
import { useRecentsStore } from '@/store/recents-store'
import { useAppStore } from '@/store/app-store'
import { cn } from '@/lib/utils'

/**
 * Title-bar search shown on the home screen. Focusing it drops down the list of
 * recent folders (filtered as you type); choosing one fills the Welcome form's
 * Working-folder field, and each row can be removed with its ✕. Mirrors VS
 * Code's top search → recent-folders quick pick. Hidden once a workspace is the
 * foreground view (the title bar shows the workspace name there instead).
 */
export function HeaderRecentSearch(): ReactElement {
  const recents = useRecentsStore((s) => s.recents)
  const removeRecent = useRecentsStore((s) => s.remove)
  const searchRequest = useRecentsStore((s) => s.searchRequest)
  const setWelcomeFolder = useAppStore((s) => s.setWelcomeFolder)

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = filterRecents(recents, query)

  // Welcome's "Show all" asks us to open. Clear any stale filter first so the
  // dropdown really shows ALL recents. The explicit setOpen matters when the
  // input already has focus — focus() won't re-fire onFocus then. 0 is the
  // store's initial value, so skipping it avoids auto-opening on mount.
  useEffect(() => {
    if (searchRequest === 0) return
    setQuery('')
    setOpen(true)
    inputRef.current?.focus()
  }, [searchRequest])

  // Keep the highlighted row in range as the filtered list changes.
  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  // Close the dropdown on a click outside the search.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const choose = (path: string): void => {
    setWelcomeFolder(path)
    setQuery('')
    setOpen(false)
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const path = filtered[activeIndex]
      if (path) choose(path)
    }
  }

  return (
    <div ref={rootRef} data-tauri-drag-region="false" className="relative w-full max-w-[480px]">
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex h-[26px] cursor-text items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 transition-colors hover:bg-white/10 focus-within:border-white/20 focus-within:bg-white/10"
      >
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search recent folders"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
        />
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </div>

      {open && recents.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-2xl">
          <div className="max-h-80 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                No matching folders
              </div>
            ) : (
              filtered.map((path, i) => {
                const active = i === activeIndex
                return (
                  <div
                    key={path}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => choose(path)}
                    className={cn(
                      'group flex cursor-pointer items-center gap-2 px-3 py-1.5',
                      active && 'bg-accent'
                    )}
                  >
                    <span className="shrink-0 text-xs text-foreground">{folderName(path)}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                      {path}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeRecent(path)
                      }}
                      aria-label={`Remove ${folderName(path)} from recents`}
                      className={cn(
                        'shrink-0 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground',
                        active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      )}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
