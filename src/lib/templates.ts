/**
 * Workspace templates offered by the setup wizard. A template decides the
 * command each terminal runs once on first spawn (`null` means a plain shell).
 */

export interface WorkspaceTemplate {
  id: string
  name: string
  description: string
  /** Command run when each terminal first spawns, or `null` for a plain shell. */
  command: string | null
}

export const TEMPLATES: WorkspaceTemplate[] = [
  {
    id: 'terminal',
    name: 'Terminal',
    description: 'A plain shell — runs no command.',
    command: null
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    description: 'Starts Claude Code with permission prompts skipped.',
    command: 'claude --dangerously-skip-permissions'
  }
]

export const DEFAULT_TEMPLATE_ID = 'terminal'

/** The template with `id`, or the default template when `id` is unknown. */
export function templateById(id: string): WorkspaceTemplate {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]
}
