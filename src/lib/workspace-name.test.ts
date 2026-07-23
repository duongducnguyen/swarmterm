import { describe, it, expect } from 'vitest'
import { workspaceNameFor } from './workspace-name'

describe('workspaceNameFor', () => {
  it('names the workspace after the folder', () => {
    expect(workspaceNameFor('C:/dev/myapp', [], 1)).toBe('myapp')
  })

  it('handles unix paths and trailing separators', () => {
    expect(workspaceNameFor('/Users/me/projects/swarmterm/', [], 1)).toBe('swarmterm')
  })

  it('suffixes (1) when the folder name is already taken', () => {
    expect(workspaceNameFor('C:/dev/myapp', ['myapp'], 1)).toBe('myapp (1)')
  })

  it('counts up past every taken suffix', () => {
    expect(workspaceNameFor('C:/dev/myapp', ['myapp', 'myapp (1)', 'myapp (2)'], 1)).toBe(
      'myapp (3)'
    )
  })

  it('fills the first free gap rather than the highest suffix', () => {
    expect(workspaceNameFor('C:/dev/myapp', ['myapp', 'myapp (2)'], 1)).toBe('myapp (1)')
  })

  it('ignores unrelated names', () => {
    expect(workspaceNameFor('C:/dev/myapp', ['other', 'myapp-web'], 1)).toBe('myapp')
  })

  it('falls back to "Workspace N" when no folder is given', () => {
    expect(workspaceNameFor('', [], 3)).toBe('Workspace 3')
    expect(workspaceNameFor('   ', [], 2)).toBe('Workspace 2')
  })

  it('de-dupes the fallback name too', () => {
    expect(workspaceNameFor('', ['Workspace 3'], 3)).toBe('Workspace 3 (1)')
  })

  it('names a drive root after the drive', () => {
    expect(workspaceNameFor('C:/', [], 1)).toBe('C:')
  })
})
