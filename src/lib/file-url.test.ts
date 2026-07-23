import { describe, expect, it } from 'vitest'
import { parseFileUrl } from './file-url'

describe('parseFileUrl', () => {
  it('parses a posix path with an empty host', () => {
    expect(parseFileUrl('file:///Users/me/app')).toBe('/Users/me/app')
  })

  it('parses a posix path with a hostname present', () => {
    expect(parseFileUrl('file://mymac.local/Users/me/app')).toBe('/Users/me/app')
  })

  it('percent-decodes', () => {
    expect(parseFileUrl('file:///Users/me/My%20Apps/a%2Bb')).toBe('/Users/me/My Apps/a+b')
  })

  it('strips the leading slash from a Windows drive path', () => {
    expect(parseFileUrl('file:///C:/Users/me/app')).toBe('C:/Users/me/app')
  })

  it('keeps the line suffix Claude Code appends', () => {
    expect(parseFileUrl('file:///a/b.ts:42')).toBe('/a/b.ts:42')
  })

  it('rejects a non-file scheme', () => {
    expect(parseFileUrl('https://example.com/a')).toBeNull()
  })

  it('rejects malformed input', () => {
    expect(parseFileUrl('not a url')).toBeNull()
    expect(parseFileUrl('file:///a/%ZZ')).toBeNull()
  })
})
