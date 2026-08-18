import type { AgentPaneState } from '@/lib/agent-state/rollup'
import { agentNotificationsEnabled, type NotificationPrefs } from '@/lib/notification-pref'

export type NotificationKind = 'attention' | 'completion'

export interface AgentStateTransition {
  terminalId: string
  kind: NotificationKind | 'removed'
}

/**
 * Classify what changed between two agent-state snapshots. Relies on the
 * store's dedupe (identical state never republished as a new object): a
 * reference-equal entry cannot carry a transition. `unknown → idle` is not a
 * completion (spawn settling), and the markSeen flip is not a transition.
 */
export function diffAgentStates(
  prev: Record<string, AgentPaneState>,
  next: Record<string, AgentPaneState>
): AgentStateTransition[] {
  const out: AgentStateTransition[] = []
  for (const [terminalId, cur] of Object.entries(next)) {
    const old = prev[terminalId]
    if (old === cur) continue
    if (cur.state === 'blocked' && old?.state !== 'blocked') {
      out.push({ terminalId, kind: 'attention' })
    } else if (
      cur.state === 'idle' &&
      !cur.seen &&
      (old?.state === 'working' || old?.state === 'blocked')
    ) {
      out.push({ terminalId, kind: 'completion' })
    }
  }
  for (const terminalId of Object.keys(prev)) {
    if (!(terminalId in next)) out.push({ terminalId, kind: 'removed' })
  }
  return out
}

export interface PendingNotification {
  terminalId: string
  kind: NotificationKind
  agentId: string
}

export interface FireContext {
  current: AgentPaneState | undefined
  paneWatched: boolean
  windowFocused: boolean
  prefs: NotificationPrefs
}

export interface FireVerdict {
  sound: boolean
  system: boolean
}

const DROP: FireVerdict = { sound: false, system: false }

/**
 * Fire-time re-validation, ~1 s after the transition: a blocked flash that
 * resolved itself, a pane the user has since looked at, or a dead terminal
 * must not notify. The banner additionally requires the window to be
 * unfocused AT THIS INSTANT — inside the app the chime alone is the signal.
 */
export function resolveFire(pending: PendingNotification, ctx: FireContext): FireVerdict {
  const { current } = ctx
  if (current === undefined) return DROP
  if (pending.kind === 'attention' && current.state !== 'blocked') return DROP
  if (pending.kind === 'completion' && !(current.state === 'idle' && !current.seen)) return DROP
  if (ctx.paneWatched) return DROP
  if (!agentNotificationsEnabled(ctx.prefs, pending.agentId)) return DROP
  return { sound: ctx.prefs.sound, system: ctx.prefs.system && !ctx.windowFocused }
}

export function notificationCopy(
  kind: NotificationKind,
  agentName: string,
  paneTitle: string
): { title: string; body: string } {
  return {
    title: kind === 'attention' ? `${agentName} needs your input` : `${agentName} finished`,
    body: paneTitle
  }
}
