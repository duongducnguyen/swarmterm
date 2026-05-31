import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'
import type { LeafNode } from '@/lib/layout-tree'
import { useAppStore } from '@/store/app-store'
import { useTerminalPrefStore } from '@/store/terminal-pref-store'
import { Button } from '@/components/ui/button'
import { PaneHeader } from './PaneHeader'
import { agentCommand, DEFAULT_TEMPLATE_ID } from '@/lib/templates'
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
}

/**
 * One terminal pane: a mount point for a live terminal owned by the registry.
 * The xterm instance and its pty persist in the registry across mounts, so
 * this component only attaches/detaches the terminal's DOM — closing a sibling
 * pane (which remounts this one as the split tree collapses) no longer kills or
 * re-spawns the shell. The pty is killed only when the leaf is truly removed.
 */
export function TerminalPane({ leaf, cwd, isFocused }: TerminalPaneProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)

  const splitPane = useAppStore((s) => s.splitPane)
  const closePane = useAppStore((s) => s.closePane)
  const setFocusedLeaf = useAppStore((s) => s.setFocusedLeaf)
  const setPaneAgent = useAppStore((s) => s.setPaneAgent)
  const setPaneCwd = useAppStore((s) => s.setPaneCwd)
  const setPaneShell = useAppStore((s) => s.setPaneShell)
  const globalShellId = useTerminalPrefStore((s) => s.shellId)

  const { id: leafId, terminalId } = leaf

  // Resolve each per-pane value against its default.
  const resolvedCwd = leaf.cwd ?? cwd
  const resolvedShellId = leaf.shellId ?? globalShellId
  const resolvedAgentId = leaf.agentId ?? DEFAULT_TEMPLATE_ID
  const resolvedCommand = agentCommand(resolvedAgentId)

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
      initialCommand: resolvedCommand
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
    command: resolvedCommand
  })
  useEffect(() => {
    const prev = appliedRef.current
    if (
      prev.cwd === resolvedCwd &&
      prev.shellId === resolvedShellId &&
      prev.command === resolvedCommand
    ) {
      return
    }
    appliedRef.current = { cwd: resolvedCwd, shellId: resolvedShellId, command: resolvedCommand }
    respawnTerminal(terminalId, {
      cwd: resolvedCwd,
      shellId: resolvedShellId,
      initialCommand: resolvedCommand
    })
  }, [terminalId, resolvedCwd, resolvedShellId, resolvedCommand])

  // Pull keyboard focus into xterm when this pane becomes the focused one.
  useEffect(() => {
    if (isFocused) focusTerminal(terminalId)
  }, [isFocused, terminalId])

  async function handleChoosePath(): Promise<void> {
    const dir = await pickDirectory()
    if (dir) setPaneCwd(leafId, dir)
  }

  return (
    <div
      onMouseDown={() => setFocusedLeaf(leafId)}
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-md border bg-background',
        isFocused ? 'border-ring' : 'border-pane-border'
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
      />

      <div className="relative flex-1 overflow-hidden">
        <div ref={containerRef} className="absolute inset-0" />

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
