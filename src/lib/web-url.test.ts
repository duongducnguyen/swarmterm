import { describe, expect, it } from 'vitest'
import { normalizeUrl, isPreviewableUrl } from './web-url'

describe('normalizeUrl', () => {
  it('keeps http/https urls as-is', () => {
    expect(normalizeUrl('http://localhost:3000')).toBe('http://localhost:3000/')
    expect(normalizeUrl('https://example.com/x')).toBe('https://example.com/x')
  })
  it('adds http:// to a bare host:port', () => {
    expect(normalizeUrl('localhost:5173')).toBe('http://localhost:5173/')
  })
  it('trims surrounding whitespace', () => {
    expect(normalizeUrl('  localhost:8080  ')).toBe('http://localhost:8080/')
  })
  it('returns null for empty or junk', () => {
    expect(normalizeUrl('')).toBeNull()
    expect(normalizeUrl('   ')).toBeNull()
  })
})

describe('isPreviewableUrl', () => {
  it('allows http and https', () => {
    expect(isPreviewableUrl('http://a/')).toBe(true)
    expect(isPreviewableUrl('https://a/')).toBe(true)
  })
  it('rejects dangerous or unsupported schemes', () => {
    expect(isPreviewableUrl('file:///etc/passwd')).toBe(false)
    expect(isPreviewableUrl('javascript:alert(1)')).toBe(false)
    expect(isPreviewableUrl('not a url')).toBe(false)
  })
})
