/**
 * Classifies one `onData` payload from xterm — one piece of genuine user
 * input — so the War Room nudge guard can tell "mid-line" from "line
 * finished". Pure; the store applies the result and the delivery scheduler
 * reads it. See `shouldDeferDelivery` in war-room-nudge.ts.
 */
export type InputKind = 'edit' | 'submit' | 'nav'

/** Lone control codes that commit or abandon the current line. `\x1b` here is
 *  Esc pressed on its own — an escape SEQUENCE starts with the same byte and
 *  is handled below, which is the one distinction this module exists for. */
const LINE_ENDING_CODES = new Set(['\r', '\n', '\x03', '\x15', '\x1b'])

export function classifyInput(data: string): InputKind {
  if (data === '') return 'nav'
  if (LINE_ENDING_CODES.has(data)) return 'submit'
  // A CR/LF anywhere means at least one line was committed — a multi-line
  // paste, or a chord whose payload ends in Enter.
  if (data.includes('\r') || data.includes('\n')) return 'submit'
  // Arrows, Home/End, function keys: they move the cursor without changing
  // what is on the line, so they refresh the "recently active" timestamp but
  // must not clear the dirty flag.
  if (data.startsWith('\x1b')) return 'nav'
  // Everything else edits the line, backspace included. Backspacing a line
  // down to empty still counts as dirty — we cannot see the line's contents,
  // and over-holding a delivery is the safe direction to err in. Esc clears it.
  return 'edit'
}
