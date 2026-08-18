import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { LeafNode } from '@/lib/layout-tree'
import { collectLeaves } from '@/lib/layout-tree'
import { useAppStore, type ClearTarget } from '@/store/app-store'
import { useTerminalPrefStore } from '@/store/terminal-pref-store'
import { useTerminalTitleStore } from '@/store/terminal-title-store'
import { useTerminalSearchStore } from '@/store/terminal-search-store'
import { Button } from '@/components/ui/button'
import { HeldDeliveryPill } from '@/components/TerminalPane/HeldDeliveryPill'
import { SearchOverlay } from '@/components/TerminalPane/SearchOverlay'
import { PaneHeader } from './PaneHeader'
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from '@/components/ui/context-menu'
import { ClearWorktreeDialog, type DialogTarget } from '@/components/Workspace/ClearWorktreeDialog'
import { getChangedFiles, branchUnmergedCount } from '@/tauri/git'
import { classifyWorktree, clearWorktreeMenuLabel } from '@/lib/worktree-cleanup'
import { agentCommand, DEFAULT_TEMPLATE_ID } from '@/lib/templates'
import { buildAgentSpawnCommand, shellFlavor } from '@/lib/agent-spawn-command'
import { buildResumeCommand } from '@/lib/resume-command'
import { isWindowsPlatform } from '@/lib/platform'
import { pickDirectory } from '@/tauri/dialog'
import { cn } from '@/lib/utils'
import {
  attachTerminal,
  detachTerminal,
  focusTerminal,
  getTerminalStatus,
  respawnTerminal,
  retryTerminal,
  subscribeTerminalStatus,
  type TerminalStatus
} from '@/lib/terminal-registry'

interface TerminalPaneProps {
  leaf: LeafNode
  /** Working directory the terminal's shell starts in. */
  cwd: string
  isFocused: boolean
  /** Whether broadcast mode is armed for this workspace. */
  broadcastActive: boolean
  /** Whether this pane is in the broadcast group. */
  isBroadcastMember: boolean
  /** Whether the workspace exposes MCP worktree tools to every terminal. */
  worktreeMode: boolean
}

/**
 * One terminal pane: a mount point for a live terminal owned by the registry.
 * The xterm instance and its pty persist in the registry across mounts, so
 * this component only attaches/detaches the terminal's DOM — closing a sibling
 * pane (which remounts this one as the split tree collapses) no longer kills or
 * re-spawns the shell. The pty is killed only when the leaf is truly removed.
 */
export function TerminalPane({
  leaf,
  cwd,
  isFocused,
  broadcastActive,
  isBroadcastMember,
  worktreeMode
}: TerminalPaneProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)

  const splitPane = useAppStore((s) => s.splitPane)
  const closePane = useAppStore((s) => s.closePane)
  const setFocusedLeaf = useAppStore((s) => s.setFocusedLeaf)
  const toggleBroadcastMember = useAppStore((s) => s.toggleBroadcastMember)
  const setPaneAgent = useAppStore((s) => s.setPaneAgent)
  const setPaneCwd = useAppStore((s) => s.setPaneCwd)
  const setPaneShell = useAppStore((s) => s.setPaneShell)
  const clearWorktrees = useAppStore((s) => s.clearWorktrees)
  const globalShellId = useTerminalPrefStore((s) => s.shellId)
  const isDropTarget = useAppStore((s) => s.dropTargetTerminalId === leaf.terminalId)

  const { id: leafId, terminalId } = leaf

  const agentTitle = useTerminalTitleStore((s) => s.titles[terminalId])
  // Narrow boolean selector: only THIS pane re-renders when the find overlay
  // opens/closes for it, not every pane on every keystroke in some other one
  // (the overlay owns its own query/toggle state, not the store).
  const searchOpen = useTerminalSearchStore((s) => s.openFor === terminalId)

  // Reorder-DnD: the whole pane root is both the drop target AND the draggable
  // node (so the drag overlay assumes the pane's size); the header (below) is the
  // grab handle via setActivatorNodeRef. Both keyed by leafId — dnd-kit keeps the
  // draggable and droppable namespaces separate, so the shared id is fine. The
  // live terminal is keyed by terminalId in the registry, so a reorder only
  // re-parents this pane's DOM, never killing the shell.
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: leafId })
  const {
    setNodeRef: setDragRef,
    setActivatorNodeRef,
    listeners: dragListeners,
    attributes: dragAttributes,
    isDragging
  } = useDraggable({ id: leafId })

  // The pane root carries both refs (drop target + draggable node).
  const setPaneRef = (el: HTMLDivElement | null): void => {
    setDropRef(el)
    setDragRef(el)
  }

  // Resolve each per-pane value against its default.
  const resolvedCwd = leaf.cwd ?? cwd
  const resolvedShellId = leaf.shellId ?? globalShellId
  const resolvedAgentId = leaf.agentId ?? DEFAULT_TEMPLATE_ID
  const baseCommand = agentCommand(resolvedAgentId)
  // A resume pane re-enters a session the CLI recorded on disk; the resume
  // line wins over the worker-brief path (a resume leaf never carries
  // initialPrompt — see createWorkspace).
  const resumeCommand =
    leaf.resumeSessionId !== undefined
      ? buildResumeCommand(resolvedAgentId, leaf.resumeSessionId)
      : undefined
  // Worker panes carry a one-shot task brief; quote it for the shell the pty
  // actually types into (initialCommand is a typed line, not an exec).
  const resolvedCommand =
    resumeCommand ??
    (baseCommand !== undefined && leaf.initialPrompt !== undefined
      ? buildAgentSpawnCommand(
          baseCommand,
          leaf.initialPrompt,
          shellFlavor(resolvedShellId, isWindowsPlatform())
        )
      : baseCommand)
  // Published to the DOM so the app-level file-drop listener can quote paths
  // for this pane's shell without re-deriving the resolution chain.
  const paneShellFlavor = shellFlavor(resolvedShellId, isWindowsPlatform())

  const [status, setStatus] = useState<TerminalStatus>(() => getTerminalStatus(terminalId))

  // Attach the live terminal to this pane's container and mirror its status.
  // Keyed on terminalId only: remounts (sibling close → tree collapse) re-attach
  // the same live terminal; config changes are handled by the respawn effect.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    attachTerminal(terminalId, container, {
      cwd: resolvedCwd,
      shellId: resolvedShellId,
      initialCommand: resolvedCommand,
      worktreeMode: worktreeMode || undefined,
      repoRoot: worktreeMode ? cwd : undefined,
      agentId: resolvedAgentId
    })
    setStatus(getTerminalStatus(terminalId))
    const unsubscribe = subscribeTerminalStatus(terminalId, () =>
      setStatus(getTerminalStatus(terminalId))
    )

    return () => {
      unsubscribe()
      detachTerminal(terminalId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalId])

  // Respawn the pty when a resolved value changes after mount. The ref starts at
  // the mount-time values, so the first run is a no-op (no respawn on mount or
  // remount); only a genuine agent/path/shell switch triggers a restart.
  const appliedRef = useRef({
    cwd: resolvedCwd,
    shellId: resolvedShellId,
    command: resolvedCommand,
    agentId: resolvedAgentId
  })
  useEffect(() => {
    const prev = appliedRef.current
    if (
      prev.cwd === resolvedCwd &&
      prev.shellId === resolvedShellId &&
      prev.command === resolvedCommand &&
      prev.agentId === resolvedAgentId
    ) {
      return
    }
    appliedRef.current = {
      cwd: resolvedCwd,
      shellId: resolvedShellId,
      command: resolvedCommand,
      agentId: resolvedAgentId
    }
    respawnTerminal(terminalId, {
      cwd: resolvedCwd,
      shellId: resolvedShellId,
      initialCommand: resolvedCommand,
      worktreeMode: worktreeMode || undefined,
      repoRoot: worktreeMode ? cwd : undefined,
      agentId: resolvedAgentId
    })
    // A same-id respawn (agent/cwd/shell switch) starts a new session; the old
    // agent's title no longer describes it. Clear it — the new agent re-titles.
    useTerminalTitleStore.getState().clearTitle(terminalId)
  }, [terminalId, resolvedCwd, resolvedShellId, resolvedCommand, resolvedAgentId])

  // Pull keyboard focus into xterm when this pane becomes the focused one.
  useEffect(() => {
    if (isFocused) focusTerminal(terminalId)
  }, [isFocused, terminalId])

  async function handleChoosePath(): Promise<void> {
    const dir = await pickDirectory()
    if (dir) setPaneCwd(leafId, dir)
  }

  const [dialog, setDialog] = useState<{ targets: DialogTarget[]; clears: ClearTarget[] } | null>(null)
  // Lazily computed when the context menu opens (see the ContextMenu wrapper
  // below) rather than on every render of every pane.
  const [menuTargetCount, setMenuTargetCount] = useState(0)

  // Resolve which panes this action targets: the broadcast group if THIS leaf is
  // in it, else just this pane — then keep only panes bound to a worktree.
  function resolveWorktreeTargets(): ClearTarget[] {
    const st = useAppStore.getState()
    const ws = st.workspaces.find((w) => w.id === st.activeWorkspaceId)
    if (!ws) return []
    const inGroup = ws.broadcastLeafIds.includes(leafId)
    const leaves = collectLeaves(ws.layout).filter((l) =>
      inGroup ? ws.broadcastLeafIds.includes(l.id) : l.id === leafId
    )
    return leaves
      .filter((l) => l.worktreeBranch !== undefined && l.cwd !== undefined)
      .map((l) => ({
        leafId: l.id,
        terminalId: l.terminalId,
        path: l.cwd as string,
        branch: l.worktreeBranch as string,
        repoRoot: ws.cwd
      }))
  }

  async function openClearDialog(): Promise<void> {
    const clears = resolveWorktreeTargets()
    if (clears.length === 0) return
    const targets: DialogTarget[] = await Promise.all(
      clears.map(async (c) => {
        try {
          const changed = await getChangedFiles(c.path)
          const unmerged = await branchUnmergedCount(c.repoRoot, c.branch)
          const { uncommittedCount, unmergedCount, dirty } = classifyWorktree(changed, unmerged)
          return { leafId: c.leafId, branch: c.branch, uncommittedCount, unmergedCount, dirty }
        } catch (e) {
          // An uninspectable worktree is treated as having unsaved work so it is
          // protected (unchecked), never silently auto-removed.
          console.warn(`inspect worktree failed for ${c.branch}:`, e)
          return { leafId: c.leafId, branch: c.branch, uncommittedCount: 0, unmergedCount: 0, dirty: true }
        }
      })
    )
    setDialog({ targets, clears })
  }

  function confirmClear(approvedLeafIds: string[]): void {
    if (!dialog) return
    const approved = dialog.clears.filter((c) => approvedLeafIds.includes(c.leafId))
    void clearWorktrees(approved)
    setDialog(null)
  }

  const pane = (
    <div
      ref={setPaneRef}
      onMouseDown={(e) => {
        // Alt+Click adds/removes this pane from the broadcast group instead of
        // focusing it. Ctrl/Cmd is avoided — xterm's WebLinks addon uses it.
        if (e.altKey) {
          e.preventDefault()
          toggleBroadcastMember(leafId)
          return
        }
        setFocusedLeaf(leafId)
      }}
      // Clicking pane chrome (header, borders) blurs xterm; App.tsx returns the
      // keyboard to the terminal on the way back up (lib/terminal-focus.ts).
      data-focus-return
      data-terminal-id={terminalId}
      data-leaf-id={leafId}
      data-shell-flavor={paneShellFlavor}
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-md border bg-background',
        isFocused
          ? 'border-ring'
          : isBroadcastMember
            ? 'border-broadcast'
            : 'border-pane-border',
        // Dim non-members while the mode is on, so the group reads at a glance.
        broadcastActive && !isBroadcastMember && 'opacity-60',
        // Drop-target ring while another pane is dragged over this one.
        isOver && !isDragging && 'ring-2 ring-inset ring-ring',
        // OS file drag hovering this pane — same affordance as the pane-reorder
        // drop ring, in the accent color so the two gestures read differently.
        isDropTarget && 'ring-2 ring-inset ring-primary',
        // Dim the pane being dragged, so the lifted ghost reads as the "real" one.
        isDragging && 'opacity-40'
      )}
    >
      <PaneHeader
        agentId={resolvedAgentId}
        shellId={resolvedShellId}
        resolvedCwd={resolvedCwd}
        hasCwdOverride={leaf.cwd !== undefined}
        onAgentChange={(id) => setPaneAgent(leafId, id)}
        onShellChange={(id) => setPaneShell(leafId, id)}
        onChoosePath={() => void handleChoosePath()}
        onResetPath={() => setPaneCwd(leafId, undefined)}
        onSplitRight={() => splitPane(leafId, 'horizontal')}
        onSplitDown={() => splitPane(leafId, 'vertical')}
        onClose={() => closePane(leafId)}
        broadcastActive={broadcastActive}
        isBroadcastMember={isBroadcastMember}
        onToggleBroadcast={() => toggleBroadcastMember(leafId)}
        dragHandleRef={setActivatorNodeRef}
        dragListeners={dragListeners}
        dragAttributes={dragAttributes}
        worktreeBranch={leaf.worktreeBranch}
        agentTitle={agentTitle}
      />

      <ClearWorktreeDialog
        open={dialog !== null}
        targets={dialog?.targets ?? []}
        onConfirm={confirmClear}
        onClose={() => setDialog(null)}
      />

      <div className="relative flex-1 overflow-hidden">
        <div ref={containerRef} className="absolute inset-0" />

        <HeldDeliveryPill terminalId={terminalId} />
        {searchOpen && <SearchOverlay terminalId={terminalId} />}

        {status.kind === 'error' && (
          <StatusOverlay
            title="Could not start the terminal"
            detail={status.message}
            actionLabel="Retry"
            onAction={() => retryTerminal(terminalId)}
          />
        )}
        {status.kind === 'exited' && (
          <StatusOverlay
            title="Process exited"
            detail={`Exit code ${status.exitCode}`}
            actionLabel="Restart"
            onAction={() => retryTerminal(terminalId)}
          />
        )}
      </div>
    </div>
  )

  // Right-click anywhere in the pane (header or the terminal body) opens the
  // context menu — the whole pane is the trigger, not just the header. xterm
  // doesn't use right-click, so capturing it here steals no terminal action.
  return (
    <ContextMenu onOpenChange={(open) => { if (open) setMenuTargetCount(resolveWorktreeTargets().length) }}>
      <ContextMenuTrigger asChild>{pane}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          disabled={menuTargetCount === 0}
          onSelect={() => void openClearDialog()}
        >
          {clearWorktreeMenuLabel(menuTargetCount)}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

interface StatusOverlayProps {
  title: string
  detail: string
  actionLabel: string
  onAction: () => void
}

function StatusOverlay({ title, detail, actionLabel, onAction }: StatusOverlayProps): React.ReactElement {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/90 p-4 text-center">
      <AlertTriangle className="h-6 w-6 text-destructive" />
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 max-w-sm break-words text-xs text-muted-foreground">{detail}</p>
      </div>
      <Button variant="secondary" size="sm" onClick={onAction}>
        <RotateCw className="h-3.5 w-3.5" />
        {actionLabel}
      </Button>
    </div>
  )
}
