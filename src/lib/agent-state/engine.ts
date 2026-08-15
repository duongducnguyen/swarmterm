import { resolveRegion } from '@/lib/agent-state/regions'
import type { DetectionInput, Gate, Manifest, Verdict } from '@/lib/agent-state/types'

/**
 * herdr-compatible rule evaluation (Apache-2.0 port, src/detect/manifest.rs:
 * 415-496 main loop, 1206-1253 gate matching; see THIRD-PARTY-NOTICES.md).
 * Compatibility matters because it keeps herdr's battle-tested manifests
 * copy-portable when agent TUIs change: every rule is evaluated (no
 * short-circuit), the highest priority wins, ties keep the FIRST rule in
 * manifest order, `contains` is case-insensitive while regexes are not, and
 * an unmatched screen falls back to idle — detection must never guess
 * blocked.
 */

export function gateMatches(gate: Gate, text: string, lower?: string): boolean {
  // Lowered once per rule evaluation and shared down the gate tree — herdr
  // lowers needles at compile time; lowering at match keeps manifests
  // readable as written.
  const lowerText = lower ?? text.toLowerCase()
  if (gate.contains !== undefined && !gate.contains.every((n) => lowerText.includes(n.toLowerCase()))) {
    return false
  }
  if (gate.regex !== undefined && !gate.regex.every((r) => r.test(text))) return false
  if (gate.lineRegex !== undefined) {
    const lines = text.split('\n')
    if (!gate.lineRegex.every((r) => lines.some((l) => r.test(l)))) return false
  }
  if (gate.all !== undefined && !gate.all.every((g) => gateMatches(g, text, lowerText))) return false
  if (gate.any !== undefined && gate.any.length > 0 && !gate.any.some((g) => gateMatches(g, text, lowerText))) {
    return false
  }
  if (gate.not !== undefined && gate.not.some((g) => gateMatches(g, text, lowerText))) return false
  return true
}

const NO_MATCH: Verdict = {
  // Agent panes are the only callers, so the agent is always "known" here —
  // herdr's default_known_agent_idle_fallback, not Unknown.
  state: 'idle',
  visibleIdle: false,
  visibleBlocker: false,
  visibleWorking: false,
  skip: false
}

export function evaluateManifest(manifest: Manifest, input: DetectionInput): Verdict {
  let winner: Manifest['rules'][number] | undefined
  for (const rule of manifest.rules) {
    const text = resolveRegion(rule.region, input)
    if (!gateMatches(rule, text)) continue
    // `>` (not `>=`) keeps the incumbent on ties — first in manifest order wins.
    if (winner === undefined || rule.priority > winner.priority) winner = rule
  }
  if (winner === undefined) return NO_MATCH
  if (winner.skipStateUpdate === true) {
    return { state: 'unknown', visibleIdle: false, visibleBlocker: false, visibleWorking: false, skip: true, ruleId: winner.id }
  }
  return {
    state: winner.state,
    visibleIdle: winner.visibleIdle === true && winner.state === 'idle',
    visibleBlocker: winner.visibleBlocker === true && winner.state === 'blocked',
    visibleWorking: winner.visibleWorking === true && winner.state === 'working',
    skip: false,
    ruleId: winner.id
  }
}
