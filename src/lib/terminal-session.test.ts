import { describe, expect, it, vi } from 'vitest'
import type { PtyOut } from '@/tauri/terminal'
import { TerminalSession, type SessionDeps } from '@/lib/terminal-session'

/** A fresh set of mocked tauri deps; createTerminal resolves ok by default. */
function makeDeps(): SessionDeps & {
  /** Push a pty message into the latest createTerminal channel. */
  emit: (msg: PtyOut) => void
  /** Every createTerminal channel, in call order, for targeting old generations. */
  channels: ((msg: PtyOut) => void)[]
} {
  const channels: ((msg: PtyOut) => void)[] = []
  const createTerminal = vi.fn(
    (_id: string, _options, cb: (msg: PtyOut) => void) => {
      channels.push(cb)
      return Promise.resolve({ ok: true, pid: 1, shell: 'sh' })
    }
  )
  const killTerminal = vi.fn(() => Promise.resolve())
  return {
    createTerminal: createTerminal as SessionDeps['createTerminal'],
    killTerminal: killTerminal as SessionDeps['killTerminal'],
    channels,
    emit: (msg) => channels[channels.length - 1]?.(msg)
  }
}

const OPTS = { cols: 80, rows: 24, cwd: '/tmp' }

describe('TerminalSession', () => {
  it('spawns the pty only once across repeated start() calls (remounts)', () => {
    const deps = makeDeps()
    const session = new TerminalSession('t1', { write: vi.fn() }, deps)

    session.start(OPTS)
    session.start(OPTS) // detach + re-attach from a tree-collapse remount
    session.start(OPTS)

    expect(deps.createTerminal).toHaveBeenCalledTimes(1)
    expect(deps.killTerminal).not.toHaveBeenCalled()
  })

  it('routes pty data into the sink', () => {
    const deps = makeDeps()
    const write = vi.fn()
    const session = new TerminalSession('t1', { write }, deps)

    session.start(OPTS)
    deps.emit({ type: 'data', payload: 'hello' })

    expect(write).toHaveBeenCalledWith('hello')
  })

  it('kills the pty exactly once on dispose, even if called twice', () => {
    const deps = makeDeps()
    const session = new TerminalSession('t1', { write: vi.fn() }, deps)

    session.start(OPTS)
    session.dispose()
    session.dispose()

    expect(deps.killTerminal).toHaveBeenCalledTimes(1)
  })

  it('does not kill a session that never started', () => {
    const deps = makeDeps()
    const session = new TerminalSession('t1', { write: vi.fn() }, deps)

    session.dispose()

    expect(deps.killTerminal).not.toHaveBeenCalled()
  })

  it('does not start again after dispose', () => {
    const deps = makeDeps()
    const session = new TerminalSession('t1', { write: vi.fn() }, deps)

    session.start(OPTS)
    session.dispose()
    session.start(OPTS)

    expect(deps.createTerminal).toHaveBeenCalledTimes(1)
  })

  it('re-spawns the pty on retry after the process exits', () => {
    const deps = makeDeps()
    const session = new TerminalSession('t1', { write: vi.fn() }, deps)

    session.start(OPTS)
    deps.emit({ type: 'exit', payload: { exitCode: 0 } })
    expect(session.getStatus()).toEqual({ kind: 'exited', exitCode: 0 })

    session.retry(OPTS)

    expect(deps.createTerminal).toHaveBeenCalledTimes(2)
    expect(session.getStatus()).toEqual({ kind: 'connecting' })
  })

  it('ignores pty messages from a superseded generation after retry', () => {
    const deps = makeDeps()
    const write = vi.fn()
    const session = new TerminalSession('t1', { write }, deps)

    session.start(OPTS)
    const staleChannel = deps.channels[0]
    deps.emit({ type: 'exit', payload: { exitCode: 1 } })
    session.retry(OPTS)

    // A late message from the OLD pty channel must not reach the sink.
    staleChannel({ type: 'data', payload: 'ghost' })
    expect(write).not.toHaveBeenCalledWith('ghost')
  })

  it('kills a running pty and re-spawns only after its exit is observed', () => {
    const deps = makeDeps()
    const session = new TerminalSession('t1', { write: vi.fn() }, deps)

    session.start(OPTS)
    expect(deps.createTerminal).toHaveBeenCalledTimes(1)

    // Switch on a LIVE pty: must kill, but must NOT spawn yet (backend id still live).
    session.respawn({ ...OPTS, cwd: '/other' })
    expect(deps.killTerminal).toHaveBeenCalledTimes(1)
    expect(deps.createTerminal).toHaveBeenCalledTimes(1)
    expect(session.getStatus()).toEqual({ kind: 'connecting' })

    // The dying pty reports exit (backend has now freed the id) -> fresh spawn.
    deps.emit({ type: 'exit', payload: { exitCode: 0 } })
    expect(deps.createTerminal).toHaveBeenCalledTimes(2)
    expect(session.getStatus()).toEqual({ kind: 'connecting' })
  })

  it('respawns immediately, without a kill, when the pty already exited', () => {
    const deps = makeDeps()
    const session = new TerminalSession('t1', { write: vi.fn() }, deps)

    session.start(OPTS)
    deps.emit({ type: 'exit', payload: { exitCode: 0 } })
    expect(session.getStatus()).toEqual({ kind: 'exited', exitCode: 0 })

    session.respawn(OPTS)
    expect(deps.killTerminal).not.toHaveBeenCalled()
    expect(deps.createTerminal).toHaveBeenCalledTimes(2)
  })
})
