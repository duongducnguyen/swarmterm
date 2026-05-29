import type {
  CreateTerminalOptions,
  CreateTerminalResult,
  PtyOut
} from '@/tauri/terminal'

export type TerminalStatus =
  | { kind: 'connecting' }
  | { kind: 'running' }
  | { kind: 'error'; message: string }
  | { kind: 'exited'; exitCode: number }

/** Where decoded pty output is pumped (the xterm instance, in production). */
export interface SessionSink {
  write: (data: string) => void
}

/** Tauri bridge functions, injected so the session is testable without Tauri. */
export interface SessionDeps {
  createTerminal: (
    id: string,
    options: CreateTerminalOptions,
    onOutput: (msg: PtyOut) => void
  ) => Promise<CreateTerminalResult>
  killTerminal: (id: string) => Promise<void>
}

/**
 * The pty half of one terminal, decoupled from xterm and React. It spawns the
 * backend pty exactly once and lives until explicitly disposed — so a pane that
 * unmounts/remounts (e.g. when a sibling closes and the split tree collapses)
 * keeps the same running shell instead of killing and re-spawning it.
 */
export class TerminalSession {
  private status: TerminalStatus = { kind: 'connecting' }
  private readonly listeners = new Set<() => void>()
  private started = false
  private disposed = false
  /** Bumped on retry/dispose to drop callbacks from a superseded pty channel. */
  private generation = 0
  /** Options to spawn with once the current (being-killed) pty reports exit. */
  private pendingRespawn: CreateTerminalOptions | null = null

  constructor(
    readonly id: string,
    private readonly sink: SessionSink,
    private readonly deps: SessionDeps
  ) {}

  getStatus(): TerminalStatus {
    return this.status
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(status: TerminalStatus): void {
    this.status = status
    for (const listener of this.listeners) listener()
  }

  /** Spawn the pty. No-op once started, so repeated mounts never re-spawn. */
  start(options: CreateTerminalOptions): void {
    if (this.started || this.disposed) return
    this.started = true
    this.spawn(options)
  }

  /** Re-spawn after an exit or error. Caller should reset the sink first. */
  retry(options: CreateTerminalOptions): void {
    if (this.disposed) return
    this.generation += 1
    this.started = true
    this.spawn(options)
  }

  /**
   * Restart a running pty with new options (agent / cwd / shell switch). The
   * backend frees a terminal id only once its process exits, and rejects a
   * duplicate live id — so kill the current pty and defer the fresh spawn until
   * its exit is observed (the backend frees the id just before sending it). If
   * the pty isn't currently live, spawn immediately, like retry.
   */
  respawn(options: CreateTerminalOptions): void {
    if (this.disposed) return
    const live =
      this.started && this.status.kind !== 'exited' && this.status.kind !== 'error'
    if (!live) {
      this.retry(options)
      return
    }
    this.pendingRespawn = options
    this.emit({ kind: 'connecting' })
    void this.deps.killTerminal(this.id)
  }

  /** Kill the pty and tear down. Idempotent. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.generation += 1
    if (this.started) void this.deps.killTerminal(this.id)
  }

  private spawn(options: CreateTerminalOptions): void {
    const generation = this.generation
    const fresh = (): boolean => generation === this.generation && !this.disposed
    let exited = false

    this.emit({ kind: 'connecting' })

    this.deps
      .createTerminal(this.id, options, (msg) => {
        if (!fresh()) return
        if (msg.type === 'data') {
          this.sink.write(msg.payload)
        } else {
          exited = true
          if (this.pendingRespawn) {
            const next = this.pendingRespawn
            this.pendingRespawn = null
            this.retry(next)
          } else {
            this.emit({ kind: 'exited', exitCode: msg.payload.exitCode })
          }
        }
      })
      .then((result) => {
        if (!fresh()) return
        if (!result.ok) this.emit({ kind: 'error', message: result.error ?? 'Unknown error' })
        else if (!exited) this.emit({ kind: 'running' })
      })
      .catch((err: unknown) => {
        if (!fresh()) return
        this.emit({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
      })
  }
}
