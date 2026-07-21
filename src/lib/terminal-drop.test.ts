import { describe, it, expect, vi, afterEach } from 'vitest'
import { formatDroppedPaths, dropPointToCss } from './terminal-drop'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('formatDroppedPaths', () => {
  it('leaves a clean posix path unquoted and appends one trailing space', () => {
    expect(formatDroppedPaths(['/Users/me/src/a.ts'], 'posix')).toBe('/Users/me/src/a.ts ')
  })

  it('single-quotes a posix path containing a space', () => {
    expect(formatDroppedPaths(['/My Files/a.txt'], 'posix')).toBe("'/My Files/a.txt' ")
  })

  it('escapes an embedded single quote for posix', () => {
    expect(formatDroppedPaths(["/it's/a.txt"], 'posix')).toBe("'/it'\\''s/a.txt' ")
  })

  it('joins multiple paths with a space, preserving order', () => {
    expect(formatDroppedPaths(['/a', '/b c'], 'posix')).toBe("/a '/b c' ")
  })

  it('leaves a clean windows path unquoted for powershell', () => {
    expect(formatDroppedPaths(['C:\\src\\a.ts'], 'powershell')).toBe('C:\\src\\a.ts ')
  })

  it('single-quotes a spaced path for powershell, doubling inner quotes', () => {
    expect(formatDroppedPaths(["C:\\My Files\\it's.txt"], 'powershell')).toBe(
      "'C:\\My Files\\it''s.txt' "
    )
  })

  it('double-quotes a spaced path for cmd', () => {
    expect(formatDroppedPaths(['C:\\My Files\\a.txt'], 'cmd')).toBe('"C:\\My Files\\a.txt" ')
  })

  it('drops a path containing a newline and warns', () => {
    // A literal newline written to the pty is Enter — it would submit a
    // half-typed command line.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(formatDroppedPaths(['/bad\nname', '/ok'], 'posix')).toBe('/ok ')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('returns an empty string when every path is unusable', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(formatDroppedPaths(['/bad\rname'], 'posix')).toBe('')
  })

  it('returns an empty string for an empty list', () => {
    expect(formatDroppedPaths([], 'posix')).toBe('')
  })
})

describe('dropPointToCss', () => {
  it('passes macOS positions through unscaled on a Retina display', () => {
    // Measured against a running app: scale_factor 2.0, inner_size 2560x1640,
    // yet drag positions never exceeded the 1280x820 logical size. Halving
    // these would land the drop in the top-left quadrant.
    expect(dropPointToCss({ x: 1031, y: 210 }, 2, true)).toEqual({ x: 1031, y: 210 })
  })

  it('passes macOS positions through on a non-Retina display too', () => {
    expect(dropPointToCss({ x: 640, y: 400 }, 1, true)).toEqual({ x: 640, y: 400 })
  })

  it('scales physical pixels down to CSS pixels off macOS', () => {
    expect(dropPointToCss({ x: 1024, y: 512 }, 2, false)).toEqual({ x: 512, y: 256 })
  })

  it('handles fractional Windows scaling', () => {
    expect(dropPointToCss({ x: 500, y: 250 }, 1.25, false)).toEqual({ x: 400, y: 200 })
  })

  it('treats a zero ratio as 1 rather than dividing by zero', () => {
    expect(dropPointToCss({ x: 300, y: 150 }, 0, false)).toEqual({ x: 300, y: 150 })
  })
})
