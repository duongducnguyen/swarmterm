import { describe, expect, it } from 'vitest'
import { buildAgentSpawnCommand, quoteForShell, shellFlavor } from '@/lib/agent-spawn-command'

describe('shellFlavor', () => {
  it('maps posix-family shells', () => {
    expect(shellFlavor('git-bash', true)).toBe('posix')
    expect(shellFlavor('wsl', true)).toBe('posix')
  })
  it('maps powershell family', () => {
    expect(shellFlavor('powershell', true)).toBe('powershell')
    expect(shellFlavor('pwsh', false)).toBe('powershell')
  })
  it('maps cmd', () => {
    expect(shellFlavor('cmd', true)).toBe('cmd')
  })
  it('default shell follows the platform', () => {
    expect(shellFlavor('default', true)).toBe('powershell')
    expect(shellFlavor('default', false)).toBe('posix')
    expect(shellFlavor(undefined, false)).toBe('posix')
  })
})

describe('quoteForShell', () => {
  it('posix single-quotes and escapes embedded quotes', () => {
    expect(quoteForShell("don't stop", 'posix')).toBe("'don'\\''t stop'")
  })
  it('powershell doubles embedded single quotes', () => {
    expect(quoteForShell("don't stop", 'powershell')).toBe("'don''t stop'")
  })
  it('cmd double-quotes and downgrades embedded double quotes', () => {
    expect(quoteForShell('say "hi"', 'cmd')).toBe(`"say 'hi'"`)
  })
})

describe('buildAgentSpawnCommand', () => {
  it('appends the quoted prompt', () => {
    expect(buildAgentSpawnCommand('claude --dangerously-skip-permissions', 'Fix login', 'powershell'))
      .toBe("claude --dangerously-skip-permissions 'Fix login'")
  })
  it('collapses newlines so the pty write stays one line', () => {
    expect(buildAgentSpawnCommand('codex', 'a\nb\r\nc', 'posix')).toBe("codex 'a b c'")
  })
  it('returns the base command for an empty prompt', () => {
    expect(buildAgentSpawnCommand('codex', '', 'posix')).toBe('codex')
    expect(buildAgentSpawnCommand('codex', undefined, 'posix')).toBe('codex')
  })
})
