export type DiffLineType = 'hunk' | 'added' | 'removed' | 'context'

export interface DiffLine {
  type: DiffLineType
  content: string
  /** Line number on the old side. Present on 'removed' and 'context'. */
  oldLineNo?: number
  /** Line number on the new side. Present on 'added' and 'context'. */
  newLineNo?: number
}

const META_PREFIXES = ['diff ', 'index ', '--- ', '+++ ']

// Captures the two start lines from a hunk header. The ,count parts are
// optional — git emits "@@ -1 +1 @@" for single-line hunks.
const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

export function parseDiff(raw: string): DiffLine[] {
  if (!raw.trim()) return []
  const lines: DiffLine[] = []
  // Running counters, re-seeded from each hunk header as we walk the diff.
  let oldNo = 0
  let newNo = 0
  for (const line of raw.split('\n')) {
    if (META_PREFIXES.some(p => line.startsWith(p))) continue
    // "\ No newline at end of file" — a git marker, never real file content.
    // Dropping it keeps the line counters from drifting on the lines that follow.
    if (line.startsWith('\\')) continue
    if (line.startsWith('@@')) {
      const m = HUNK_RE.exec(line)
      if (m) {
        oldNo = Number(m[1])
        newNo = Number(m[2])
      }
      lines.push({ type: 'hunk', content: line })
    } else if (line.startsWith('+')) {
      lines.push({ type: 'added', content: line.slice(1), newLineNo: newNo })
      newNo++
    } else if (line.startsWith('-')) {
      lines.push({ type: 'removed', content: line.slice(1), oldLineNo: oldNo })
      oldNo++
    } else {
      const content = line.startsWith(' ') ? line.slice(1) : line
      lines.push({ type: 'context', content, oldLineNo: oldNo, newLineNo: newNo })
      oldNo++
      newNo++
    }
  }
  return lines
}
