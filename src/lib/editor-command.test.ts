import { describe, expect, it } from 'vitest'
import { buildEditorCommand, EDITOR_PRIORITY } from './editor-command'

describe('buildEditorCommand', () => {
  it('builds a VS Code goto', () => {
    expect(buildEditorCommand('code', '/a/b.ts', 42, 9)).toEqual({
      bin: 'code',
      args: ['-g', '/a/b.ts:42:9'],
    })
  })

  it('builds a VS Code goto with line only', () => {
    expect(buildEditorCommand('code', '/a/b.ts', 42)).toEqual({
      bin: 'code',
      args: ['-g', '/a/b.ts:42'],
    })
  })

  it('opens without -g when there is no line', () => {
    expect(buildEditorCommand('code', '/a/b.ts')).toEqual({ bin: 'code', args: ['/a/b.ts'] })
  })

  it('uses the same syntax for cursor', () => {
    expect(buildEditorCommand('cursor', '/a/b.ts', 7)).toEqual({
      bin: 'cursor',
      args: ['-g', '/a/b.ts:7'],
    })
  })

  it('builds a zed goto', () => {
    expect(buildEditorCommand('zed', '/a/b.ts', 42, 9)).toEqual({
      bin: 'zed',
      args: ['/a/b.ts:42:9'],
    })
  })

  it('builds a sublime goto', () => {
    expect(buildEditorCommand('subl', '/a/b.ts', 42)).toEqual({ bin: 'subl', args: ['/a/b.ts:42'] })
  })

  it('builds an IntelliJ goto with its flag syntax', () => {
    expect(buildEditorCommand('idea', '/a/b.ts', 42, 9)).toEqual({
      bin: 'idea',
      args: ['--line', '42', '--column', '9', '/a/b.ts'],
    })
  })

  it('builds an IntelliJ goto with line only', () => {
    expect(buildEditorCommand('idea', '/a/b.ts', 42)).toEqual({
      bin: 'idea',
      args: ['--line', '42', '/a/b.ts'],
    })
  })

  it('lists code first so the common case wins the PATH race', () => {
    expect(EDITOR_PRIORITY[0]).toBe('code')
  })
})
