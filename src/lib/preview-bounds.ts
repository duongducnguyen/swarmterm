/**
 * Native webview bounds are set in whole logical pixels; fractional CSS rects
 * (zoomed displays, percentage panels) would drift the webview off its
 * placeholder by a pixel per update. Rounding once, here, keeps every caller
 * consistent — and a 0-sized rect (mid-layout) must never reach the OS view,
 * hence the 1px floor.
 */
export interface PreviewBounds {
  x: number
  y: number
  width: number
  height: number
}

export function toLogicalBounds(rect: {
  x: number
  y: number
  width: number
  height: number
}): PreviewBounds {
  return {
    x: Math.max(0, Math.round(rect.x)),
    y: Math.max(0, Math.round(rect.y)),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height))
  }
}

/** Skip redundant IPC: bounds updates fire per animation frame while resizing. */
export function boundsEqual(a: PreviewBounds, b: PreviewBounds | undefined): boolean {
  return (
    b !== undefined && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  )
}
