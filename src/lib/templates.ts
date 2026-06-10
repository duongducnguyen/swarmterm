/**
 * Workspace templates offered by the setup wizard. A template decides the
 * command each terminal runs once on first spawn (`null` means a plain shell).
 */

import claudeIcon from '@/assets/agents/claude-code.svg'
import codexIcon from '@/assets/agents/codex.svg'

export interface WorkspaceTemplate {
  id: string
  name: string
  description: string
  /** Command run when each terminal first spawns, or `null` for a plain shell. */
  command: string | null
  /** Executable probed by the backend to decide availability; `undefined` ⇒ always available. */
  executable?: string
  /** Brand logo URL for the agent, or `undefined` for the plain terminal. */
  icon?: string
}

export const TEMPLATES: WorkspaceTemplate[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    description: "Anthropic's coding agent.",
    command: 'claude --dangerously-skip-permissions',
    executable: 'claude',
    icon: claudeIcon
  },
  {
    id: 'codex',
    name: 'Codex',
    description: "OpenAI's Codex CLI.",
    command: 'codex',
    executable: 'codex',
    icon: codexIcon
  },
  {
    id: 'terminal',
    name: 'Terminal',
    description: 'A plain shell — runs no command.',
    command: null
  }
]

export const DEFAULT_TEMPLATE_ID = 'terminal'

/** The template with `id`, or the default template when `id` is unknown. */
export function templateById(id: string): WorkspaceTemplate {
  return (
    TEMPLATES.find((t) => t.id === id) ??
    TEMPLATES.find((t) => t.id === DEFAULT_TEMPLATE_ID) ??
    TEMPLATES[0]
  )
}

/** The startup command for an agent id, or `undefined` for a plain shell. */
export function agentCommand(agentId: string | undefined): string | undefined {
  return templateById(agentId ?? DEFAULT_TEMPLATE_ID).command ?? undefined
}

/**
 * Template id → installed?, from the backend probe (`list_available_agents`).
 * A missing id reads as installed — optimistic, so a pending or failed probe
 * never locks out a working CLI.
 */
export type AgentAvailabilityMap = Record<string, boolean>

/** Whether a template's CLI is installed. Templates with no executable (plain
 *  Terminal) are always available. */
export function isTemplateAvailable(
  template: WorkspaceTemplate,
  availability: AgentAvailabilityMap
): boolean {
  if (!template.executable) return true
  return availability[template.id] !== false
}
