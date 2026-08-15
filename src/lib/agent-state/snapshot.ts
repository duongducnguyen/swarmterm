/**
 * Builds the detection snapshot: the last `rows` lines anchored at the
 * BOTTOM of the full buffer (scrollback included) — the user scrolling the
 * viewport never moves the detection window, which reads the live screen
 * herdr-style (Apache-2.0, src/pane/terminal.rs:2675-2687). Lines are
 * right-trimmed and trailing blanks dropped so "bottom line" means the last
 * line with content, not the last terminal row. Takes a narrow view
 * interface rather than an xterm Terminal so it stays pure and testable —
 * the adapter over `term.buffer.active` lives in the detector.
 */
export interface BufferView {
  rows: number
  length: number
  line(index: number): string
}

export function buildSnapshot(view: BufferView): string {
  const end = view.length
  const start = Math.max(0, end - view.rows)
  const lines: string[] = []
  for (let i = start; i < end; i++) lines.push(view.line(i).trimEnd())
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  return lines.join('\n')
}
