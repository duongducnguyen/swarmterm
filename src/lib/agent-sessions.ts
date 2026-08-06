/**
 * Pure logic for the composer's "Resume sessions" list. The backend returns
 * raw per-store rows; everything user-facing (ordering, caps, distrust of
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

/** Rows shown in the composer — enough to pick from, small enough to skim. */
export const MAX_SESSION_ROWS = 8

/** Stable identity for React keys and the ticked-set. */
export function sessionKey(e: AgentSessionEntry): string {
  return `${e.agentId}:${e.sessionId}`
}

/**
 * Filter (installed CLI, known template, valid id), sort newest-first, cap.
 * Invalid ids are dropped here — not at render time — so nothing downstream
 * ever handles an id that could not be resumed.
 */
export function mergeSessions(
  entries: AgentSessionEntry[],
  availability: AgentAvailabilityMap,
  cap: number = MAX_SESSION_ROWS
): AgentSessionEntry[] {
  return entries
    .filter((e) => {
      const template = templateById(e.agentId)
      if (template.id !== e.agentId) return false // unknown agent fell back to default
      if (!isTemplateAvailable(template, availability)) return false
      return isValidSessionId(e.agentId, e.sessionId)
    })
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
    .slice(0, cap)
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
