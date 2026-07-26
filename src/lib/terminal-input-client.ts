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
 *
 * It also decides, event by event, which side — this layer or one of xterm's
 * own keyboard paths (`_keyDown`'s cancel-and-send, `_keyPress`'s single-char
 * fallback) — is the correct writer for a given keystroke. Letting both write,
 * or neither, is exactly how characters get lost or duplicated; see
 * `ownsMultiCharKey` and `isOrdinaryCharKey`.
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

/**
 * The keycode a browser reports while an input method owns the keystroke. xterm
 * treats it as the trigger for `CompositionHelper._handleAnyTextareaChanges`,
 * which diffs the textarea with `after.replace(before, '')` and collapses any
 * number of deletions into a single DEL. That path must not run alongside this
 * one, so the event is taken before xterm can see it.
 */
const IME_KEYCODE = 229

/** Keys that change nothing on their own, so an open segment survives them. */
const BARE_MODIFIERS = new Set([
  'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock',
  'AltGraph', 'Fn', 'FnLock', 'Hyper', 'Super', 'Symbol', 'SymbolLock', 'OS'
])

/** True when this layer must take the keydown before xterm sees it. */
export function ownsKeydown(event: { keyCode: number; isComposing: boolean }): boolean {
  if (event.isComposing) return false
  return event.keyCode === IME_KEYCODE
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
 * True when a keydown — and the keypress that follows it, since both carry the
 * same `.key`/`.code` — delivers more than one character of real text: a bộ gõ
 * re-inserting a corrected word (XKey's CGEvent mode) or replacing a tone mark
 * in place (macOS Simple Telex) in a single event, rather than through
 * composition. Ported from this project's earlier `ime-input.ts`, which used
 * this same shape-sniffing to compute the text to send directly; this layer
 * only needs the boolean, because it now reads the replacement from the
 * textarea itself (see `terminal-registry.ts`).
 *
 * Two separate xterm paths mishandle an event this owns, and the caller must
 * neutralise both:
 *  - `evaluateKeyboardEvent` has no branch for `key.length > 1`, so `_keyDown`
 *    leaves the keydown alone entirely — no cancel, no send. This layer's
 *    `keydown` listener must not reset the open segment for it, so `committed`
 *    survives into the `input` event the browser's (un-cancelled) default
 *    insertion produces, and the diff against it can compute real deletions —
 *    not the zero deletions `ime-input.ts` always sent, which only happened to
 *    be correct for XKey, whose own real Backspace keydowns do the deleting
 *    separately, and was wrong for macOS Telex's tone corrections ("banạn"
 *    instead of "bạn").
 *  - Because `_keyDown` never handled it, `_keyPress` runs next and falls back
 *    to `String.fromCharCode(ev.charCode)` — a single code unit — truncating
 *    the correction to its first character and sending that truncated copy.
 *    The caller's `attachCustomKeyEventHandler` must return `false` for the
 *    matching `keypress` event to stop that fallback before it sends, without
 *    calling `preventDefault()`, so the browser's default text insertion (and
 *    the `input` event this module's diff needs) still happens.
 */
export function ownsMultiCharKey(event: {
  key: string
  code: string
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
}): boolean {
  // A chord is a shortcut, never text — leave Ctrl/Alt/Cmd bindings alone.
  if (event.ctrlKey || event.altKey || event.metaKey) return false
  // Single characters already survive xterm's own paths intact.
  if (event.key.length < 2) return false
  if (NAMED_KEYS.has(event.key) || NAMED_KEY_FAMILY.test(event.key)) return false
  // `code` is the reliable signal, and real browsers always set it for a
  // physical press; only fall back to guessing from the string's shape when
  // the event carries none.
  if (event.code) return TEXT_PRODUCING_CODE.test(event.code)
  return !IDENTIFIER_SHAPE.test(event.key)
}

/**
 * True for an ordinary, unmodified single character — "d", "5", " ".
 * `_keyDown`'s own printable branch (`keyCode >= 48 && key.length === 1`,
 * verified against @xterm/xterm 6.0.0) cancels and sends these itself, with
 * one exception: Space is keyCode 32, below that threshold, so `_keyDown`
 * leaves it alone and `_keyPress`'s `String.fromCharCode(charCode)` fallback
 * sends it instead — correctly, since `charCode` is exactly one code unit
 * whenever `key.length === 1`. Either way xterm's own path is the whole,
 * correct write for this keystroke: if the browser's default text insertion
 * also fires — guaranteed for Space, since nothing cancelled its keydown —
 * the resulting `input` event must be swallowed, not diffed and sent again
 * (macOS additionally substitutes U+00A0 NBSP for a bare space bar press in
 * the textarea, one more reason that event must never reach the pty as
 * typed). See the `keydown`/`input` listeners in `terminal-registry.ts`.
 */
export function isOrdinaryCharKey(event: {
  key: string
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
}): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey
}

/**
 * `input` event `inputType` values this layer treats as the user typing, and
 * therefore diffs the textarea for. `insertText` is a plain keystroke.
 * `insertReplacementText` is what WKWebView delivers for Input Method Kit's
 * `insertText:replacementRange:` — the mechanism macOS' own Telex/VNI uses to
 * replace a word in place — and xterm's own `_inputEvent` never accepted that
 * inputType at all, which is exactly the gap this module exists to close.
 *
 * Everything else is refused. In particular `insertFromPaste` / `insertFromDrop`:
 * xterm binds its own paste handler to both the textarea and the host element
 * without calling preventDefault, so a native paste this app's clipboard
 * shortcut handling doesn't suppress (the macOS Edit menu, a Services action)
 * is already sent to the pty by xterm before the browser's default insertion
 * fires this `input` event — diffing it here would send it a second time.
 * `historyUndo` / `historyRedo` don't correspond to a pty edit at all.
 *
 * An allow-list, not a deny-list: an inputType this module has never seen is
 * refused by default rather than risking an accidental double-send.
 */
const TYPING_INPUT_TYPES = new Set(['insertText', 'insertReplacementText'])

/** True when this layer owns the resulting text change. */
export function ownsInputEvent(event: { isComposing: boolean; inputType: string }): boolean {
  return !event.isComposing && TYPING_INPUT_TYPES.has(event.inputType)
}

/**
 * Whether a key left to xterm invalidates the open segment. For most of these
 * xterm cancels its own default handling entirely, so the textarea never
 * changes and this reset is just bookkeeping ahead of that — but Space is an
 * exception (see `isOrdinaryCharKey`) where the textarea DOES change, and the
 * segment still ends here regardless: a completed word is exactly where a
 * correction should stop reaching backward. Either way the caller resets the
 * baseline so it can't go stale against a pty line that has already moved.
 */
export function breaksSegment(event: { key: string }): boolean {
  return !BARE_MODIFIERS.has(event.key)
}
