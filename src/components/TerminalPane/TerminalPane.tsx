import { useEffect, useRef, useState } from 'react'
import { Columns2, Rows2, X, RotateCw, AlertTriangle, Terminal as TerminalIcon } from 'lucide-react'
import type { LeafNode } from '@/lib/layout-tree'
import { useAppStore } from '@/store/app-store'
import { useTerminalPrefStore } from '@/store/terminal-pref-store'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  attachTerminal,
  detachTerminal,
  focusTerminal,
  getTerminalStatus,
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
  const shellId = useTerminalPrefStore((s) => s.shellId)

  const { id: leafId, terminalId, initialCommand } = leaf
  const [status, setStatus] = useState<TerminalStatus>(() => getTerminalStatus(terminalId))

  // Attach the live terminal to this pane's container and mirror its status.
  // Detach (but never kill) on unmount: remounts re-attach the same terminal.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    attachTerminal(terminalId, container, { cwd, shellId, initialCommand })
    setStatus(getTerminalStatus(terminalId))
    const unsubscribe = subscribeTerminalStatus(terminalId, () =>
      setStatus(getTerminalStatus(terminalId))
    )

    return () => {
      unsubscribe()
      detachTerminal(terminalId)
    }
  }, [terminalId, cwd, shellId, initialCommand])

  // Pull keyboard focus into xterm when this pane becomes the focused one.
  useEffect(() => {
    if (isFocused) focusTerminal(terminalId)
  }, [isFocused, terminalId])

  return (
    <div
      onMouseDown={() => setFocusedLeaf(leafId)}
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-md border bg-background',
        isFocused ? 'border-ring' : 'border-border'
      )}
    >
      <div className="flex h-7 shrink-0 items-center justify-between border-b border-border bg-card px-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <TerminalIcon className="h-3.5 w-3.5" />
          <span>Terminal</span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            title="Split right"
            onClick={() => splitPane(leafId, 'horizontal')}
          >
            <Columns2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Split down"
            onClick={() => splitPane(leafId, 'vertical')}
          >
            <Rows2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Close pane"
            onClick={() => closePane(leafId)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

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
