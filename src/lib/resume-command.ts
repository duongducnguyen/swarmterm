/**
 * Resume-command construction for agent panes. Session ids come from on-disk
 * stores owned by other programs — treat them as untrusted input. The id is
 * embedded in a line typed into a live shell, so instead of quoting we
 * allow-list the exact shapes each CLI emits and refuse everything else.
 */
import { agentCommand } from '@/lib/templates'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// OpenCode: "ses_" + 12 hex + 14 base62 today; ranged so a minor format bump
// doesn't silently kill the feature, while still shell-safe ([A-Za-z0-9] only).
const OPENCODE_RE = /^ses_[A-Za-z0-9]{10,40}$/

export function isValidSessionId(agentId: string, sessionId: string): boolean {
  switch (agentId) {
    case 'claude-code':
    case 'codex':
      return UUID_RE.test(sessionId)
    case 'opencode':
      return OPENCODE_RE.test(sessionId)
    default:
      return false
  }
}

/**
 * The one-line command that respawns `sessionId` under `agentId`, or
 * `undefined` when the id fails validation or the agent cannot resume
 * (plain terminal, unknown template). Built on `agentCommand` so template
 * flag changes (e.g. the claude permissions flag) carry over automatically.
 */
export function buildResumeCommand(
  agentId: string,
  sessionId: string
): string | undefined {
  if (!isValidSessionId(agentId, sessionId)) return undefined
  const base = agentCommand(agentId)
  if (base === undefined) return undefined
  switch (agentId) {
    case 'claude-code':
      // Permission mode is never restored on resume — the flag must ride again.
      return `${base} --resume ${sessionId}`
    case 'codex':
      return `${base} resume ${sessionId}`
    case 'opencode':
      return `${base} --session ${sessionId}`
    default:
      return undefined
  }
}
