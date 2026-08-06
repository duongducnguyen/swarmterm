import { describe, expect, it } from 'vitest'
import { buildResumeCommand, isValidSessionId } from '@/lib/resume-command'

const CLAUDE_ID = 'fe845bc6-6932-4459-8fb6-cdd0e7c6cc84'
const CODEX_ID = '018f3b2a-7c1d-4e0a-9b2f-1a2b3c4d5e6f'
const OPENCODE_ID = 'ses_8fk2ab34cd56EfGh78Ij90Kl12'

describe('isValidSessionId', () => {
  it('accepts a UUID for claude-code and codex', () => {
    expect(isValidSessionId('claude-code', CLAUDE_ID)).toBe(true)
    expect(isValidSessionId('codex', CODEX_ID)).toBe(true)
  })
  it('accepts ses_<base62> for opencode', () => {
    expect(isValidSessionId('opencode', OPENCODE_ID)).toBe(true)
  })
  it('rejects shell metacharacters, wrong shapes, and cross-agent ids', () => {
    expect(isValidSessionId('claude-code', 'fe845bc6; rm -rf /')).toBe(false)
    expect(isValidSessionId('claude-code', 'not-a-uuid')).toBe(false)
    expect(isValidSessionId('opencode', CLAUDE_ID)).toBe(false)
    expect(isValidSessionId('codex', '$(whoami)')).toBe(false)
    expect(isValidSessionId('claude-code', '')).toBe(false)
  })
})

describe('buildResumeCommand', () => {
  it('claude-code: base command + --resume', () => {
    expect(buildResumeCommand('claude-code', CLAUDE_ID)).toBe(
      `claude --dangerously-skip-permissions --resume ${CLAUDE_ID}`
    )
  })
  it('codex: resume subcommand (not a flag)', () => {
    expect(buildResumeCommand('codex', CODEX_ID)).toBe(`codex resume ${CODEX_ID}`)
  })
  it('opencode: --session flag', () => {
    expect(buildResumeCommand('opencode', OPENCODE_ID)).toBe(
      `opencode --session ${OPENCODE_ID}`
    )
  })
  it('returns undefined for invalid ids, plain terminal, unknown agents', () => {
    expect(buildResumeCommand('claude-code', 'bogus; id')).toBeUndefined()
    expect(buildResumeCommand('terminal', CLAUDE_ID)).toBeUndefined()
    expect(buildResumeCommand('unknown-agent', CLAUDE_ID)).toBeUndefined()
  })
})
