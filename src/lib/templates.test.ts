import { describe, it, expect } from 'vitest'
import { TEMPLATES, DEFAULT_TEMPLATE_ID, templateById, agentCommand } from './templates'

describe('TEMPLATES catalog', () => {
  it('lists the AI agents first and the plain terminal last', () => {
    const ids = TEMPLATES.map((t) => t.id)
    expect(ids[ids.length - 1]).toBe('terminal')
    expect(ids).toEqual(['claude-code', 'codex', 'terminal'])
  })

  it('gives every agent a non-empty launch command except the plain terminal', () => {
    for (const t of TEMPLATES) {
      if (t.id === 'terminal') expect(t.command).toBeNull()
      else expect(t.command).toBeTruthy()
    }
  })

  it('runs no command for the terminal agent', () => {
    expect(templateById('terminal').command).toBeNull()
  })

  it('runs the skip-permissions command for claude-code', () => {
    expect(templateById('claude-code').command).toBe('claude --dangerously-skip-permissions')
  })

  it('runs a plain codex command for codex', () => {
    expect(templateById('codex').command).toBe('codex')
  })
})

describe('agentCommand', () => {
  it('returns undefined for the default terminal agent', () => {
    expect(agentCommand('terminal')).toBeUndefined()
  })

  it('returns undefined when the agent id is undefined', () => {
    expect(agentCommand(undefined)).toBeUndefined()
  })

  it('returns the command string for a command agent', () => {
    expect(agentCommand('claude-code')).toBe('claude --dangerously-skip-permissions')
    expect(agentCommand('codex')).toBe('codex')
  })

  it('falls back to the default agent for an unknown id', () => {
    expect(agentCommand('nope')).toBeUndefined()
  })

  it('exposes terminal as the default agent id', () => {
    expect(DEFAULT_TEMPLATE_ID).toBe('terminal')
  })
})
