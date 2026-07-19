import { describe, expect, it } from 'vitest'
import { formatBootError } from '@/lib/boot-error'

describe('formatBootError', () => {
  it('uses the error name and message', () => {
    const { title, detail } = formatBootError(new TypeError('x is not a function'))
    expect(title).toMatch(/failed to start/i)
    expect(detail).toContain('TypeError: x is not a function')
  })

  it('includes the stack when there is one', () => {
    const err = new Error('boom')
    err.stack = 'Error: boom\n    at foo (index.js:1:1)'
    expect(formatBootError(err).detail).toContain('at foo (index.js:1:1)')
  })

  it('survives a thrown string', () => {
    expect(formatBootError('plain failure').detail).toContain('plain failure')
  })

  it('survives a thrown non-error object', () => {
    expect(formatBootError({ code: 42 }).detail).toBeTruthy()
  })

  it('survives undefined', () => {
    expect(formatBootError(undefined).detail).toBeTruthy()
  })

  it('calls out a missing build-time env var, the most likely cause', () => {
    const err = new Error('Missing required env vars: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
    expect(formatBootError(err).hint).toMatch(/\.env/)
  })

  it('has no hint for unrelated failures', () => {
    expect(formatBootError(new Error('boom')).hint).toBeUndefined()
  })
})
