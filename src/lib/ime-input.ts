/**
 * Recovering text that xterm.js drops from multi-character IME insertions.
 *
 * Vietnamese bộ gõ (EVKey/xkey/OpenKey, and macOS' own Telex/VNI when driving a
 * non-composition path) do NOT use composition events. They correct a word by
 * synthesising Backspaces and then re-inserting the corrected text — and that
 * re-insertion can be more than one character in a single keydown, e.g. typing
 * "ban" + dấu nặng arrives as one event with key = "ạn".
 *
 * xterm cannot carry that through:
 *   - `evaluateKeyboardEvent` only accepts printable keys when
 *     `ev.key.length === 1`, so the keydown path sends nothing;
 *   - `_keyPress` then rebuilds the text as `String.fromCharCode(ev.charCode)`,
 *     which is a single code unit — so only "ạ" reaches the pty — and sets
 *     `_keyPressHandled`;
 *   - `_inputEvent`, which *does* receive the complete `data = "ạn"`, returns
 *     early because `_keyPressHandled` is set.
 *
 * Net effect: every character after the first of a re-insertion is lost
 * ("bạn" → "bạ", "mình" → "mìh"). The registry calls this from its
 * `attachCustomKeyEventHandler` and, on a hit, writes the full string itself and
 * cancels the event so xterm's truncating path never runs.
 */

/** The subset of a KeyboardEvent the decision needs (keeps this DOM-free). */
export interface ImeKeyEventLike {
  key: string
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
}

/**
 * Named keys in the UI Events spec ("Enter", "ArrowUp", "AudioVolumeUp", "F3",
 * "OS", …) are all ASCII identifiers. Text a bộ gõ re-inserts is not: Vietnamese
 * replacements always carry at least one accented — therefore non-ASCII —
 * character. Matching the identifier shape rather than enumerating the spec's
 * key list means an unknown or newly-added named key is treated as a key, never
 * echoed to the shell as literal text.
 *
 * Known limit: a purely ASCII multi-character re-insertion (the telex escape
 * "aaa" → "aa") is indistinguishable from an identifier here and stays broken.
 * That is strictly better than typing "AudioVolumeUp" into the user's shell.
 */
const NAMED_KEY = /^[A-Za-z][A-Za-z0-9]*$/

/**
 * The text a multi-character IME insertion wants to send, or `null` when the
 * event is an ordinary key that xterm should handle itself.
 */
export function imeTextFromKeyEvent(event: ImeKeyEventLike): string | null {
  // A chord is a shortcut, never text — leave Ctrl/Alt/Cmd bindings alone.
  if (event.ctrlKey || event.altKey || event.metaKey) return null
  // Single characters already survive xterm's keypress path intact.
  if (event.key.length < 2) return null
  if (NAMED_KEY.test(event.key)) return null
  return event.key
}
