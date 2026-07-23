import { describe, expect, it } from 'vitest'
import { isDragNotClick, shouldFollowLink } from './terminal-links'

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

describe('shouldFollowLink — url kind', () => {
  it('follows a plain click on a URL on both platforms', () => {
    expect(shouldFollowLink({ ctrlKey: false, metaKey: false }, true, 'url')).toBe(true)
    expect(shouldFollowLink({ ctrlKey: false, metaKey: false }, false, 'url')).toBe(true)
  })

  it('still follows a URL when a modifier happens to be held', () => {
    expect(shouldFollowLink({ ctrlKey: false, metaKey: true }, true, 'url')).toBe(true)
  })

  it('still requires the modifier for a path', () => {
    expect(shouldFollowLink({ ctrlKey: false, metaKey: false }, true, 'path')).toBe(false)
    expect(shouldFollowLink({ ctrlKey: false, metaKey: true }, true, 'path')).toBe(true)
  })
})

describe('isDragNotClick', () => {
  it('treats an exact click as a click', () => {
    expect(isDragNotClick({ clientX: 10, clientY: 10 }, { clientX: 10, clientY: 10 })).toBe(false)
  })

  it('tolerates a small tremor', () => {
    expect(isDragNotClick({ clientX: 10, clientY: 10 }, { clientX: 12, clientY: 11 })).toBe(false)
  })

  it('treats a real drag as a drag', () => {
    expect(isDragNotClick({ clientX: 10, clientY: 10 }, { clientX: 40, clientY: 10 })).toBe(true)
    expect(isDragNotClick({ clientX: 10, clientY: 10 }, { clientX: 10, clientY: 40 })).toBe(true)
  })

  it('treats a missing mousedown as a click, not a drag', () => {
    expect(isDragNotClick(undefined, { clientX: 10, clientY: 10 })).toBe(false)
  })
})
