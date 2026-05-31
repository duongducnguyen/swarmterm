/**
 * Workspace templates offered by the setup wizard. A template decides the
 * command each terminal runs once on first spawn (`null` means a plain shell).
 */

import claudeIcon from '@/assets/agents/claude-code.svg'
import codexIcon from '@/assets/agents/codex.svg'
import geminiIcon from '@/assets/agents/gemini.svg'
import copilotIcon from '@/assets/agents/copilot.svg'
import cursorIcon from '@/assets/agents/cursor.svg'
import opencodeIcon from '@/assets/agents/opencode.svg'
import aiderIcon from '@/assets/agents/aider.png'
import qwenIcon from '@/assets/agents/qwen.svg'
import ampIcon from '@/assets/agents/amp.svg'

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
    command: 'claude',
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
    id: 'gemini',
    name: 'Gemini CLI',
    description: "Google's open-source Gemini CLI.",
    command: 'gemini',
    icon: geminiIcon
  },
  {
    id: 'copilot',
    name: 'Copilot CLI',
    description: "GitHub's Copilot coding agent.",
    command: 'copilot',
    icon: copilotIcon
  },
  {
    id: 'cursor',
    name: 'Cursor CLI',
    description: "Cursor's terminal coding agent.",
    command: 'cursor-agent',
    icon: cursorIcon
  },
  {
    id: 'opencode',
    name: 'opencode',
    description: 'Open-source terminal AI agent.',
    command: 'opencode',
    icon: opencodeIcon
  },
  {
    id: 'aider',
    name: 'Aider',
    description: 'AI pair programming in your terminal.',
    command: 'aider',
    icon: aiderIcon
  },
  {
    id: 'qwen',
    name: 'Qwen Code',
    description: "Alibaba's Qwen Code CLI.",
    command: 'qwen',
    icon: qwenIcon
  },
  {
    id: 'amp',
    name: 'Amp',
    description: "Sourcegraph's agentic CLI.",
    command: 'amp',
    icon: ampIcon
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
