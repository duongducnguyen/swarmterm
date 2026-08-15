import type { AgentEngineState } from '@/lib/agent-state/types'

/** Tick cadence while an agent pane is live; 100ms (PENDING_IDLE_RECHECK_MS)
 *  applies instead while a pending-idle hold is open. */
export const TICK_MS = 300

/** Agent TUIs draw menus/banners while booting that look like blockers;
 *  herdr skips screen detection entirely for 3s after spawn. */
export const SPAWN_GRACE_MS = 3000

export function inSpawnGrace(spawnedAt: number, now: number): boolean {
  return now - spawnedAt < SPAWN_GRACE_MS
}

/** Steady-state idle with no new pty output since the last scan: don't even
 *  materialize the buffer text. This is what makes 300ms polling free. */
export function shouldSkipScreenScan(args: {
  state: AgentEngineState
  contentSeq: number
  lastScannedSeq: number
  pendingIdle: boolean
}): boolean {
  return args.state === 'idle' && !args.pendingIdle && args.contentSeq === args.lastScannedSeq
}
