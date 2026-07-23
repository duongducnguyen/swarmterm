/**
 * Turning a resolved file location into an editor invocation. Pure, and
 * deliberately on the TS side rather than in Rust: the per-editor goto syntax is
 * the part most likely to be wrong, and here it is covered by fast unit tests.
 * Rust receives a ready bin + args pair and only spawns it — by argv, never
 * through a shell, so no path can be reinterpreted as shell syntax.
 */

/**
 * Allowlist. An editor not on this list is never launched, which is what keeps a
 * misclick from executing an arbitrary program.
 */
export type EditorId = 'code' | 'cursor' | 'zed' | 'subl' | 'idea'

/** Probed in this order when $VISUAL/$EDITOR names nothing on the allowlist. */
export const EDITOR_PRIORITY: readonly EditorId[] = ['code', 'cursor', 'zed', 'subl', 'idea']

/** `path`, `path:line`, or `path:line:col` — the form code/zed/subl all accept. */
function withLocation(path: string, line?: number, col?: number): string {
  if (line === undefined) return path
  if (col === undefined) return `${path}:${line}`
  return `${path}:${line}:${col}`
}

export function buildEditorCommand(
  editor: EditorId,
  path: string,
  line?: number,
  col?: number
): { bin: string; args: string[] } {
  switch (editor) {
    // VS Code and its forks need an explicit -g to read the :line:col suffix;
    // without it the suffix is taken as part of the filename.
    case 'code':
    case 'cursor':
      return {
        bin: editor,
        args: line === undefined ? [path] : ['-g', withLocation(path, line, col)],
      }
    case 'zed':
    case 'subl':
      return { bin: editor, args: [withLocation(path, line, col)] }
    // IntelliJ is the odd one out: flags, not a suffix, and the path comes last.
    case 'idea': {
      if (line === undefined) return { bin: 'idea', args: [path] }
      const args = ['--line', String(line)]
      if (col !== undefined) args.push('--column', String(col))
      args.push(path)
      return { bin: 'idea', args }
    }
  }
}
