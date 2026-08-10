import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AgentIcon } from '@/components/AgentIcon'
import { templateById } from '@/lib/templates'
import {
  filterSessions,
  searchSessions,
  sessionKey,
  sessionTabCounts,
  SESSION_FILTER_TABS,
  type AgentSessionEntry,
  type SessionFilter
} from '@/lib/agent-sessions'
import { cn } from '@/lib/utils'
import { SessionRow } from './SessionRow'

interface SessionsDialogProps {
  open: boolean
  onClose: () => void
  sessions: AgentSessionEntry[]
  tickedKeys: ReadonlySet<string>
  onToggle: (key: string) => void
  canTickMore: boolean
  /** Remaining 12-pane budget — shown in the footer so a disabled row explains itself. */
  slotsLeft: number
}

/**
 * Modal over EVERY resumable session: agent rail on the left, title search +
 * scrollable list on the right. Ticks mutate the composer's set via onToggle —
 * the dialog is a bigger window onto the same selection, never a second one.
 * The rail filter is deliberately dialog-local: the shared-state variant left
 * the composer section unexpectedly filtered after the dialog closed.
 * Hand-rolled overlay per ClearWorktreeDialog; role="dialog" is what
 * overlay-watch and terminal-focus key on, so both cover it for free.
 */
export function SessionsDialog({
  open,
  onClose,
  sessions,
  tickedKeys,
  onToggle,
  canTickMore,
  slotsLeft
}: SessionsDialogProps): ReactElement | null {
  const [railFilter, setRailFilter] = useState<SessionFilter>('all')
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // "Show all" means ALL: every visit restarts at the full list with the
  // caret in the search box. The effect runs after the open render, so the
  // input exists by the time focus() fires.
  useEffect(() => {
    if (open) {
      setRailFilter('all')
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

  const counts = sessionTabCounts(sessions)
  const visible = searchSessions(filterSessions(sessions, railFilter), query)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Resume sessions"
        className="flex h-[440px] max-h-[85vh] w-[640px] max-w-[90vw] overflow-hidden rounded-lg border border-border bg-card text-sm shadow-lg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Agent rail — dialog-local filter, zero-count agents disabled */}
        <div className="w-[150px] shrink-0 border-r border-border p-2">
          <p className="px-2 pb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Agents
          </p>
          {SESSION_FILTER_TABS.map((tab) => {
            const count = counts[tab] ?? 0
            const active = railFilter === tab
            const empty = tab !== 'all' && count === 0
            return (
              <button
                key={tab}
                type="button"
                aria-pressed={active}
                disabled={empty}
                onClick={() => setRailFilter(tab)}
                className={cn(
                  'mb-0.5 flex w-full items-center justify-between rounded-md px-2 py-1 text-xs',
                  active
                    ? 'bg-accent text-foreground ring-1 ring-ring'
                    : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
                  empty && 'cursor-not-allowed opacity-40 hover:bg-transparent'
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {tab !== 'all' && (
                    <AgentIcon template={templateById(tab)} className="h-3 w-3 shrink-0" />
                  )}
                  <span className="truncate">
                    {tab === 'all' ? 'All' : templateById(tab).name}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{count}</span>
              </button>
            )
          })}
        </div>

        {/* Search + list + footer */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="m-3 mb-2 flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 focus-within:ring-1 focus-within:ring-ring">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sessions…"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1.5">
            {visible.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6 text-center text-xs text-muted-foreground">
                No sessions match "{query.trim()}" — try another keyword or agent.
              </div>
            ) : (
              visible.map((s) => {
                const key = sessionKey(s)
                const ticked = tickedKeys.has(key)
                return (
                  <SessionRow
                    key={key}
                    session={s}
                    ticked={ticked}
                    disabled={!ticked && !canTickMore}
                    onToggle={() => onToggle(key)}
                  />
                )
              })
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2.5">
            <span className="mr-auto text-xs tabular-nums text-muted-foreground">
              {tickedKeys.size} selected · {slotsLeft} {slotsLeft === 1 ? 'slot' : 'slots'} left
            </span>
            <Button size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
