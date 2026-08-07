/**
 * Head-slice + expander arithmetic shared by the composer's Recent and
 * Resume-sessions lists. Pure so the show-all/show-less behavior is
 * unit-tested once instead of re-derived per section.
 */

export function visibleSlice<T>(
  items: T[],
  expanded: boolean,
  initialCount: number
): T[] {
  return expanded ? items : items.slice(0, initialCount)
}

/** Rows the expander would reveal right now; 0 ⇒ nothing left to reveal.
 *  The render-an-expander decision is `hiddenCount(total, false, n) > 0` —
 *  passing `false` on purpose, so the button stays while expanded. */
export function hiddenCount(
  total: number,
  expanded: boolean,
  initialCount: number
): number {
  if (expanded) return 0
  return Math.max(0, total - initialCount)
}
