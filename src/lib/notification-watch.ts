import {
  diffAgentStates,
  notificationCopy,
  resolveFire,
  type NotificationKind,
  type PendingNotification
} from '@/lib/notification-flow'
import type { NotificationPrefs } from '@/lib/notification-pref'
import type { AgentPaneState } from '@/lib/agent-state/rollup'
import { templateById } from '@/lib/templates'

export const NOTIFY_DELAY_MS = 1000

export interface NotificationWatchDeps {
  subscribeAgentStates: (
    listener: (next: Record<string, AgentPaneState>, prev: Record<string, AgentPaneState>) => void
  ) => () => void
  getAgentStates: () => Record<string, AgentPaneState>
  isPaneWatched: (terminalId: string) => boolean
  isWindowFocused: () => boolean
  getAgentId: (terminalId: string) => string | undefined
  getPrefs: () => NotificationPrefs
  getPaneTitle: (terminalId: string) => string
  playChime: (kind: NotificationKind) => void
  sendSystemNotification: (opts: { title: string; body: string }) => void
  setTimer: (fn: () => void, ms: number) => unknown
  clearTimer: (handle: unknown) => void
}

interface Armed {
  pending: PendingNotification
  timer: unknown
}

/**
 * The impure half of agent notifications: diffs agent-state snapshots, holds ONE pending
 * notification per terminal (a newer qualifying transition replaces it — the
 * user cares about the latest fact, not the history), and delegates every
 * decision to the pure rules in notification-flow. Timers are injected so the
 * tests never sleep, mirroring DetectorDeps.
 */
export function startNotificationWatch(deps: NotificationWatchDeps): () => void {
  const armed = new Map<string, Armed>()

  const cancel = (terminalId: string): void => {
    const cur = armed.get(terminalId)
    if (cur === undefined) return
    deps.clearTimer(cur.timer)
    armed.delete(terminalId)
  }

  const fire = (pending: PendingNotification): void => {
    armed.delete(pending.terminalId)
    const verdict = resolveFire(pending, {
      current: deps.getAgentStates()[pending.terminalId],
      paneWatched: deps.isPaneWatched(pending.terminalId),
      windowFocused: deps.isWindowFocused(),
      prefs: deps.getPrefs()
    })
    if (verdict.sound) deps.playChime(pending.kind)
    if (verdict.system) {
      const name = templateById(pending.agentId).name
      deps.sendSystemNotification(notificationCopy(pending.kind, name, deps.getPaneTitle(pending.terminalId)))
    }
  }

  const arm = (terminalId: string, kind: NotificationKind): void => {
    const agentId = deps.getAgentId(terminalId)
    if (agentId === undefined) return
    cancel(terminalId)
    const pending: PendingNotification = { terminalId, kind, agentId }
    armed.set(terminalId, { pending, timer: deps.setTimer(() => fire(pending), NOTIFY_DELAY_MS) })
  }

  const unsubscribe = deps.subscribeAgentStates((next, prev) => {
    for (const t of diffAgentStates(prev, next)) {
      if (t.kind === 'removed') cancel(t.terminalId)
      else arm(t.terminalId, t.kind)
    }
  })

  return () => {
    for (const id of [...armed.keys()]) cancel(id)
    unsubscribe()
  }
}
