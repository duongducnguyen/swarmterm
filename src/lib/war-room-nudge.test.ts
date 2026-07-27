import { describe, expect, it } from 'vitest'
import { buildIntroText, buildNudgeText, flushQueue, type PendingDelivery } from './war-room-nudge'

const probe = (fromName: string): PendingDelivery => ({ fromName, mode: 'probe' })
const exec = (fromName: string, content: string): PendingDelivery => ({ fromName, mode: 'execute', content })

describe('buildNudgeText', () => {
  it('names the single sender and both tools', () => {
    const t = buildNudgeText(['Codex'])
    expect(t).toContain('Codex')
    expect(t).toContain('war_room.read_inbox')
    expect(t).toContain('war_room.send')
  })

  it('counts multiple messages and dedupes sender names', () => {
    const t = buildNudgeText(['Codex', 'Claude', 'Codex'])
    expect(t).toContain('3')
    expect(t.indexOf('Codex')).toBe(t.lastIndexOf('Codex'))
  })
})

describe('buildIntroText', () => {
  it('lists peers and all three tools', () => {
    const t = buildIntroText(['Codex', 'Claude'])
    expect(t).toContain('Codex')
    expect(t).toContain('war_room.list_peers')
    expect(t).toContain('war_room.send')
    expect(t).toContain('war_room.read_inbox')
  })

  it('still reads sensibly with no peers yet', () => {
    expect(buildIntroText([])).toContain('war_room.list_peers')
  })
})

describe('flushQueue', () => {
  it('is empty for an empty queue', () => {
    expect(flushQueue([])).toEqual([])
  })

  it('collapses many probes into one nudge', () => {
    const out = flushQueue([probe('A'), probe('B'), probe('A')])
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('3')
  })

  it('keeps execute payloads verbatim, in order, before the merged nudge', () => {
    const out = flushQueue([exec('A', 'first task'), probe('B'), exec('A', 'second task')])
    expect(out).toEqual(['first task', 'second task', buildNudgeText(['B'])])
  })
})
