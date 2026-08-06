import { describe, expect, it } from 'vitest'
import {
  MAX_SESSION_ROWS,
  mergeSessions,
  sessionKey,
  sessionTimeLabel,
  type AgentSessionEntry
} from '@/lib/agent-sessions'

const entry = (over: Partial<AgentSessionEntry>): AgentSessionEntry => ({
  agentId: 'claude-code',
  sessionId: 'fe845bc6-6932-4459-8fb6-cdd0e7c6cc84',
  title: 'Fix login bug',
  cwd: '/repo',
  updatedAtMs: 1000,
  ...over
})

describe('mergeSessions', () => {
  it('sorts by updatedAtMs descending', () => {
    const out = mergeSessions(
      [
        entry({ sessionId: '11111111-1111-1111-1111-111111111111', updatedAtMs: 1 }),
        entry({ sessionId: '33333333-3333-3333-3333-333333333333', updatedAtMs: 3 }),
        entry({ sessionId: '22222222-2222-2222-2222-222222222222', updatedAtMs: 2 })
      ],
      {}
    )
    expect(out.map((e) => e.updatedAtMs)).toEqual([3, 2, 1])
  })
  it('caps at MAX_SESSION_ROWS by default', () => {
    const many = Array.from({ length: 20 }, (_, i) => {
      const hex = i.toString().padStart(8, '0')
      return entry({ sessionId: `${hex}-0000-0000-0000-000000000000`, updatedAtMs: i })
    })
    expect(mergeSessions(many, {})).toHaveLength(MAX_SESSION_ROWS)
  })
  it('drops agents whose CLI is unavailable', () => {
    const out = mergeSessions(
      [entry({}), entry({ agentId: 'codex', sessionId: '018f3b2a-7c1d-4e0a-9b2f-1a2b3c4d5e6f' })],
      { codex: false }
    )
    expect(out.map((e) => e.agentId)).toEqual(['claude-code'])
  })
  it('drops entries with invalid session ids (untrusted store)', () => {
    const out = mergeSessions([entry({ sessionId: 'evil; rm -rf /' })], {})
    expect(out).toEqual([])
  })
  it('drops entries whose agentId is not a known template', () => {
    const out = mergeSessions([entry({ agentId: 'mystery-agent' })], {})
    expect(out).toEqual([])
  })
  it('dedupes by sessionKey (newest wins)', () => {
    const out = mergeSessions(
      [
        entry({ updatedAtMs: 1 }),
        entry({ updatedAtMs: 5 })
      ],
      {}
    )
    expect(out).toHaveLength(1)
    expect(out[0].updatedAtMs).toBe(5)
  })
})

describe('sessionTimeLabel', () => {
  const now = 10 * 24 * 60 * 60 * 1000
  it('renders just now / minutes / hours / days', () => {
    expect(sessionTimeLabel(now - 30_000, now)).toBe('just now')
    expect(sessionTimeLabel(now - 5 * 60_000, now)).toBe('5m ago')
    expect(sessionTimeLabel(now - 3 * 3_600_000, now)).toBe('3h ago')
    expect(sessionTimeLabel(now - 2 * 86_400_000, now)).toBe('2d ago')
  })
  it('never renders a future/garbage timestamp as negative', () => {
    expect(sessionTimeLabel(now + 60_000, now)).toBe('just now')
    expect(sessionTimeLabel(0, now)).toBe('10d ago')
  })
})

describe('sessionKey', () => {
  it('is agentId:sessionId', () => {
    expect(sessionKey(entry({}))).toBe(
      'claude-code:fe845bc6-6932-4459-8fb6-cdd0e7c6cc84'
    )
  })
})
