import { describe, expect, it } from 'vitest'
import {
  afterLastHorizontalRule,
  afterLastPromptMarker,
  bottomNonEmptyLines,
  isHorizontalRule,
  promptBoxBody,
  resolveRegion,
  topNonEmptyLines
} from '@/lib/agent-state/regions'

describe('bottomNonEmptyLines', () => {
  it('returns the suffix FROM the Nth-from-last non-empty line, blanks included', () => {
    expect(bottomNonEmptyLines('a\nb\n\nc', 2)).toBe('b\n\nc')
  })
  it('returns empty string when there is no non-empty line', () => {
    expect(bottomNonEmptyLines('\n\n', 3)).toBe('')
  })
  it('returns the whole content when fewer than N non-empty lines exist', () => {
    expect(bottomNonEmptyLines('a\nb', 5)).toBe('a\nb')
  })
})

describe('topNonEmptyLines', () => {
  it('returns the prefix ENDING at the Nth non-empty line from the top', () => {
    expect(topNonEmptyLines('a\n\nb\nc', 2)).toBe('a\n\nb')
  })
  it('returns whole content when fewer than N non-empty lines exist', () => {
    expect(topNonEmptyLines('a', 3)).toBe('a')
  })
})

describe('isHorizontalRule', () => {
  it('accepts a bare dash run of any length', () => {
    expect(isHorizontalRule('─')).toBe(true)
    expect(isHorizontalRule('  ──  ')).toBe(true)
  })
  it('accepts a labelled rule only when the run is ≥3', () => {
    expect(isHorizontalRule('─── Label')).toBe(true)
    expect(isHorizontalRule('── Label')).toBe(false)
  })
  it('rejects non-rule lines', () => {
    expect(isHorizontalRule('hello')).toBe(false)
    expect(isHorizontalRule('')).toBe(false)
  })
})

describe('afterLastHorizontalRule', () => {
  it('returns everything after the last rule line', () => {
    expect(afterLastHorizontalRule('a\n───\nb\nc')).toBe('b\nc')
  })
  it('returns whole content when no rule exists', () => {
    expect(afterLastHorizontalRule('a\nb')).toBe('a\nb')
  })
})

describe('promptBoxBody', () => {
  it('returns lines strictly between the 2nd-from-bottom rule and the rule below it', () => {
    expect(promptBoxBody('history\n───\n❯ type here\n───')).toBe('❯ type here')
  })
  it('returns empty string with fewer than two rules', () => {
    expect(promptBoxBody('a\n───\nb')).toBe('')
  })
})

describe('afterLastPromptMarker (Codex › prompt)', () => {
  it('returns the suffix after the last › marker line', () => {
    expect(afterLastPromptMarker('out\n› ask\nanswer')).toBe('answer')
    expect(afterLastPromptMarker('out\n›\nanswer')).toBe('answer')
  })
  it('returns whole content when no marker exists', () => {
    expect(afterLastPromptMarker('a\nb')).toBe('a\nb')
  })
  it('does not treat mid-line › as a marker', () => {
    expect(afterLastPromptMarker('say › hi\nb')).toBe('say › hi\nb')
  })
})

describe('resolveRegion', () => {
  const input = { screen: 'l1\nl2\nl3', oscTitle: '✳ Ready', oscProgress: '4;0' }
  it('maps osc regions to the OSC evidence, not the screen', () => {
    expect(resolveRegion('osc_title', input)).toBe('✳ Ready')
    expect(resolveRegion('osc_progress', input)).toBe('4;0')
  })
  it('maps whole_recent to the untouched screen', () => {
    expect(resolveRegion('whole_recent', input)).toBe('l1\nl2\nl3')
  })
  it('maps parameterised regions', () => {
    expect(resolveRegion({ bottomNonEmptyLines: 2 }, input)).toBe('l2\nl3')
    expect(resolveRegion({ topNonEmptyLines: 1 }, input)).toBe('l1')
  })
})
