import { describe, expect, it } from 'vitest'
import {
  EVERYONE,
  composerTargets,
  reconcileTarget,
  validateComposer,
  type ComposerMember
} from './war-room-composer'

const agent = (terminalId: string, name: string): ComposerMember => ({
  terminalId, name, agentId: 'claude-code', connected: true
})
const shell = (terminalId: string, name: string): ComposerMember => ({
  terminalId, name, agentId: null, connected: true
})
const pending = (terminalId: string, name: string): ComposerMember => ({
  terminalId, name, agentId: 'codex', connected: false
})

describe('composerTargets', () => {
  it('offers Everyone plus every member for probe', () => {
    const rows = composerTargets([agent('t1', 'Claude'), pending('t2', 'Codex')], 'probe')
    expect(rows.map((r) => r.id)).toEqual([EVERYONE, 't1', 't2'])
    expect(rows[0].disabled).toBeNull()
    expect(rows[1].disabled).toBeNull()
  })

  it('disables a pending member with a reason instead of hiding it', () => {
    const rows = composerTargets([pending('t2', 'Codex')], 'probe')
    expect(rows[1].disabled).toContain('war_room')
  })

  it('drops Everyone for execute and disables plain shells', () => {
    const rows = composerTargets([agent('t1', 'Claude'), shell('t2', 'bash')], 'execute')
    expect(rows.map((r) => r.id)).toEqual(['t1', 't2'])
    expect(rows[0].disabled).toBeNull()
    expect(rows[1].disabled).toContain('coding agent')
  })
})

describe('validateComposer', () => {
  const members = [agent('t1', 'Claude'), shell('t2', 'bash'), pending('t3', 'Codex')]

  it('rejects blank and whitespace-only text', () => {
    expect(validateComposer({ text: '   \n ', targetId: EVERYONE, mode: 'probe', members })).toEqual({
      ok: false, reason: 'Message is empty.'
    })
  })

  it('accepts a probe broadcast when at least one member is connected', () => {
    expect(validateComposer({ text: 'hi', targetId: EVERYONE, mode: 'probe', members }).ok).toBe(true)
  })

  it('rejects a probe broadcast into a room with nobody connected', () => {
    const r = validateComposer({ text: 'hi', targetId: EVERYONE, mode: 'probe', members: [pending('t3', 'Codex')] })
    expect(r).toEqual({ ok: false, reason: 'No connected agents in the War Room yet.' })
  })

  it('rejects an execute broadcast', () => {
    const r = validateComposer({ text: 'hi', targetId: EVERYONE, mode: 'execute', members })
    expect(r.ok).toBe(false)
  })

  it('rejects a target that is gone, pending, or a plain shell in execute mode', () => {
    expect(validateComposer({ text: 'hi', targetId: 'ghost', mode: 'probe', members }).ok).toBe(false)
    expect(validateComposer({ text: 'hi', targetId: 't3', mode: 'probe', members }).ok).toBe(false)
    expect(validateComposer({ text: 'hi', targetId: 't2', mode: 'execute', members }).ok).toBe(false)
    // A plain shell CAN receive a probe — only execute is blocked.
    expect(validateComposer({ text: 'hi', targetId: 't2', mode: 'probe', members }).ok).toBe(true)
  })
})

describe('reconcileTarget', () => {
  const members = [agent('t1', 'Claude')]

  it('keeps a still-valid selection', () => {
    expect(reconcileTarget('t1', members, 'probe')).toBe('t1')
  })

  it('falls back to Everyone when the selected member leaves a probe', () => {
    expect(reconcileTarget('gone', members, 'probe')).toBe(EVERYONE)
  })

  it('falls back to the first usable agent when switching to execute', () => {
    expect(reconcileTarget(EVERYONE, members, 'execute')).toBe('t1')
  })

  it('returns Everyone when execute has no usable target, which validation then rejects', () => {
    expect(reconcileTarget(EVERYONE, [shell('t2', 'bash')], 'execute')).toBe(EVERYONE)
    expect(validateComposer({ text: 'hi', targetId: EVERYONE, mode: 'execute', members: [shell('t2', 'bash')] }).ok)
      .toBe(false)
  })
})
