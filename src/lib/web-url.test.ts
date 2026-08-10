import { describe, expect, it } from 'vitest'
import { searchOrUrl } from './web-url'

describe('searchOrUrl', () => {
  it('passes through explicit http/https urls', () => {
    expect(searchOrUrl('http://localhost:5173')).toBe('http://localhost:5173/')
    expect(searchOrUrl('https://example.com/x')).toBe('https://example.com/x')
  })
  it('defaults localhost and loopback to http', () => {
    expect(searchOrUrl('localhost:3000')).toBe('http://localhost:3000/')
    expect(searchOrUrl('127.0.0.1:8080')).toBe('http://127.0.0.1:8080/')
  })
  it('defaults dotted bare hosts to https', () => {
    expect(searchOrUrl('example.com/docs')).toBe('https://example.com/docs')
  })
  it('turns free text into a Google search', () => {
    expect(searchOrUrl('hello world')).toBe('https://www.google.com/search?q=hello%20world')
  })
  it('never navigates non-http schemes — they become searches', () => {
    expect(searchOrUrl('javascript:alert(1)')).toBe(
      'https://www.google.com/search?q=javascript%3Aalert(1)'
    )
    expect(searchOrUrl('file:///etc/passwd')).toBe(
      'https://www.google.com/search?q=file%3A%2F%2F%2Fetc%2Fpasswd'
    )
  })
  it('returns null for empty input', () => {
    expect(searchOrUrl('')).toBeNull()
    expect(searchOrUrl('   ')).toBeNull()
  })
})
