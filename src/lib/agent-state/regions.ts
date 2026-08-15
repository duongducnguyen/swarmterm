import type { DetectionInput, Region } from '@/lib/agent-state/types'

/**
 * Region extractors over a detection snapshot — a TS port of herdr's region
 * semantics (Apache-2.0, src/detect/manifest.rs:1255-1499 and the Codex
 * prompt-marker helpers at :1357-1422; see THIRD-PARTY-NOTICES.md). Regions
 * slice the snapshot narrowly so rules can anchor to stable TUI chrome
 * instead of scanning the whole screen — herdr's core false-positive defence.
 */

const isBlank = (line: string): boolean => line.trim() === ''

/** Suffix starting at the Nth-from-last non-empty line — intervening blank
 *  lines are INCLUDED (this is "cut above here", not "take N lines"). */
export function bottomNonEmptyLines(content: string, n: number): string {
  const lines = content.split('\n')
  let seen = 0
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!isBlank(lines[i])) {
      seen++
      if (seen === n) return lines.slice(i).join('\n')
    }
  }
  return seen === 0 ? '' : content
}

/** Prefix ending at the Nth non-empty line from the top. */
export function topNonEmptyLines(content: string, n: number): string {
  const lines = content.split('\n')
  let seen = 0
  for (let i = 0; i < lines.length; i++) {
    if (!isBlank(lines[i])) {
      seen++
      if (seen === n) return lines.slice(0, i + 1).join('\n')
    }
  }
  return seen === 0 ? '' : content
}

/** A horizontal rule is a trimmed line whose leading run of `─` is ≥1 and
 *  either fills the line, or is ≥3 when a label follows (`─── Label`). */
export function isHorizontalRule(line: string): boolean {
  const t = line.trim()
  let run = 0
  while (run < t.length && t[run] === '─') run++
  if (run === 0) return false
  return run === t.length || run >= 3
}

export function afterLastHorizontalRule(content: string): string {
  const lines = content.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    if (isHorizontalRule(lines[i])) return lines.slice(i + 1).join('\n')
  }
  return content
}

/** The 2nd horizontal rule from the bottom is the prompt box's top border;
 *  the body is what sits strictly between it and the rule below it. */
export function promptBoxBody(content: string): string {
  const lines = content.split('\n')
  const rules: number[] = []
  for (let i = lines.length - 1; i >= 0 && rules.length < 2; i--) {
    if (isHorizontalRule(lines[i])) rules.push(i)
  }
  if (rules.length < 2) return ''
  const [bottom, top] = rules
  return lines.slice(top + 1, bottom).join('\n')
}

/** Codex draws its composer as a line that IS `›` or starts with `› `. */
const isCodexPromptLine = (line: string): boolean => line === '›' || line.startsWith('› ')

export function afterLastPromptMarker(content: string): string {
  const lines = content.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    if (isCodexPromptLine(lines[i])) return lines.slice(i + 1).join('\n')
  }
  return content
}

export function resolveRegion(region: Region, input: DetectionInput): string {
  if (typeof region === 'object') {
    return 'bottomNonEmptyLines' in region
      ? bottomNonEmptyLines(input.screen, region.bottomNonEmptyLines)
      : topNonEmptyLines(input.screen, region.topNonEmptyLines)
  }
  switch (region) {
    case 'whole_recent':
      return input.screen
    case 'osc_title':
      return input.oscTitle
    case 'osc_progress':
      return input.oscProgress
    case 'after_last_horizontal_rule':
      return afterLastHorizontalRule(input.screen)
    case 'prompt_box_body':
      return promptBoxBody(input.screen)
    case 'after_last_prompt_marker':
      return afterLastPromptMarker(input.screen)
  }
}
