/**
 * Recovering text that xterm.js drops from multi-character IME insertions.
 *
 * Vietnamese bộ gõ (XKey/EVKey/OpenKey, and macOS' own Telex/VNI when driving a
 * non-composition path) do NOT use composition events. They correct a word by
 * synthesising Backspaces and then re-inserting the corrected text — and that
 * re-insertion can be more than one character in a single keydown, e.g. typing
 * "ban" + dấu nặng arrives as one event with key = "ạn".
 *
 * xterm cannot carry that through:
 *   - `evaluateKeyboardEvent` has no branch for `key.length > 1`, so it returns
 *     an empty key and `_keyDown` short-circuits on `!i.key` without emitting;
 *   - `_keyPress` then rebuilds the text as `String.fromCharCode(ev.charCode)`,
 *     which is a single code unit — so only "ạ" reaches the pty;
 *   - `_inputEvent`, which *does* receive the complete `data = "ạn"`, refuses it
 *     because a trusted input event is `composed` and `_keyDownSeen` is set.
 *
 * Net effect: every character after the first of a re-insertion is lost. The
 * registry calls this from its `attachCustomKeyEventHandler` and, on a hit,
 * writes the full string itself and cancels the event so xterm's truncating
 * path never runs.
 */

/** The subset of a KeyboardEvent the decision needs (keeps this DOM-free). */
export interface ImeKeyEventLike {
  key: string
  /** `KeyboardEvent.code` — the physical key, unaffected by what the IME types. */
  code: string
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
}

/**
 * Named keys from the UI Events spec. Anything here is a key, never text, no
 * matter what `code` says — "Enter" on NumpadEnter is still Enter.
 */
const NAMED_KEYS = new Set([
  // Modifiers
  'Alt', 'AltGraph', 'CapsLock', 'Control', 'Fn', 'FnLock', 'Hyper', 'Meta',
  'NumLock', 'OS', 'ScrollLock', 'Shift', 'Super', 'Symbol', 'SymbolLock',
  // Whitespace / editing
  'Enter', 'Tab', 'Backspace', 'Delete', 'Insert', 'Clear', 'Copy', 'Cut',
  'Paste', 'Redo', 'Undo', 'EraseEof',
  // Navigation
  'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'End', 'Home', 'PageDown',
  'PageUp',
  // UI
  'Escape', 'ContextMenu', 'Help', 'Pause', 'Play', 'Select', 'ZoomIn', 'ZoomOut',
  'Again', 'Attn', 'Cancel', 'ExSel', 'Find', 'Props',
  // Composition / unknown
  'Dead', 'Compose', 'Process', 'Unidentified',
  // Device / power
  'PrintScreen', 'Power', 'Eject', 'WakeUp', 'Standby', 'BrightnessDown',
  'BrightnessUp', 'LogOff', 'Hibernate',
  // Media / browser / launch
  'AudioVolumeUp', 'AudioVolumeDown', 'AudioVolumeMute', 'MediaPlay',
  'MediaPause', 'MediaPlayPause', 'MediaStop', 'MediaRecord', 'MediaRewind',
  'MediaFastForward', 'MediaTrackNext', 'MediaTrackPrevious', 'BrowserBack',
  'BrowserForward', 'BrowserHome', 'BrowserRefresh', 'BrowserSearch',
  'BrowserStop', 'BrowserFavorites', 'LaunchMail', 'LaunchMediaPlayer',
  'LaunchApplication1', 'LaunchApplication2'
])

/**
 * The one named-key family worth matching by pattern rather than listing: F1–F24
 * and Soft1–Soft4. Fully anchored — a prefix match here would swallow real text
 * (a "Media"-style prefix rule would eat any re-insertion starting with it).
 */
const NAMED_KEY_FAMILY = /^(?:F\d{1,2}|Soft\d)$/

/**
 * Physical keys that produce text. A bộ gõ re-inserts its correction on the
 * letter/digit key the user actually pressed, so `code` stays a text key even
 * when `key` has been rewritten to a whole word — that is what separates the
 * re-insertion "dd" (code KeyA) from the named key "Enter" (code Enter).
 * Deliberately excludes NumpadEnter, which is not text.
 */
const TEXT_PRODUCING_CODE =
  /^(?:Key[A-Z]|Digit\d|Numpad(?:\d|Add|Comma|Decimal|Divide|Equal|Multiply|Subtract)|Space|Minus|Equal|Bracket(?:Left|Right)|Backslash|Semicolon|Quote|Backquote|Comma|Period|Slash|Intl(?:Backslash|Ro|Yen))$/

/**
 * Fallback for events that carry no `code` at all (nothing physical to inspect).
 * Named keys in the spec are ASCII identifiers; text a bộ gõ re-inserts usually
 * is not. Known limit: a purely ASCII re-insertion with no `code` — "dd", the
 * telex escape "aaa" → "aa" — is indistinguishable from an identifier here and
 * stays broken. That is strictly better than typing "AudioVolumeUp" into the
 * shell, and in practice every capture so far does carry a `code`.
 */
const IDENTIFIER_SHAPE = /^[A-Za-z][A-Za-z0-9]*$/

/**
 * The text a multi-character IME insertion wants to send, or `null` when the
 * event is an ordinary key that xterm should handle itself.
 */
export function imeTextFromKeyEvent(event: ImeKeyEventLike): string | null {
  // A chord is a shortcut, never text — leave Ctrl/Alt/Cmd bindings alone.
  if (event.ctrlKey || event.altKey || event.metaKey) return null
  // Single characters already survive xterm's keydown path intact.
  if (event.key.length < 2) return null
  if (NAMED_KEYS.has(event.key) || NAMED_KEY_FAMILY.test(event.key)) return null
  // `code` is the reliable signal, and real browsers always set it for a
  // physical press; only fall back to guessing from the string's shape when the
  // event carries none.
  if (event.code) return TEXT_PRODUCING_CODE.test(event.code) ? event.key : null
  return IDENTIFIER_SHAPE.test(event.key) ? null : event.key
}
