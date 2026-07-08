import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Folder, FolderSearch, X, Minus, Plus } from 'lucide-react'
import {
  TEMPLATES,
  DEFAULT_TEMPLATE_ID,
  isTemplateAvailable,
  templateById
} from '@/lib/templates'
import { TERMINAL_COUNTS, layoutSummary } from '@/lib/layout-tree'
import { allocateAgents, clampCounts } from '@/lib/agent-allocation'
import { useAgentAvailabilityStore } from '@/store/agent-availability-store'
import { useAppStore } from '@/store/app-store'
import { AgentIcon } from '@/components/AgentIcon'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { pickDirectory, getHomeDir } from '@/tauri/dialog'
import { listWorktrees, createWorktree, ensureRepoWithCommit } from '@/tauri/git'
import { planWorktreeBranches, provisionWorktrees } from '@/lib/worktree-naming'
import { folderName } from '@/lib/recent-folders'
import { useRecentsStore } from '@/store/recents-store'
import { LayoutPreview } from './LayoutPreview'

const DEFAULT_TERMINAL_COUNT = 2
/** Cap for recent folder rows kept in the list; the list area scrolls if they
 *  exceed the column height, so this is generous (fills the left column). */
const MAX_RECENTS = 50

/** Templates that run an AI agent CLI. Plain Terminal (command: null) is
 *  excluded here because it fills the remainder automatically via allocateAgents. */
const CODING_TEMPLATES = TEMPLATES.filter((t) => t.command !== null)

/**
 * Welcome page shown while creating a workspace (or when none exist). A
 * two-panel composer: left column picks a working folder and shows recent
 * folders; right column sets the terminal count via tiles, lets the user
 * assign AI agent quantities via steppers, shows a live layout preview, and
 * has the Create button. Creating a workspace closes Welcome via the store.
 */
export function Welcome(): ReactElement {
  const createWorkspace = useAppStore((s) => s.createWorkspace)
  const folder = useAppStore((s) => s.welcomeFolder)
  const setFolder = useAppStore((s) => s.setWelcomeFolder)
  const recents = useRecentsStore((s) => s.recents)
  const addRecentFolder = useRecentsStore((s) => s.add)
  const removeRecentFolder = useRecentsStore((s) => s.remove)
  const availability = useAgentAvailabilityStore((s) => s.availability)

  const [terminalCount, setTerminalCount] = useState<number>(DEFAULT_TERMINAL_COUNT)
  // Optimistic seed: 1 Claude Code assigned until the probe says it's not installed.
  const [counts, setCounts] = useState<Record<string, number>>({ 'claude-code': 1 })
  const seededRef = useRef(false)

  const [isolateWorktrees, setIsolateWorktrees] = useState(false)
  const [isGitRepo, setIsGitRepo] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Pre-fill the home directory on mount, unless a folder is already chosen.
  useEffect(() => {
    void getHomeDir().then((home) => {
      if (useAppStore.getState().welcomeFolder === '') setFolder(home)
    })
  }, [setFolder])

  // Re-probe installed agent CLIs every time Welcome mounts so a CLI installed
  // while the app runs is picked up without a restart.
  useEffect(() => {
    void useAgentAvailabilityStore.getState().refresh()
  }, [])

  // Correct the seed once the availability probe resolves: if claude-code
  // is not installed, clear the optimistic assignment. Runs once only — the
  // seededRef guard prevents fighting the user's subsequent edits.
  useEffect(() => {
    if (seededRef.current) return
    seededRef.current = true
    const claude = TEMPLATES.find((t) => t.id === 'claude-code')
    if (claude && !isTemplateAvailable(claude, availability)) {
      setCounts({})
    }
  }, [availability])

  const totalAssigned = Object.values(counts).reduce((a, b) => a + b, 0)

  const changeTerminalCount = (next: number): void => {
    setTerminalCount(next)
    // Clamp assigned counts so they never exceed the new terminal total.
    setCounts((c) => clampCounts(c, next))
  }

  // Ordered agent ids — drives both the layout preview and createWorkspace.
  // Templates appear in TEMPLATES order, unassigned slots fill with 'terminal'.
  const agentIds = allocateAgents(terminalCount, counts)

  const trimmedFolder = folder.trim()
  const canCreate = trimmedFolder !== ''

  // Probe whether the chosen folder is inside a git repo. list returns []
  // for non-repos and for the home-dir guard.
  useEffect(() => {
    if (trimmedFolder === '') {
      setIsGitRepo(false)
      return
    }
    let cancelled = false
    void listWorktrees(trimmedFolder)
      .then((trees) => {
        if (cancelled) return
        // A repo with an unborn HEAD (fresh `git init`, zero commits) lists
        // its main worktree with an all-zero head. `git worktree add` cannot
        // check out from an unborn HEAD, so we disable this feature until
        // the repo has at least one commit.
        const main = trees.find((t) => t.isMain)
        const unborn = main !== undefined && /^0+$/.test(main.head)
        setIsGitRepo(trees.length > 0 && !unborn)
      })
      .catch(() => {
        if (!cancelled) {
          setIsGitRepo(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [trimmedFolder])

  const browse = async (): Promise<void> => {
    const picked = await pickDirectory()
    if (picked) setFolder(picked)
  }

  const submit = async (): Promise<void> => {
    // isSubmitting guards against a second Create click (or a duplicate
    // Ctrl+Enter) firing while worktree provisioning is still in flight —
    // without it, a slow `git worktree add` could be kicked off twice for
    // the same plan, racing two workspaces into existence.
    if (!canCreate || isSubmitting) return
    setIsSubmitting(true)
    try {
      addRecentFolder(trimmedFolder)

      const isolate = isolateWorktrees
      let paneWorktrees: ({ path: string; branch: string } | null)[] | undefined

      if (isolate) {
        try {
          // Auto-initialize git if folder is not a repo and has no commits
          await ensureRepoWithCommit(trimmedFolder)
        } catch (err) {
          setIsSubmitting(false)
          console.error('failed to initialize git repo:', err)
          return
        }

        // Provision isolation BEFORE the workspace exists: leaves are born inside
        // their worktrees, so no pane ever runs on the main checkout by accident
        // (v2 spec — the toggle is a guarantee, not a suggestion to the agent).
        const plan = planWorktreeBranches(agentIds)
        paneWorktrees = await provisionWorktrees(plan, (name) =>
          createWorktree(trimmedFolder, name)
        )
      }

      createWorkspace({
        cwd: trimmedFolder,
        terminalCount,
        agentIds,
        worktreeMode: isolate,
        paneWorktrees
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Document-level Ctrl/⌘+Enter shortcut — fires even when nothing in the
  // composer has focus (nothing is focused on first mount). Re-registered
  // whenever inputs change to avoid stale-closure bugs.
  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        void submit()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [trimmedFolder, terminalCount, counts, isolateWorktrees, isGitRepo, isSubmitting]) // eslint-disable-line react-hooks/exhaustive-deps

  // Build caption: "4 panes · 2×2 · 2 AI agents · 2 Terminals"
  const aiCount = agentIds.filter((id) => id !== DEFAULT_TEMPLATE_ID).length
  const termCount = agentIds.length - aiCount
  const aiClause =
    aiCount > 0 ? ` · ${aiCount} ${aiCount === 1 ? 'AI agent' : 'AI agents'}` : ''
  const termClause = ` · ${termCount} ${termCount === 1 ? 'Terminal' : 'Terminals'}`
  const caption = `${layoutSummary(terminalCount)}${aiClause}${termClause}`

  // Unique agent types present in the layout, in first-appearance order —
  // so the legend exactly matches what the preview shows.
  const legendIds = [...new Set(agentIds)]

  const visibleRecents = recents.slice(0, MAX_RECENTS)

  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col justify-center px-10 py-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Swarmterm</h1>
        <p className="mt-1 text-base text-muted-foreground">Run many terminals, side by side.</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        {/* LEFT: COMPOSE — working folder + recent folders */}
        <section className="flex min-h-0 min-w-0 flex-col rounded-xl border border-border bg-card p-4">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Compose
          </h2>

          {/* Working folder */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Working folder
            </label>
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
          </div>

          {/* Recent folders — inline list, capped at MAX_RECENTS rows */}
          {visibleRecents.length > 0 && (
            <div className="mt-5 flex min-h-0 flex-1 flex-col">
              <p className="mb-2 shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Recent
              </p>
              <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
                {visibleRecents.map((path) => (
                  <div
                    key={path}
                    role="button"
                    tabIndex={0}
                    onClick={() => setFolder(path)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setFolder(path)
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
                    <span
                      title={path}
                      className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
                    >
                      {path}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeRecentFolder(path)
                      }}
                      aria-label={`Remove ${folderName(path)} from recents`}
                      className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* RIGHT: TERMINALS — tile count selector + AI agent steppers + live preview + create */}
        <section className="flex min-h-0 min-w-0 flex-col rounded-xl border border-border bg-card p-4">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Terminals
          </h2>

          {/* How many terminals? */}
          <div className="mb-4">
            <p className="mb-2 text-sm font-medium text-foreground">How many terminals?</p>
            <div className="flex flex-wrap gap-1.5">
              {TERMINAL_COUNTS.map((count) => {
                const selected = count === terminalCount
                return (
                  <button
                    key={count}
                    type="button"
                    onClick={() => changeTerminalCount(count)}
                    aria-pressed={selected}
                    className={cn(
                      'flex h-9 min-w-[2.25rem] items-center justify-center rounded-md border px-2 text-sm font-medium transition-colors',
                      selected
                        ? 'border-ring bg-accent text-foreground ring-1 ring-ring'
                        : 'border-border text-muted-foreground hover:border-ring/50 hover:bg-accent/40 hover:text-foreground'
                    )}
                  >
                    {count}
                  </button>
                )
              })}
            </div>
          </div>

          {/* AI agents — one stepper row per coding template; plain Terminal
              fills the remaining slots automatically via allocateAgents. */}
          <div className="mb-4">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">AI agents</p>
              <span className="text-xs text-muted-foreground">
                used {totalAssigned} / {terminalCount}
              </span>
            </div>
            <div className="space-y-1.5">
              {CODING_TEMPLATES.map((t) => {
                const available = isTemplateAvailable(t, availability)
                const count = counts[t.id] ?? 0
                // Full when every slot is allocated; block adding more until
                // the user either increases the terminal count or reduces another agent.
                const atCapacity = totalAssigned >= terminalCount
                return (
                  <div key={t.id} className="flex items-center gap-2">
                    <AgentIcon template={t} className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-sm text-foreground">{t.name}</span>
                    {available ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Remove one ${t.name}`}
                          disabled={count === 0}
                          onClick={() =>
                            setCounts((prev) => {
                              const next = { ...prev }
                              const n = (next[t.id] ?? 0) - 1
                              if (n <= 0) delete next[t.id]
                              else next[t.id] = n
                              return next
                            })
                          }
                          className={cn(
                            'flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground transition-colors',
                            count === 0
                              ? 'cursor-not-allowed opacity-40'
                              : 'hover:border-ring/50 hover:bg-accent/40 hover:text-foreground'
                          )}
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={count}
                          min={0}
                          aria-label={`${t.name} count`}
                          onChange={(e) => {
                            const parsed = parseInt(e.target.value, 10)
                            const newVal = isNaN(parsed) ? 0 : parsed
                            const remaining = terminalCount - totalAssigned
                            const maxForThis = count + Math.max(0, remaining)
                            const clamped = Math.max(0, Math.min(newVal, maxForThis))
                            setCounts((prev) => {
                              const next = { ...prev }
                              if (clamped <= 0) delete next[t.id]
                              else next[t.id] = clamped
                              return next
                            })
                          }}
                          className="w-[3ch] rounded border border-input bg-background px-1 text-center text-sm tabular-nums text-foreground outline-none focus:ring-1 focus:ring-ring [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        />
                        <button
                          type="button"
                          aria-label={`Add one ${t.name}`}
                          disabled={atCapacity}
                          onClick={() =>
                            setCounts((prev) => ({ ...prev, [t.id]: (prev[t.id] ?? 0) + 1 }))
                          }
                          className={cn(
                            'flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground transition-colors',
                            atCapacity
                              ? 'cursor-not-allowed opacity-40'
                              : 'hover:border-ring/50 hover:bg-accent/40 hover:text-foreground'
                          )}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Not installed</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Live preview — fixed, bounded height so the panel stays compact and
              the whole Welcome fits the window without scrolling; the grid scales
              down within this box at high pane counts. */}
          <div className="mb-3">
            <p className="mb-1.5 text-xs text-muted-foreground">Preview</p>
            <div className="h-[175px]">
              <LayoutPreview terminalCount={terminalCount} agents={agentIds} />
            </div>
          </div>

          {/* Caption */}
          <p className="mb-4 text-center text-xs tabular-nums text-muted-foreground">{caption}</p>

          {/* Agent legend — only shown when more than one agent type is used,
              so an all-Terminal layout (no AI agents) hides the redundant legend. */}
          {legendIds.length > 1 && (
            <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
              {legendIds.map((id) => {
                const t = templateById(id)
                return (
                  <span key={id} className="flex items-center gap-1 text-xs text-muted-foreground">
                    <AgentIcon template={t} className="h-3.5 w-3.5" />
                    {t.name}
                  </span>
                )
              })}
            </div>
          )}

          {/* Worktree isolation — enables the MCP worktree tools per workspace */}
          <label
            className={cn(
              'mb-3 flex cursor-pointer items-start gap-2',
              !isGitRepo && 'cursor-not-allowed opacity-50'
            )}
            title={isGitRepo ? undefined : 'Will auto-initialize git when you create'}
          >
            <input
              type="checkbox"
              disabled={false}
              checked={isolateWorktrees}
              onChange={(e) => setIsolateWorktrees(e.target.checked)}
              className="mt-0.5 accent-current"
            />
            <span>
              <span className="block text-sm font-medium text-foreground">
                Isolate features in git worktrees
              </span>
              <span className="block text-xs text-muted-foreground">
                Each agent pane starts in its own worktree and branch.
              </span>
            </span>
          </label>

          {/* Create workspace button */}
          <div className="mt-auto">
            <Button
              className="w-full"
              onClick={() => void submit()}
              disabled={!canCreate || isSubmitting}
            >
              {isSubmitting ? 'Creating worktrees…' : 'Create workspace'}
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {canCreate ? 'Press ⌘↵ / Ctrl+↵ to create' : 'Choose a working folder to continue'}
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
