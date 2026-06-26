import { useEffect, useState, type ReactElement } from 'react'
import { Folder, FolderSearch, Minus, Plus, X } from 'lucide-react'
import { gridFor, TERMINAL_COUNTS } from '@/lib/layout-tree'
import { TEMPLATES, isTemplateAvailable } from '@/lib/templates'
import { allocateAgents, clampCounts } from '@/lib/agent-allocation'
import { useAgentAvailabilityStore } from '@/store/agent-availability-store'
import { useAppStore } from '@/store/app-store'
import { AgentIcon } from '@/components/AgentIcon'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { pickDirectory, getHomeDir } from '@/tauri/dialog'
import { folderName } from '@/lib/recent-folders'
import { useRecentsStore } from '@/store/recents-store'
import { RecentFoldersPalette } from './RecentFoldersPalette'

/** How many recents show before the "More…" toggle reveals the rest. */
const RECENTS_COLLAPSED_COUNT = 5

/**
 * Welcome page shown in place of a workspace while creating one (or when none
 * exist yet). A branded header plus an inline "Start a workspace" form: pick a
 * working folder, a terminal-grid size, and a template. Replaces the old modal
 * setup wizard; creating a workspace closes Welcome via the store.
 */
export function Welcome(): ReactElement {
  const createWorkspace = useAppStore((s) => s.createWorkspace)
  const folder = useAppStore((s) => s.welcomeFolder)
  const setFolder = useAppStore((s) => s.setWelcomeFolder)
  const [terminalCount, setTerminalCount] = useState<number>(TERMINAL_COUNTS[0])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [paletteOpen, setPaletteOpen] = useState(false)
  const recents = useRecentsStore((s) => s.recents)
  const addRecentFolder = useRecentsStore((s) => s.add)
  const removeRecentFolder = useRecentsStore((s) => s.remove)
  const availability = useAgentAvailabilityStore((s) => s.availability)

  // Pre-fill the home directory on mount, unless a folder is already chosen
  // (e.g. picked from the title-bar search before Welcome mounted).
  useEffect(() => {
    void getHomeDir().then((home) => {
      if (useAppStore.getState().welcomeFolder === '') setFolder(home)
    })
  }, [setFolder])

  // Re-probe installed agent CLIs every time Welcome is shown (it mounts
  // fresh each time), so a CLI installed while the app runs is picked up
  // without a restart.
  useEffect(() => {
    void useAgentAvailabilityStore.getState().refresh()
  }, [])

  const trimmedFolder = folder.trim()
  const { rows, cols } = gridFor(terminalCount)
  const hasMoreRecents = recents.length > RECENTS_COLLAPSED_COUNT
  const visibleRecents = recents.slice(0, RECENTS_COLLAPSED_COUNT)

  // Only templates with a CLI are allocatable; the plain Terminal is the filler.
  const agentTemplates = TEMPLATES.filter((t) => t.executable)
  const assigned = Object.values(counts).reduce((sum, n) => sum + n, 0)
  const remaining = terminalCount - assigned

  // Shrinking the terminal count can leave more allocated than fit — clamp down.
  useEffect(() => {
    setCounts((prev) => clampCounts(prev, terminalCount))
  }, [terminalCount])

  // Drop any allocation for an agent whose CLI turns out to be uninstalled
  // (the probe can resolve after the user clicked +), mirroring the old reset.
  useEffect(() => {
    setCounts((prev) => {
      const next: Record<string, number> = {}
      for (const [id, n] of Object.entries(prev)) {
        const t = TEMPLATES.find((x) => x.id === id)
        if (t && isTemplateAvailable(t, availability)) next[id] = n
      }
      return next
    })
  }, [availability])

  const adjust = (id: string, delta: number): void => {
    setCounts((prev) => {
      const current = prev[id] ?? 0
      const next = current + delta
      if (next <= 0) {
        const { [id]: _drop, ...rest } = prev
        return rest
      }
      // Derive the running total from `prev` (not the render-time `assigned`)
      // so batched +clicks can't push the sum past the chosen terminal count.
      if (delta > 0) {
        const total = Object.values(prev).reduce((s, n) => s + n, 0)
        if (total >= terminalCount) return prev
      }
      return { ...prev, [id]: next }
    })
  }

  const browse = async (): Promise<void> => {
    const picked = await pickDirectory()
    if (picked) setFolder(picked)
  }

  const submit = (): void => {
    if (trimmedFolder === '') return
    addRecentFolder(trimmedFolder)
    createWorkspace({
      cwd: trimmedFolder,
      terminalCount,
      agentIds: allocateAgents(terminalCount, counts)
    })
  }

  return (
    <div className="mx-auto flex min-h-full max-w-4xl flex-col justify-center px-10 py-8">
      <header>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">Swarmterm</h1>
        <p className="mt-1 text-base text-muted-foreground">Run many terminals, side by side.</p>
      </header>

      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Start a workspace
      </h2>

      <div className="mt-4 space-y-5">
        <Section title="Working folder" hint="Where your terminals will start">
          <>
            <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 focus-within:ring-1 focus-within:ring-ring">
              <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
                placeholder="Choose a folder…"
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <Button variant="ghost" size="sm" onClick={() => void browse()}>
                <FolderSearch className="h-4 w-4" />
                Browse
              </Button>
            </div>
            {recents.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-xs font-medium text-muted-foreground">Recent</div>
                <div className="space-y-px">
                  {visibleRecents.map((path) => (
                    <RecentRow
                      key={path}
                      path={path}
                      onUse={() => setFolder(path)}
                      onRemove={() => removeRecentFolder(path)}
                    />
                  ))}
                </div>
                {hasMoreRecents && (
                  <button
                    type="button"
                    onClick={() => setPaletteOpen(true)}
                    className="mt-1 px-2 py-1 text-xs font-medium text-primary hover:underline"
                  >
                    More…
                  </button>
                )}
              </div>
            )}
          </>
        </Section>

        <Section
          title="How many terminals?"
          hint="Tap a tile to choose a layout"
          aside={`${terminalCount} terminal${terminalCount > 1 ? 's' : ''} · ${rows}×${cols} grid`}
        >
          <div className="grid grid-cols-[repeat(auto-fit,minmax(72px,1fr))] gap-2">
            {TERMINAL_COUNTS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setTerminalCount(n)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors',
                  n === terminalCount
                    ? 'border-ring bg-accent text-foreground'
                    : 'border-border text-muted-foreground hover:border-ring/50 hover:bg-accent/40'
                )}
              >
                <GridPreview count={n} />
                <span className="text-xs font-medium tabular-nums">{n}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section
          title="Agents"
          hint="Chọn số lượng mỗi agent — phần còn lại là Terminal thường"
          aside={`Đã gán ${assigned} / ${terminalCount}`}
        >
          <div className="space-y-2">
            {agentTemplates.map((t) => {
              const available = isTemplateAvailable(t, availability)
              const n = counts[t.id] ?? 0
              return (
                <div
                  key={t.id}
                  aria-disabled={!available}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border border-border p-3',
                    !available && 'opacity-50'
                  )}
                >
                  <AgentIcon template={t} className="h-5 w-5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">{t.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {available ? t.description : 'Chưa cài'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={!available || n === 0}
                      onClick={() => adjust(t.id, -1)}
                      aria-label={`Giảm ${t.name}`}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span aria-live="polite" className="w-6 text-center text-sm font-medium tabular-nums">{n}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={!available || assigned >= terminalCount}
                      onClick={() => adjust(t.id, 1)}
                      aria-label={`Tăng ${t.name}`}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
            <div className="px-1 text-xs text-muted-foreground">
              Terminal (phần còn lại): <span className="tabular-nums">{Math.max(0, remaining)}</span>
            </div>
          </div>
        </Section>

        <div className="flex justify-end pt-2">
          <Button onClick={submit} disabled={trimmedFolder === ''}>
            Create workspace
          </Button>
        </div>
      </div>

      {paletteOpen && (
        <RecentFoldersPalette
          recents={recents}
          onSelect={setFolder}
          onRemove={removeRecentFolder}
          onClose={() => setPaletteOpen(false)}
        />
      )}
    </div>
  )
}

interface SectionProps {
  title: string
  hint: string
  aside?: string
  children: ReactElement
}

/** A labelled form section: bold title, muted hint, optional right-aligned aside. */
function Section({ title, hint, aside, children }: SectionProps): ReactElement {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          <span className="text-xs text-muted-foreground">{hint}</span>
        </div>
        {aside && (
          <span className="shrink-0 rounded-md bg-accent px-2 py-0.5 text-xs text-accent-foreground">
            {aside}
          </span>
        )}
      </div>
      {children}
    </section>
  )
}

interface RecentRowProps {
  path: string
  onUse: () => void
  onRemove: () => void
}

/** One recent-folder row: click the name/path to reuse it; a hover/focus ✕ removes it. */
function RecentRow({ path, onUse, onRemove }: RecentRowProps): ReactElement {
  const name = folderName(path)
  return (
    <div className="group flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent/40">
      <button
        type="button"
        onClick={onUse}
        title={path}
        className="flex min-w-0 flex-1 items-baseline gap-2 text-left"
      >
        <span className="shrink-0 text-sm text-primary">{name}</span>
        <span className="min-w-0 truncate text-xs text-muted-foreground">{path}</span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${name} from recents`}
        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus:opacity-100 group-hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

/** A miniature grid icon showing the layout `count` terminals will produce. */
function GridPreview({ count }: { count: number }): ReactElement {
  const { rows, cols } = gridFor(count)
  return (
    <div
      className="grid h-6 w-8 gap-[2px]"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`
      }}
    >
      {Array.from({ length: rows * cols }, (_, i) => (
        <div key={i} className="rounded-[1px] bg-current opacity-70" />
      ))}
    </div>
  )
}
