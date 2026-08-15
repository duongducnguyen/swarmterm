import { describe, expect, it } from 'vitest'
import { evaluateManifest, gateMatches } from '@/lib/agent-state/engine'
import type { Manifest, Rule } from '@/lib/agent-state/types'

const input = (screen: string, oscTitle = '', oscProgress = ''): Parameters<typeof evaluateManifest>[1] => ({
  screen,
  oscTitle,
  oscProgress
})

const rule = (over: Partial<Rule> & Pick<Rule, 'id' | 'state'>): Rule => ({
  priority: 0,
  region: 'whole_recent',
  ...over
})

const manifest = (...rules: Rule[]): Manifest => ({ id: 'test', herdrVersion: 't', rules })

describe('gateMatches', () => {
  it('requires ALL contains needles, case-insensitively', () => {
    expect(gateMatches({ contains: ['Foo', 'bar'] }, 'FOO and BAR')).toBe(true)
    expect(gateMatches({ contains: ['foo', 'missing'] }, 'foo only')).toBe(false)
  })
  it('regex is case-sensitive unless the pattern has the i flag', () => {
    expect(gateMatches({ regex: [/Foo/] }, 'foo')).toBe(false)
    expect(gateMatches({ regex: [/Foo/i] }, 'foo')).toBe(true)
  })
  it('lineRegex needs each pattern to match at least one LINE', () => {
    expect(gateMatches({ lineRegex: [/^b$/] }, 'a\nb')).toBe(true)
    expect(gateMatches({ lineRegex: [/^a\nb$/] }, 'a\nb')).toBe(false)
  })
  it('any needs one branch; not fails when any branch matches; all needs every branch', () => {
    expect(gateMatches({ any: [{ contains: ['x'] }, { contains: ['y'] }] }, 'has y')).toBe(true)
    expect(gateMatches({ not: [{ contains: ['y'] }] }, 'has y')).toBe(false)
    expect(gateMatches({ all: [{ contains: ['a'] }, { contains: ['b'] }] }, 'a b')).toBe(true)
    expect(gateMatches({ all: [{ contains: ['a'] }, { contains: ['b'] }] }, 'a only')).toBe(false)
  })
  it('nests gates (any containing contains + nested any)', () => {
    const gate = { contains: ['do you want to'], any: [{ contains: ['yes'] }, { contains: ['❯'] }] }
    expect(gateMatches(gate, 'Do you want to proceed? ❯')).toBe(true)
    expect(gateMatches(gate, 'Do you want to proceed?')).toBe(false)
  })
})

describe('evaluateManifest', () => {
  it('highest priority wins', () => {
    const m = manifest(
      rule({ id: 'low', state: 'idle', priority: 100, contains: ['x'] }),
      rule({ id: 'high', state: 'blocked', priority: 900, contains: ['x'] })
    )
    expect(evaluateManifest(m, input('x')).state).toBe('blocked')
  })
  it('ties go to the FIRST rule in manifest order', () => {
    const m = manifest(
      rule({ id: 'first', state: 'working', priority: 500, contains: ['x'] }),
      rule({ id: 'second', state: 'blocked', priority: 500, contains: ['x'] })
    )
    expect(evaluateManifest(m, input('x')).ruleId).toBe('first')
  })
  it('falls back to idle when nothing matches — never guesses blocked', () => {
    const v = evaluateManifest(manifest(rule({ id: 'r', state: 'blocked', contains: ['nope'] })), input('screen'))
    expect(v.state).toBe('idle')
    expect(v.skip).toBe(false)
  })
  it('skipStateUpdate on the winner discards the tick', () => {
    const m = manifest(rule({ id: 'freeze', state: 'unknown', priority: 1000, skipStateUpdate: true, contains: ['transcript'] }))
    expect(evaluateManifest(m, input('showing transcript')).skip).toBe(true)
  })
  it('visible flags are reported only when the winning state agrees', () => {
    const m = manifest(rule({ id: 'r', state: 'blocked', visibleBlocker: true, visibleIdle: true, contains: ['x'] }))
    const v = evaluateManifest(m, input('x'))
    expect(v.visibleBlocker).toBe(true)
    expect(v.visibleIdle).toBe(false)
  })
  it('each rule evaluates against its OWN region', () => {
    const m = manifest(
      rule({ id: 'title', state: 'working', priority: 1100, region: 'osc_title', regex: [/^\u{2733} /u] })
    )
    expect(evaluateManifest(m, input('screen text', '✳ Ready')).state).toBe('working')
  })
})
