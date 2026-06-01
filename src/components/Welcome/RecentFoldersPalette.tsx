import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { X } from 'lucide-react'
import { folderName } from '@/lib/recent-folders'
import { cn } from '@/lib/utils'

interface RecentFoldersPaletteProps {
  recents: string[]
  /** Fill the Working-folder input with `path` (does not create a workspace). */
  onSelect: (path: string) => void
  onRemove: (path: string) => void
  onClose: () => void
}

/**
 * VS Code-style quick-pick overlay listing every recent folder. Type to filter,
 * arrow keys to navigate, Enter to choose, Esc (or click outside) to close. Each
 * row can be removed with its ✕. Choosing a folder fills the Working-folder
 * input — it does not create a workspace.
 */
export function RecentFoldersPalette({
  recents,
  onSelect,
  onRemove,
  onClose
}: RecentFoldersPaletteProps): ReactElement {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const q = query.trim().toLowerCase()
  const filtered =
    q === ''
      ? recents
      : recents.filter(
          (p) => p.toLowerCase().includes(q) || folderName(p).toLowerCase().includes(q)
        )

  // Keep the highlighted row in range as the filtered list changes.
  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  // Focus the search box when the palette opens.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const choose = (path: string): void => {
    onSelect(path)
    onClose()
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
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
    <div className="fixed inset-0 z-50 flex justify-center bg-black/40" onMouseDown={onClose}>
      <div
        className="mt-16 h-fit w-full max-w-2xl overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Select a recent folder to open…"
          spellCheck={false}
          className="w-full border-b border-border bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
        />
        <div className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
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
                    'group flex cursor-pointer items-center gap-2 px-4 py-1.5',
                    active && 'bg-accent'
                  )}
                >
                  <span className="shrink-0 text-sm text-foreground">{folderName(path)}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {path}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemove(path)
                    }}
                    aria-label={`Remove ${folderName(path)} from recents`}
                    className={cn(
                      'shrink-0 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground',
                      active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    )}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
