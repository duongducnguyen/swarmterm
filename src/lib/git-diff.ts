export type DiffLineType = 'hunk' | 'added' | 'removed' | 'context'

export interface DiffLine {
  type: DiffLineType
  content: string
}

const META_PREFIXES = ['diff ', 'index ', '--- ', '+++ ']

export function parseDiff(raw: string): DiffLine[] {
  if (!raw.trim()) return []
  const lines: DiffLine[] = []
  for (const line of raw.split('\n')) {
    if (META_PREFIXES.some(p => line.startsWith(p))) continue
    if (line.startsWith('@@')) {
      lines.push({ type: 'hunk', content: line })
    } else if (line.startsWith('+')) {
      lines.push({ type: 'added', content: line.slice(1) })
    } else if (line.startsWith('-')) {
      lines.push({ type: 'removed', content: line.slice(1) })
    } else {
      lines.push({ type: 'context', content: line.startsWith(' ') ? line.slice(1) : line })
    }
  }
  return lines
}
