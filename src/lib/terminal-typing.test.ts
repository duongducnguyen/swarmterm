import { describe, expect, it } from 'vitest'
import { classifyInput } from './terminal-typing'

describe('classifyInput', () => {
  it('treats printable characters and backspace as editing', () => {
    expect(classifyInput('a')).toBe('edit')
    expect(classifyInput('hello')).toBe('edit')
    expect(classifyInput('\x7f')).toBe('edit') // backspace
    expect(classifyInput('  ')).toBe('edit')
  })

  it('treats a multi-character IME commit as editing', () => {
    expect(classifyInput('xin chào')).toBe('edit')
    expect(classifyInput('日本語')).toBe('edit')
  })

  it('treats Enter, Ctrl+C, Ctrl+U and a bare Esc as ending the line', () => {
    expect(classifyInput('\r')).toBe('submit')
    expect(classifyInput('\n')).toBe('submit')
    expect(classifyInput('\x03')).toBe('submit')
    expect(classifyInput('\x15')).toBe('submit')
    expect(classifyInput('\x1b')).toBe('submit')
  })

  it('treats any payload containing a newline as ending the line', () => {
    expect(classifyInput('do the thing\r')).toBe('submit')
    expect(classifyInput('line one\nline two')).toBe('submit')
  })

  it('treats escape SEQUENCES as navigation, not as Esc', () => {
    // This is the whole point of the module: \x1b is Esc, \x1b[ starts a
    // sequence. Getting it wrong makes every arrow key clear the dirty flag.
    expect(classifyInput('\x1b[A')).toBe('nav') // up
    expect(classifyInput('\x1b[D')).toBe('nav') // left
    expect(classifyInput('\x1b[H')).toBe('nav') // home
    expect(classifyInput('\x1bOP')).toBe('nav') // F1 in application mode
  })

  it('treats an empty payload as navigation (nothing was typed)', () => {
    expect(classifyInput('')).toBe('nav')
  })
})
