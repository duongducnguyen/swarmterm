import { describe, it, expect } from 'vitest'
import { resolvePaneTitle } from './pane-title'

describe('resolvePaneTitle', () => {
  it('uses the agent-set title when present', () => {
    expect(resolvePaneTitle('claude-code', 'Fixing the parser')).toBe('Fixing the parser')
  })

  it('trims surrounding whitespace on the agent-set title', () => {
    expect(resolvePaneTitle('claude-code', '  Building  ')).toBe('Building')
  })

  it('falls back to the agent name when the title is undefined', () => {
    // 'claude-code' template is named "Claude Code".
    expect(resolvePaneTitle('claude-code', undefined)).toBe('Claude Code')
  })

  it('falls back to the agent name when the title is blank/whitespace', () => {
    expect(resolvePaneTitle('terminal', '   ')).toBe('Terminal')
  })

  it('resolves an unknown agent id via the default template', () => {
    // templateById falls back to the default ('terminal') template.
    expect(resolvePaneTitle('no-such-agent', undefined)).toBe('Terminal')
  })
})
