import { useEffect, useRef, useState } from 'react'
import type { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { createTerminal } from '@/tauri/terminal'

export type TerminalStatus =
  | { kind: 'connecting' }
  | { kind: 'running' }
  | { kind: 'error'; message: string }
  | { kind: 'exited'; exitCode: number }

interface Params {
  getTerm: () => Terminal | null
  getFit: () => FitAddon | null
  getContainer: () => HTMLElement | null
  terminalId: string
  cwd: string
  initialCommand?: string
}

/** Fit the terminal to its container, skipping when it has no size. */
function safeFit(container: HTMLElement | null, fit: FitAddon | null): void {
  if (!container || !fit || container.clientWidth === 0 || container.clientHeight === 0) return
  try {
    fit.fit()
  } catch {
    /* container not laid out yet */
  }
}

/** Spawn (or re-spawn on retry) the pty and stream output into xterm. */
export function useTerminalSession(p: Params): {
  status: TerminalStatus
  retry: () => void
} {
  const [status, setStatus] = useState<TerminalStatus>({ kind: 'connecting' })
  const [retryNonce, setRetryNonce] = useState(0)
  const exitedRef = useRef(false)

  useEffect(() => {
    const term = p.getTerm()
    if (!term) return
    let cancelled = false
    exitedRef.current = false

    setStatus({ kind: 'connecting' })
    if (retryNonce > 0) term.reset()
    safeFit(p.getContainer(), p.getFit())

    void createTerminal(
      p.terminalId,
      { cols: term.cols, rows: term.rows, cwd: p.cwd, initialCommand: p.initialCommand },
      (msg) => {
        if (cancelled) return
        if (msg.type === 'data') {
          term.write(msg.payload)
        } else {
          exitedRef.current = true
          setStatus({ kind: 'exited', exitCode: msg.payload.exitCode })
        }
      }
    )
      .then((result) => {
        if (cancelled) return
        if (!result.ok) {
          setStatus({ kind: 'error', message: result.error ?? 'Unknown error' })
          return
        }
        if (!exitedRef.current) setStatus({ kind: 'running' })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
      })

    return () => {
      cancelled = true
    }
  }, [p.terminalId, retryNonce, p.cwd, p.initialCommand])

  return { status, retry: () => setRetryNonce((n) => n + 1) }
}
