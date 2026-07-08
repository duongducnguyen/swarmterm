import { templateById } from '@/lib/templates'

/**
 * The human label for a terminal pane: the agent-set title (via the
 * `terminal.set_title` MCP tool) when it has non-whitespace content, otherwise
 * the agent's own display name so the slot is never blank. Kept here as one
 * pure rule so every surface that names a pane — the pane header and the navbar
 * terminal list — resolves it identically and can never drift.
 */
export function resolvePaneTitle(agentId: string, agentTitle?: string): string {
  const trimmed = agentTitle?.trim()
  return trimmed ? trimmed : templateById(agentId).name
}
