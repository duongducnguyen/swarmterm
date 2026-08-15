import type { AgentEngineState, Verdict } from '@/lib/agent-state/types'

/**
 * Asymmetric debounce, ported from herdr (Apache-2.0,
 * src/pane/agent_detection.rs:5-77): entering blocked — or any other state —
 * publishes immediately; only `working → plain idle` is held, because agent
 * TUIs flicker through idle-looking frames between working redraws. Idle
 * with live proof (`visibleIdle` — the composer is actually on screen) or a
 * dead process skips the hold. Pure and timer-free: the detector passes
 * timestamps, so this is unit-testable without fake timers.
 */
export const PENDING_IDLE_RECHECK_MS = 100
export const PENDING_IDLE_CONFIRMATIONS = 3
export const PENDING_IDLE_CAP_MS = 700

export interface PendingIdle {
  startedAt: number
  confirmations: number
}

export interface HoldDecision {
  publish: boolean
  pending: PendingIdle | null
}

export function decideIdleHold(args: {
  prev: AgentEngineState
  next: Verdict
  pending: PendingIdle | null
  now: number
  processExited: boolean
}): HoldDecision {
  const { prev, next, pending, now, processExited } = args
  const holdApplies =
    prev === 'working' &&
    next.state === 'idle' &&
    !next.visibleIdle &&
    !next.visibleBlocker &&
    !processExited
  if (!holdApplies) return { publish: true, pending: null }

  if (pending === null) {
    return { publish: false, pending: { startedAt: now, confirmations: 0 } }
  }
  const confirmations = pending.confirmations + 1
  if (confirmations >= PENDING_IDLE_CONFIRMATIONS || now - pending.startedAt >= PENDING_IDLE_CAP_MS) {
    return { publish: true, pending: null }
  }
  return { publish: false, pending: { startedAt: pending.startedAt, confirmations } }
}
