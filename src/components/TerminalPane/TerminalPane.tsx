import { useEffect, useRef } from 'react'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Columns2, Rows2, X, RotateCw, AlertTriangle, Terminal as TerminalIcon } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'
import type { LeafNode } from '@/lib/layout-tree'
import { useAppStore } from '@/store/app-store'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { writeTerminal, resizeTerminal, killTerminal } from '@/tauri/terminal'
import { useTerminalSession } from '@/hooks/useTerminalSession'

/**
 * Windows Terminal's default "Campbell" scheme — the full 16-color ANSI palette
 * plus native background/foreground. Used verbatim (regardless of the app's
 * light/dark theme) so the terminal shows the same colors as a real shell.
 */
const CAMPBELL_THEME: ITheme = {
  background: '#0C0C0C',
  foreground: '#CCCCCC',
  cursor: '#FFFFFF',
  cursorAccent: '#0C0C0C',
  selectionBackground: 'rgba(255,255,255,0.3)',
  black: '#0C0C0C',
  brightBlack: '#767676',
  red: '#C50F1F',
  brightRed: '#E74856',
  green: '#13A10E',
  brightGreen: '#16C60C',
  yellow: '#C19C00',
  brightYellow: '#F9F1A5',
  blue: '#0037DA',
  brightBlue: '#3B78FF',
  magenta: '#881798',
  brightMagenta: '#B4009E',
  cyan: '#3A96DD',
  brightCyan: '#61D6D6',
  white: '#CCCCCC',
  brightWhite: '#F2F2F2'
}

interface TerminalPaneProps {
  leaf: LeafNode
  /** Working directory the terminal's shell starts in. */
  cwd: string
  isFocused: boolean
}

/** Fit the terminal to its container, skipping when the container has no size. */
function safeFit(container: HTMLElement | null, fit: FitAddon): boolean {
  if (!container || container.clientWidth === 0 || container.clientHeight === 0) return false
  try {
    fit.fit()
    return true
  } catch {
    return false
  }
}

/**
 * One terminal pane: an xterm.js viewport bound to a Rust pty over the Tauri
 * bridge. Owns the pty for its lifetime — created on mount, killed on unmount
 * (so closing the pane closes the shell).
 */
export function TerminalPane({ leaf, cwd, isFocused }: TerminalPaneProps): React.ReactElement {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  const splitPane = useAppStore((s) => s.splitPane)
  const closePane = useAppStore((s) => s.closePane)
  const setFocusedLeaf = useAppStore((s) => s.setFocusedLeaf)

  const { id: leafId, terminalId, initialCommand } = leaf

  // Create the xterm instance and wire input + resize. Runs once per pane.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"Cascadia Mono", "Consolas", "JetBrains Mono", monospace',
      fontSize: 13,
      scrollback: 5000,
      theme: CAMPBELL_THEME
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.open(container)
    termRef.current = term
    fitRef.current = fit
    safeFit(container, fit)

    const input = term.onData((data) => writeTerminal(terminalId, data))

    const observer = new ResizeObserver(() => {
      if (safeFit(container, fit)) {
        resizeTerminal(terminalId, term.cols, term.rows)
      }
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
      input.dispose()
      killTerminal(terminalId)
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [terminalId])

  // Spawn the pty + stream output. This MUST be registered after the xterm
  // creation effect above: React runs effects in registration order, so the
  // terminal instance exists (termRef is set) before the session reads it.
  const { status, retry } = useTerminalSession({
    getTerm: () => termRef.current,
    getFit: () => fitRef.current,
    getContainer: () => containerRef.current,
    terminalId,
    cwd,
    initialCommand
  })

  // Pull keyboard focus into xterm when this pane becomes the focused one.
  useEffect(() => {
    if (isFocused) termRef.current?.focus()
  }, [isFocused])

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
            onAction={retry}
          />
        )}
        {status.kind === 'exited' && (
          <StatusOverlay
            title="Process exited"
            detail={`Exit code ${status.exitCode}`}
            actionLabel="Restart"
            onAction={retry}
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
