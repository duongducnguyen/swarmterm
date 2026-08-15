import { evaluateManifest } from '@/lib/agent-state/engine'
import { inSpawnGrace, shouldSkipScreenScan, TICK_MS } from '@/lib/agent-state/detect-schedule'
import { decideIdleHold, PENDING_IDLE_RECHECK_MS, type PendingIdle } from '@/lib/agent-state/pending-idle'
import { buildSnapshot, type BufferView } from '@/lib/agent-state/snapshot'
import type { AgentEngineState, Manifest } from '@/lib/agent-state/types'

/** OSC titles arrive raw from the program; herdr strips control chars and
 *  caps length (src/pane/osc.rs:448-527). No whitespace collapse — the
 *  spinner rules anchor on `<spinner><space>` prefixes. */
const OSC_MAX_CHARS = 256
const sanitizeOsc = (raw: string): string =>
  // eslint-disable-next-line no-control-regex
  raw.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').slice(0, OSC_MAX_CHARS)

export interface DetectorDeps {
  getView(): BufferView | null
  isPaneWatched(): boolean
  publish(state: AgentEngineState, opts: { paneWatched: boolean }): void
  now(): number
  setTimer(fn: () => void, ms: number): unknown
  clearTimer(handle: unknown): void
}

/**
 * Per-terminal detection loop. Timer-driven rather than per-output-chunk
 * (herdr's design): a busy agent redraws its spinner dozens of times per
 * second, and scraping on every chunk would burn CPU for identical
 * verdicts. Output only bumps a sequence counter; the 300ms tick skips the
 * screen read entirely while idle with an unchanged counter, so a quiet
 * pane costs nothing. All side effects (clock, timers, store publish, xterm
 * buffer) are injected so the loop is testable with a manual clock.
 */
export class AgentStateDetector {
  private readonly manifest: Manifest
  private readonly deps: DetectorDeps
  private oscTitle = ''
  private oscProgress = ''
  private contentSeq = 0
  private lastScannedSeq = -1
  private spawnedAt: number
  private state: AgentEngineState = 'unknown'
  private pending: PendingIdle | null = null
  private timer: unknown = null
  private exited = false
  private disposed = false

  constructor(manifest: Manifest, deps: DetectorDeps) {
    this.manifest = manifest
    this.deps = deps
    this.spawnedAt = deps.now()
  }

  start(): void {
    this.schedule(TICK_MS)
  }

  noteOutput(): void {
    this.contentSeq++
  }

  noteTitle(rawTitle: string): void {
    this.oscTitle = sanitizeOsc(rawTitle)
  }

  noteProgress(payload: string): void {
    this.oscProgress = sanitizeOsc(payload)
  }

  /** Pty exited or errored: stop detecting, drop to unknown so the UI falls
   *  back to the plain activity dot instead of freezing a stale state. Clear
   *  the pending timer too — tick()'s exited early-return already declines to
   *  reschedule, so this is just hygiene, but it stops a stale timer handle
   *  from lingering (and being mistaken for live) between exit and reset(). */
  noteExit(): void {
    this.exited = true
    this.pending = null
    this.setState('unknown')
    if (this.timer !== null) this.deps.clearTimer(this.timer)
    this.timer = null
  }

  /** Respawn (agent/cwd/shell switch or retry): the screen and OSC evidence
   *  describe a pty that no longer exists. Re-arm the spawn grace. tick()
   *  deliberately stops rescheduling once `exited`, so nothing else will ever
   *  fire again unless we schedule here — without this, a same-id respawn
   *  (retryTerminal, or refreshDetector reusing the existing detector because
   *  the manifest didn't change) leaves the loop dead forever. */
  reset(): void {
    this.oscTitle = ''
    this.oscProgress = ''
    this.pending = null
    this.exited = false
    this.spawnedAt = this.deps.now()
    this.lastScannedSeq = -1
    this.setState('unknown')
    this.schedule(TICK_MS)
  }

  dispose(): void {
    this.disposed = true
    if (this.timer !== null) this.deps.clearTimer(this.timer)
    this.timer = null
  }

  private setState(state: AgentEngineState): void {
    if (this.state === state) return
    this.state = state
    this.deps.publish(state, { paneWatched: this.deps.isPaneWatched() })
  }

  private schedule(ms: number): void {
    if (this.disposed) return
    if (this.timer !== null) this.deps.clearTimer(this.timer)
    this.timer = this.deps.setTimer(() => {
      this.timer = null
      this.tick()
    }, ms)
  }

  private tick(): void {
    if (this.disposed || this.exited) return
    const now = this.deps.now()
    if (inSpawnGrace(this.spawnedAt, now)) {
      this.schedule(TICK_MS)
      return
    }
    if (
      shouldSkipScreenScan({
        state: this.state,
        contentSeq: this.contentSeq,
        lastScannedSeq: this.lastScannedSeq,
        pendingIdle: this.pending !== null
      })
    ) {
      this.schedule(TICK_MS)
      return
    }
    const view = this.deps.getView()
    if (view === null) {
      this.schedule(TICK_MS)
      return
    }
    // Capture the seq BEFORE scanning: output racing in during the scan must
    // trigger a fresh scan next tick, not be silently absorbed.
    const seq = this.contentSeq
    let verdictState: AgentEngineState | null = null
    try {
      const verdict = evaluateManifest(this.manifest, {
        screen: buildSnapshot(view),
        oscTitle: this.oscTitle,
        oscProgress: this.oscProgress
      })
      this.lastScannedSeq = seq
      if (!verdict.skip) {
        const decision = decideIdleHold({
          prev: this.state,
          next: verdict,
          pending: this.pending,
          now,
          processExited: this.exited
        })
        this.pending = decision.pending
        if (decision.publish) verdictState = verdict.state
      }
    } catch (err) {
      // A broken rule must degrade to the old activity-dot behavior, never
      // take the terminal down with it. Log once per detector, and actually
      // publish unknown — paneDot() only falls back to the activity dot for
      // unknown/undetected, so without this the pane would freeze on
      // whatever state it last held instead of degrading.
      if (!this.warned) {
        this.warned = true
        console.warn('agent-state detection failed; pane falls back to activity dot', err)
      }
      this.setState('unknown')
    }
    if (verdictState !== null) this.setState(verdictState)
    this.schedule(this.pending !== null ? PENDING_IDLE_RECHECK_MS : TICK_MS)
  }

  private warned = false
}
