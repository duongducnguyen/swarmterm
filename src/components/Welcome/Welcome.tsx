import { useEffect, useState, type ReactElement } from 'react'
import { Folder, FolderSearch, X } from 'lucide-react'
import { gridFor, TERMINAL_COUNTS } from '@/lib/layout-tree'
import { DEFAULT_TEMPLATE_ID, TEMPLATES } from '@/lib/templates'
import { useAppStore } from '@/store/app-store'
import { AgentIcon } from '@/components/AgentIcon'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { pickDirectory, getHomeDir } from '@/tauri/dialog'
import {
  addRecent,
  folderName,
  readRecents,
  removeRecent,
  storeRecents
} from '@/lib/recent-folders'

/**
 * Welcome page shown in place of a workspace while creating one (or when none
 * exist yet). A branded header plus an inline "Start a workspace" form: pick a
 * working folder, a terminal-grid size, and a template. Replaces the old modal
 * setup wizard; creating a workspace closes Welcome via the store.
 */
export function Welcome(): ReactElement {
  const createWorkspace = useAppStore((s) => s.createWorkspace)
  const [folder, setFolder] = useState('')
  const [terminalCount, setTerminalCount] = useState<number>(TERMINAL_COUNTS[0])
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_ID)
  const [recents, setRecents] = useState<string[]>(() => readRecents(window.localStorage))

  // Pre-fill the home directory on mount.
  useEffect(() => {
    void getHomeDir().then(setFolder)
  }, [])

  const trimmedFolder = folder.trim()
  const { rows, cols } = gridFor(terminalCount)

  const browse = async (): Promise<void> => {
    const picked = await pickDirectory()
    if (picked) setFolder(picked)
  }

  const submit = (): void => {
    if (trimmedFolder === '') return
    const next = addRecent(recents, trimmedFolder)
    setRecents(next)
    storeRecents(window.localStorage, next)
    createWorkspace({ cwd: trimmedFolder, terminalCount, templateId })
  }

  const removeRecentFolder = (path: string): void => {
    const next = removeRecent(recents, path)
    setRecents(next)
    storeRecents(window.localStorage, next)
  }

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center px-10 py-12">
      <header>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">Swarmterm</h1>
        <p className="mt-1 text-base text-muted-foreground">Run many terminals, side by side.</p>
      </header>

      <h2 className="mt-10 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Start a workspace
      </h2>

      <div className="mt-4 space-y-6">
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
                <div className="max-h-56 space-y-px overflow-y-auto">
                  {recents.map((path) => (
                    <RecentRow
                      key={path}
                      path={path}
                      onUse={() => setFolder(path)}
                      onRemove={() => removeRecentFolder(path)}
                    />
                  ))}
                </div>
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

        <Section title="Template" hint="What each terminal runs on start">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTemplateId(t.id)}
                className={cn(
                  'min-w-0 rounded-lg border p-3 text-left transition-colors',
                  t.id === templateId
                    ? 'border-ring bg-accent'
                    : 'border-border hover:border-ring/50 hover:bg-accent/40'
                )}
              >
                <div className="flex items-center gap-2">
                  <AgentIcon template={t} className="h-5 w-5 shrink-0" />
                  <div className="text-sm font-medium text-foreground">{t.name}</div>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{t.description}</div>
              </button>
            ))}
          </div>
        </Section>

        <div className="flex justify-end pt-2">
          <Button onClick={submit} disabled={trimmedFolder === ''}>
            Create workspace
          </Button>
        </div>
      </div>
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
