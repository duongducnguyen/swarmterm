/**
 * Pure logic for the composer's "Resume sessions" list. The backend returns
 * raw per-store rows; everything user-facing (ordering, filtering, distrust of
 * ids from foreign stores) is decided here so it can be unit-tested.
 */
import { isValidSessionId } from '@/lib/resume-command'
import {
  isTemplateAvailable,
  templateById,
  type AgentAvailabilityMap
} from '@/lib/templates'

/** One resumable session as reported by `list_agent_sessions`. */
export interface AgentSessionEntry {
  agentId: string
  sessionId: string
  title: string
  cwd: string
  updatedAtMs: number
}

/** Stable identity for React keys and the ticked-set. */
export function sessionKey(e: AgentSessionEntry): string {
  return `${e.agentId}:${e.sessionId}`
}

/** Composer filter — 'all' or one agent template id. */
export type SessionFilter = 'all' | string

/** Tab order is fixed and always fully rendered; zero-count tabs disable
 *  in the UI rather than disappear, so the set of agents is legible. */
export const SESSION_FILTER_TABS = ['all', 'claude-code', 'codex', 'opencode'] as const

/** Session rows shown before the expander opens. */
export const VISIBLE_SESSION_ROWS = 6

export function filterSessions(
  sessions: AgentSessionEntry[],
  filter: SessionFilter
): AgentSessionEntry[] {
  if (filter === 'all') return sessions
  return sessions.filter((e) => e.agentId === filter)
}

/** Title search for the all-sessions dialog — substring, case-insensitive.
 *  Composes with `filterSessions` (the rail narrows by agent, this narrows
 *  by text); a blank query is "no filter", matching an empty input. */
export function searchSessions(
  sessions: AgentSessionEntry[],
  query: string
): AgentSessionEntry[] {
  const q = query.trim().toLowerCase()
  if (q === '') return sessions
  return sessions.filter((e) => e.title.toLowerCase().includes(q))
}

/** Row counts per tab id (`all` = total). Agents absent from the list are
 *  present with 0 — the UI needs the key to render a disabled tab. */
export function sessionTabCounts(sessions: AgentSessionEntry[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const tab of SESSION_FILTER_TABS) counts[tab] = 0
  counts.all = sessions.length
  for (const e of sessions) counts[e.agentId] = (counts[e.agentId] ?? 0) + 1
  return counts
}

/**
 * Filter (installed CLI, known template, valid id), dedupe, sort newest-
 * first. Invalid ids are dropped here — not at render time — so nothing
 * downstream ever handles an id that could not be resumed. No cap: the
 * backend already bounds payload (≤20/agent); visibility is a view concern.
 */
export function mergeSessions(
  entries: AgentSessionEntry[],
  availability: AgentAvailabilityMap
): AgentSessionEntry[] {
  const seen = new Set<string>()
  return entries
    .filter((e) => {
      const template = templateById(e.agentId)
      if (template.id !== e.agentId) return false // unknown agent fell back to default
      if (!isTemplateAvailable(template, availability)) return false
      return isValidSessionId(e.agentId, e.sessionId)
    })
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
    .filter((e) => {
      // Duplicate ids can arrive from a store that writes one file per resume of the same conversation; keys must be unique for React and for the tick set.
      const key = sessionKey(e)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

/** Coarse relative time — clock skew and store garbage clamp to "just now". */
export function sessionTimeLabel(updatedAtMs: number, nowMs: number): string {
  const delta = Math.max(0, nowMs - updatedAtMs)
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
