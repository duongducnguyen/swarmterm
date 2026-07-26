/**
 * Turning edits of xterm's hidden textarea into pty input.
 *
 * On macOS a native terminal receives text through NSTextInputClient: the OS
 * hands it whole strings via `insertText:replacementRange:`, however many
 * characters they carry. In a webview the same insertion arrives as a mutation
 * of the hidden textarea, and xterm's keyboard path only carries a subset of
 * those through (see the design spec). This module supplies the missing half:
 * given what has already been written to the pty and what the textarea now
 * holds, it computes the one edit that reconciles them.
 */

/** Erase `deletions` graphemes from the pty line, then write `insert`. */
export interface Edit {
  deletions: number
  insert: string
}

/**
 * Graphemes, not code units. A terminal erases one *character* per DEL, but
 * "ạ" in NFD is two UTF-16 units and an astral emoji is a surrogate pair —
 * counting units would send too many DELs and reproduce the off-by-one desync
 * this module exists to prevent.
 */
const SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

function graphemes(text: string): string[] {
  return Array.from(SEGMENTER.segment(text), (s) => s.segment)
}

/** The minimal edit turning `committed` into `next`. */
export function diffToEdit(committed: string, next: string): Edit {
  const before = graphemes(committed)
  const after = graphemes(next)

  let shared = 0
  while (shared < before.length && shared < after.length && before[shared] === after[shared]) {
    shared++
  }

  return {
    deletions: before.length - shared,
    insert: after.slice(shared).join('')
  }
}

/** The bytes an `Edit` becomes on the wire. DEL is what Backspace sends. */
export function encodeEdit(edit: Edit): string {
  return '\x7f'.repeat(edit.deletions) + edit.insert
}
