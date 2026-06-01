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
  /** Brand logo URL for the agent, or `undefined` for the plain terminal. */
  icon?: string
}

export const TEMPLATES: WorkspaceTemplate[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    description: "Anthropic's coding agent.",
    command: 'claude --dangerously-skip-permissions',
    icon: claudeIcon
  },
  {
    id: 'codex',
    name: 'Codex',
    description: "OpenAI's Codex CLI.",
    command: 'codex',
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
