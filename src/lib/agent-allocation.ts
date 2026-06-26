/**
 * Turns a per-agent count map plus a terminal total into the ordered list of
 * agent ids the Welcome form hands to `createWorkspace` — one id per pane.
 *
 * The plain Terminal template is never *allocated*; it is the filler that pads
 * any panes the user didn't assign to an agent. So callers pass counts only for
 * the installed agents (templates with an `executable`), and the remainder
 * comes back as `DEFAULT_TEMPLATE_ID`.
 */
import { TEMPLATES, DEFAULT_TEMPLATE_ID } from './templates'

/** Ordered agent ids of length `total`: agents in TEMPLATES order, then Terminal padding. */
export function allocateAgents(total: number, counts: Record<string, number>): string[] {
  const ids: string[] = []
  for (const t of TEMPLATES) {
    if (!t.executable) continue // plain Terminal is filler, not an allocatable agent
    const n = Math.max(0, counts[t.id] ?? 0)
    for (let i = 0; i < n && ids.length < total; i++) ids.push(t.id)
  }
  while (ids.length < total) ids.push(DEFAULT_TEMPLATE_ID)
  return ids
}

/**
 * Caps a count map so the running sum (in TEMPLATES order) never exceeds `total`.
 * Used when the chosen terminal count shrinks below what was already allocated.
 * Negative/zero entries are dropped.
 */
export function clampCounts(
  counts: Record<string, number>,
  total: number
): Record<string, number> {
  const out: Record<string, number> = {}
  let used = 0
  for (const t of TEMPLATES) {
    if (!t.executable) continue
    const want = Math.max(0, counts[t.id] ?? 0)
    const allowed = Math.min(want, Math.max(0, total - used))
    if (allowed > 0) {
      out[t.id] = allowed
      used += allowed
    }
  }
  return out
}
