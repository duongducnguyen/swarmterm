import { describe, expect, it, vi } from 'vitest'
import { classifyOscLink, openPathLocation, type LinkActionDeps } from './terminal-link-actions'

describe('classifyOscLink', () => {
  it('classifies an http URL as a url link', () => {
    expect(classifyOscLink('https://example.com/a')).toEqual({
      kind: 'url',
      target: 'https://example.com/a',
    })
  })

  it('classifies a file URL as a path link and strips the scheme', () => {
    expect(classifyOscLink('file:///Users/me/a.ts:42')).toEqual({
      kind: 'path',
      target: '/Users/me/a.ts:42',
    })
  })

  it('rejects any other scheme', () => {
    expect(classifyOscLink('mailto:a@b.c')).toBeNull()
    expect(classifyOscLink('javascript:alert(1)')).toBeNull()
    expect(classifyOscLink('not a url')).toBeNull()
  })
})

function deps(overrides: Partial<LinkActionDeps> = {}): LinkActionDeps {
  return {
    findAvailableEditor: vi.fn().mockResolvedValue('code'),
    openInEditor: vi.fn().mockResolvedValue(undefined),
    revealInFileManager: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('openPathLocation', () => {
  it('launches the found editor with a goto argv', async () => {
    const d = deps()
    await openPathLocation(d, '/a/b.ts', 42, 9)
    expect(d.openInEditor).toHaveBeenCalledWith('code', ['-g', '/a/b.ts:42:9'])
    expect(d.revealInFileManager).not.toHaveBeenCalled()
  })

  it('opens without a location when there is no line', async () => {
    const d = deps()
    await openPathLocation(d, '/a/b.ts')
    expect(d.openInEditor).toHaveBeenCalledWith('code', ['/a/b.ts'])
  })

  it('reveals in the file manager when no editor is on PATH', async () => {
    const d = deps({ findAvailableEditor: vi.fn().mockResolvedValue(null) })
    await openPathLocation(d, '/a/b.ts', 42)
    expect(d.openInEditor).not.toHaveBeenCalled()
    expect(d.revealInFileManager).toHaveBeenCalledWith('/a/b.ts')
  })

  it('falls back to reveal when the editor fails to launch', async () => {
    const d = deps({ openInEditor: vi.fn().mockRejectedValue(new Error('ENOENT')) })
    await openPathLocation(d, '/a/b.ts', 42)
    expect(d.revealInFileManager).toHaveBeenCalledWith('/a/b.ts')
  })

  it('ignores an editor id that is not on the allowlist', async () => {
    const d = deps({ findAvailableEditor: vi.fn().mockResolvedValue('bash') })
    await openPathLocation(d, '/a/b.ts', 42)
    expect(d.openInEditor).not.toHaveBeenCalled()
    expect(d.revealInFileManager).toHaveBeenCalledWith('/a/b.ts')
  })
})
