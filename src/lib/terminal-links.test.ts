import { describe, expect, it } from 'vitest'
import { shouldFollowLink } from './terminal-links'

describe('shouldFollowLink', () => {
  it('follows on Cmd+click on macOS', () => {
    expect(shouldFollowLink({ ctrlKey: false, metaKey: true }, true)).toBe(true)
  })

  it('does NOT follow on Ctrl+click on macOS', () => {
    expect(shouldFollowLink({ ctrlKey: true, metaKey: false }, true)).toBe(false)
  })

  it('follows on Ctrl+click on Windows/Linux', () => {
    expect(shouldFollowLink({ ctrlKey: true, metaKey: false }, false)).toBe(true)
  })

  it('does NOT follow on Cmd+click on Windows/Linux', () => {
    expect(shouldFollowLink({ ctrlKey: false, metaKey: true }, false)).toBe(false)
  })

  it('does NOT follow a plain click on either platform', () => {
    expect(shouldFollowLink({ ctrlKey: false, metaKey: false }, true)).toBe(false)
    expect(shouldFollowLink({ ctrlKey: false, metaKey: false }, false)).toBe(false)
  })
})
