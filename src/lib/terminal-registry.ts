import { Terminal, type ILink, type ILinkHandler, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'
import { createTerminal, killTerminal, resizeTerminal, writeTerminal } from '@/tauri/terminal'
import { TerminalSession, type TerminalStatus } from '@/lib/terminal-session'
import { useTerminalTextStore } from '@/store/terminal-text-store'
import { useTerminalTitleStore } from '@/store/terminal-title-store'
import { resolveBroadcastTargets } from '@/lib/broadcast-input'
import { useAppStore, selectWorkspaceByTerminalId } from '@/store/app-store'
import type { TerminalTextPref } from '@/lib/terminal-text'
import { decideClipboardAction, isMacPlatform } from '@/lib/terminal-clipboard'
import { isWindowsPlatform } from '@/lib/platform'
import { readClipboard, writeClipboard } from '@/tauri/clipboard'
import {
  isDragNotClick,
  shouldFollowLink,
  type ClickPoint,
  type LinkKind
} from '@/lib/terminal-links'
import { parseFileUrl } from '@/lib/file-url'
import { detectPathCandidates, parsePathSuffix } from '@/lib/path-link-parse'
import { classifyOscLink, openPathLocation } from '@/lib/terminal-link-actions'
import { openUrl } from '@/tauri/opener'
import {
  findAvailableEditor,
  openInEditor,
  resolvePathLink,
  revealInFileManager
} from '@/tauri/links'
import { ActivityTracker } from '@/lib/activity-tracker'
import { useTerminalActivityStore } from '@/store/terminal-activity-store'
import { useTerminalTypingStore } from '@/store/terminal-typing-store'
import {
  breaksSegment,
  diffToEdit,
  encodeEdit,
  isOrdinaryCharKey,
  isThirdLevelShiftKey,
  nextSuppressState,
  ownsInputEvent,
  ownsKeydown,
  ownsMultiCharKey,
  shouldSuppressInput,
  type SuppressState
} from '@/lib/terminal-input-client'

export type { TerminalStatus }

/**
 * VSCode "Default Dark Modern" terminal palette. Used verbatim regardless of
 * the user's actual shell defaults so the terminal interior matches the rest
 * of the app's dark chrome. ANSI values mirror VSCode's built-in
 * workbench.colorCustomizations terminal.ansi* defaults for the Dark Modern
 * theme.
 */
const VSCODE_DARK_THEME: ITheme = {
  background: '#1F1F1F',
  foreground: '#CCCCCC',
  cursor: '#CCCCCC',
  cursorAccent: '#1F1F1F',
  selectionBackground: 'rgba(255, 255, 255, 0.25)',
  black: '#000000',
  brightBlack: '#666666',
  red: '#CD3131',
  brightRed: '#F14C4C',
  green: '#0DBC79',
  brightGreen: '#23D18B',
  yellow: '#E5E510',
  brightYellow: '#F5F543',
  blue: '#2472C8',
  brightBlue: '#3B8EEA',
  magenta: '#BC3FBC',
  brightMagenta: '#D670D6',
  cyan: '#11A8CD',
  brightCyan: '#29B8DB',
  white: '#E5E5E5',
  brightWhite: '#E5E5E5'
}

/** CSS font-feature-settings value enabling programming ligatures, or off. */
function ligatureFeatureSettings(on: boolean): string {
  return on ? '"liga" 1, "calt" 1' : 'normal'
}

/** Per-terminal options that persist across re-attaches (size is read live). */
export interface AttachConfig {
  cwd?: string
  shellId?: import('@/lib/terminal-pref').ShellId
  initialCommand?: string
  worktreeMode?: boolean
  repoRoot?: string
}

interface Entry {
  term: Terminal
  fit: FitAddon
  /** Stable host the xterm renders into; moved between pane containers. */
  host: HTMLDivElement
  session: TerminalSession
  config: AttachConfig
  /**
   * The shell's live working directory, used to resolve relative path links.
   * Seeded from the spawn cwd and updated on every OSC 7 report, because `cd`
   * makes the spawn value wrong within seconds.
   */
  cwd: string
  /** Where the last press began, for the drag-vs-click guard. */
  lastMouseDown?: ClickPoint
  opened: boolean
  observer?: ResizeObserver
  /**
   * Clears the IME input segment's `committed` baseline and the textarea it
   * tracks. Exists on `Entry` — rather than staying a closure private to
   * `getOrCreate` — because paste, respawn, and retry all move the pty line
   * from outside the textarea `input` event this segment is diffed against:
   * `pasteIntoTerminal` writes straight to the pty via `term.paste` (which
   * also clears the textarea itself, but not `committed`), and
   * `respawnTerminal`/`retryTerminal` replace the pty under the same pane.
   * Left stale, the next real keystroke diffs against committed text the pty
   * no longer has and sends deletions for characters the new pty never saw.
   * Composition-safe: the textarea itself is left untouched if a composition
   * happens to be open when this is called, since none of these three
   * callers has any way to know that.
   */
  resetInputSegment: () => void
}

/** Live terminals keyed by terminalId, owned outside React's render tree. */
const entries = new Map<string, Entry>()

/**
 * One activity tracker for every terminal. `notify(id)` fires on each decoded
 * pty chunk (see the session sink below); after ACTIVITY_IDLE_MS of no chunks
 * the terminal flips back to idle. 1100ms is long enough to bridge the quiet
 * gaps between an agent's spinner redraws so the badge doesn't flicker, short
 * enough to clear promptly once real output stops.
 */
const ACTIVITY_IDLE_MS = 1100
const activityTracker = new ActivityTracker<string>(
  (id, active) => useTerminalActivityStore.getState().setActive(id, active),
  ACTIVITY_IDLE_MS
)

const NO_STATUS: TerminalStatus = { kind: 'connecting' }

/**
 * Switch the terminal to the GPU (WebGL) renderer. xterm's default DOM renderer
 * rebuilds per-cell spans and reflows on every frame; the WebGL renderer offloads
 * drawing to the GPU and is markedly cheaper per frame under heavy output, which
 * is why every serious terminal (VS Code, Hyper) uses it.
 *
 * Must run AFTER `term.open()` (the addon needs a live render surface). Degrades
 * gracefully: if WebGL2 is unavailable, the browser hits its live-context limit
 * (~16 per page), or the GPU context is later lost, we dispose the addon and
 * xterm falls back to the DOM renderer — slower, but always functional.
 */
function loadWebglRenderer(term: Terminal): void {
  try {
    const addon = new WebglAddon()
    addon.onContextLoss(() => addon.dispose())
    term.loadAddon(addon)
  } catch {
    // WebGL2 unavailable — stay on the DOM renderer.
  }
}

/** Fit the terminal to its host, skipping when the host has no laid-out size. */
function safeFit(entry: Entry): boolean {
  const { host, fit } = entry
  if (host.clientWidth === 0 || host.clientHeight === 0) return false
  try {
    fit.fit()
    return true
  } catch {
    return false
  }
}

function getOrCreate(id: string): Entry {
  const existing = entries.get(id)
  if (existing) return existing

  const host = document.createElement('div')
  host.style.width = '100%'
  host.style.height = '100%'
  // Inset the terminal content from the pane edges so text isn't flush against
  // the border. Padding lives on the host (not the .xterm element) and the host
  // carries the terminal's own background, so the dark interior still bleeds to
  // the pane edges — only the rows are pushed inward. box-sizing keeps the host
  // filling the container despite the padding. The FitAddon reads the host's
  // content-box size, so cols/rows already exclude this padding.
  host.style.boxSizing = 'border-box'
  host.style.padding = '6px 8px'
  host.style.background = VSCODE_DARK_THEME.background as string

  const text = useTerminalTextStore.getState().text
  host.style.fontFeatureSettings = ligatureFeatureSettings(text.ligatures)

  const term = new Terminal({
    cursorBlink: true,
    fontFamily: text.fontFamily,
    fontSize: text.fontSize,
    lineHeight: text.lineHeight,
    scrollback: 5000,
    theme: VSCODE_DARK_THEME
  })
  const fit = new FitAddon()
  term.loadAddon(fit)
  // Forward the terminal title straight from the program running in the pty.
  // xterm parses the standard OSC 0/2 title escape sequences ("ESC ] 0 ; text
  // BEL") natively and fires onTitleChange — the same mechanism VS Code uses to
  // title its terminal tabs. Shells and modern agents (Claude Code) emit these,
  // so the pane header reflects "what this terminal is doing" with no agent
  // cooperation. Keyed by `id` (terminalId) so it survives remounts; an empty
  // title (some programs emit one to clear) reverts the header to its fallback.
  // Cap defensively — the header truncates visually, but a runaway title
  // shouldn't bloat the store.
  term.onTitleChange((title) => {
    const trimmed = title.replace(/\s+/g, ' ').trim()
    const store = useTerminalTitleStore.getState()
    if (trimmed) store.setTitle(id, trimmed.slice(0, 120))
    else store.clearTitle(id)
  })
  // OSC 7 is how a shell reports its working directory ("ESC ] 7 ; file://host/path
  // BEL") — the same mechanism VS Code, kitty and WezTerm use. Handled here rather
  // than in Rust because the value is only consumed on this side, and because it
  // keeps the hot read_loop streaming path untouched. Returning true marks the
  // sequence handled so xterm doesn't pass it on.
  term.parser.registerOscHandler(7, (data) => {
    const dir = parseFileUrl(data)
    const entry = entries.get(id)
    if (dir && entry) entry.cwd = dir
    return true
  })
  // Fan out to the broadcast group when this terminal is an armed member;
  // otherwise this is the only target ([id]), so behaviour is unchanged. onData
  // fires only for the terminal the user is typing in, so `id` is always the
  // source of `data` — but every target pty in `targets` receives the SAME
  // characters and ends up holding the SAME half-typed line, so the War Room
  // typing signal has to be recorded per target, not just for the source.
  // Recorded here (rather than from a listener on each target) because this is
  // the one hook that sees genuine user input for the whole fan-out group: War
  // Room deliveries go through `writeTerminal` directly and bypass `onData`,
  // so a nudge can never mark its own recipient as "user typing". Paste
  // (term.paste) flows through onData too, so it fans out — and gets recorded
  // — for free. Each target pty echoes independently: this is real broadcast,
  // not a text mirror.
  const sendInput = (data: string): void => {
    const state = useAppStore.getState()
    const ws = selectWorkspaceByTerminalId(state, id)
    const targets = ws
      ? resolveBroadcastTargets(ws.layout, ws.broadcastActive, ws.broadcastLeafIds, id)
      : [id]
    for (const target of targets) {
      useTerminalTypingStore.getState().noteInput(target, data)
      void writeTerminal(target, data)
    }
  }
  term.onData(sendInput)

  // Hoisted above the input adapter below (which needs them for
  // `isThirdLevelShiftKey`) as well as the clipboard/link handling further
  // down (which already needed `isMac`) — one platform read per terminal,
  // not one per keystroke.
  const isMac = isMacPlatform()
  const isWindows = isWindowsPlatform()

  // Text input the macOS way. A native terminal is handed whole strings by
  // NSTextInputClient; in a webview the same insertion only shows up as a
  // change to xterm's hidden textarea, and xterm's keyboard path carries just a
  // subset of those through. So the textarea is treated as the input client:
  // `committed` is what this pane has already written to the pty for the
  // current segment, and every change to the textarea is reconciled against it.
  //
  // Listeners sit on `host`, not on the textarea, because xterm's own capture
  // listeners are registered first and same-element capture order is
  // registration order — only an ancestor can see the event first.
  let committed = ''

  // Whether xterm's own path — `_keyDown`'s cancel-and-send, or `_keyPress`'s
  // single-char fallback for a key `_keyDown` leaves alone (Space;
  // Option/AltGr chords, whose own `_isThirdLevelShift` check makes
  // `_keyDown` bail before it ever reaches `cancel()`) — already wrote this
  // keystroke's character, so a resulting `input` event must be swallowed
  // rather than diffed and sent a second time. See `nextSuppressState`'s own
  // doc comment in terminal-input-client.ts for the full event-ordering
  // argument (also the incident history: this is the second implementation
  // of this idea, the first got the ordering wrong).
  let suppressState: SuppressState = 'idle'

  // True from `compositionstart` until the deferred read in `compositionend`
  // (below) resolves. Spans every point at which this layer must not mutate
  // the textarea or trust `term.textarea.value` — whether from a keydown's
  // `resetSegment`, an `input` event's diff, or an external trigger like
  // paste/respawn/retry racing in from entirely outside any event.
  let compositionOpen = false

  // Discards the open segment without touching the textarea. The only caller
  // is compositionstart (see below) — composition is xterm's alone, and this
  // layer may not write to the textarea while one is active.
  const resetSegmentBaseline = (): void => {
    committed = ''
  }

  // Restarts the segment AND clears the textarea. For most keys left to xterm
  // it cancels its own default handling entirely, so the textarea never
  // actually changes and this clear is just bookkeeping ahead of that — but
  // Space and Option/AltGr chords are exceptions (see `isOrdinaryCharKey` and
  // `isThirdLevelShiftKey`), and diffing against stale text there would send
  // corrections for text the shell no longer has. Also reused as
  // `Entry.resetInputSegment` (assigned below) for paste/respawn/retry, which
  // move the pty line from entirely outside this textarea's `input` event and
  // so need the same invalidation — including, for a file drop mid-
  // composition, the same "never touch the textarea while composing" rule
  // `compositionOpen` enforces below, since none of those three callers have
  // any way to know a composition happens to be open when they're called.
  const resetSegment = (): void => {
    resetSegmentBaseline()
    if (!compositionOpen && term.textarea) term.textarea.value = ''
  }

  host.addEventListener(
    'keydown',
    (event) => {
      // Default assumption for every keydown: it doesn't own the write, so
      // any stale arm left over from an earlier, unrelated keystroke (one
      // xterm cancelled with no `input` AND whose `keyup` hasn't fired yet —
      // e.g. still being held down) does not leak into this one. Overwritten
      // below, once, only in the one branch that can actually arm it.
      suppressState = nextSuppressState(suppressState, { type: 'keydown', owns: false })

      if (ownsKeydown(event)) {
        // Keep it away from CompositionHelper, whose own textarea diff would
        // send a second, wrong copy of everything below.
        event.stopPropagation()
        return
      }
      if (event.isComposing) return
      if (ownsMultiCharKey(event)) {
        // XKey's CGEvent mode / macOS Telex's tone application: a correction
        // arriving as one multi-character keydown. `committed` must survive
        // this event untouched — the browser's default text insertion is
        // about to update the textarea, and the `input` listener below needs
        // the pre-correction baseline to compute real deletions. (This used
        // to be `ime-input.ts`'s job: it sent this text directly with zero
        // deletions, which only happened to be correct for XKey, whose own
        // real Backspace keydowns do the deleting separately — and was wrong
        // for macOS Telex, producing "banạn" instead of "bạn". See
        // `ownsMultiCharKey`, and the `attachCustomKeyEventHandler` callback
        // further below, which stops xterm's own truncated echo of this same
        // event at the `keypress` stage.)
        return
      }
      if (breaksSegment(event)) {
        resetSegment()
        // Built explicitly, not spread: KeyboardEvent's fields are inherited
        // prototype getters, not own properties, so `{ ...event }` silently
        // drops them all.
        const shiftEvent = {
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          keyCode: event.keyCode,
          altGraph: event.getModifierState('AltGraph')
        }
        const owns =
          isOrdinaryCharKey(event) ||
          isThirdLevelShiftKey(shiftEvent, {
            isMac,
            isWindows,
            // This app never sets `macOptionIsMeta` in `new Terminal({...})`
            // above, so `term.options.macOptionIsMeta` always reads back
            // `false` today — read live rather than assumed so this can't
            // silently drift out of sync if that option is ever turned on.
            macOptionIsMeta: term.options.macOptionIsMeta ?? false
          })
        suppressState = nextSuppressState(suppressState, { type: 'keydown', owns })
      }
    },
    true
  )

  // Ends an armed-but-unconsumed suppression: xterm cancelled the ordinary
  // letter's default (see above), so no `input` ever arrived to consume it,
  // and keyup is the one event guaranteed to fire strictly after `input` for
  // the SAME keystroke if one did occur — see `nextSuppressState`'s doc
  // comment for why this, and not a timer, is what closes the window.
  host.addEventListener(
    'keyup',
    () => {
      suppressState = nextSuppressState(suppressState, { type: 'keyup' })
    },
    true
  )

  host.addEventListener(
    'input',
    (event) => {
      const inputEvent = event as InputEvent
      if (!ownsInputEvent(inputEvent)) return
      event.stopPropagation()

      if (compositionOpen) {
        // A leftover of the composition that just ended: xterm's own
        // deferred send (see the `compositionend` listener below) is about
        // to handle the real commit on the same tick this resolves on.
        // Diffing this now would read `committed` before that tick sets it.
        return
      }

      if (shouldSuppressInput(suppressState)) {
        // xterm's own keydown/keypress path already sent this character
        // correctly (see `isOrdinaryCharKey` / `isThirdLevelShiftKey`) — this
        // `input` event is just the browser's default text insertion running
        // alongside it, which nothing cancelled. Swallow it rather than
        // diffing a second, possibly corrupted copy: WebKit substitutes
        // U+00A0 NBSP for a bare space bar press in the textarea, and the pty
        // must get the real byte xterm already sent, not a second, wrong one.
        suppressState = nextSuppressState(suppressState, { type: 'input' })
        resetSegment()
        return
      }

      const next = term.textarea?.value ?? ''
      const data = encodeEdit(diffToEdit(committed, next))
      committed = next
      if (data) sendInput(data)
    },
    true
  )

  // xterm's own `_handleTextAreaBlur` clears the textarea on focus loss
  // (`this.textarea.value = ""`), same as this layer's `resetSegment` does —
  // so mirroring it here on `host` (a click into another pane's header, a
  // workspace switch, a split collapse that re-appends `host` to a new
  // parent) introduces no new risk, only closes a gap: without it `committed`
  // keeps describing a segment the textarea has already lost, and the first
  // keystroke after refocusing is diffed against it. Concretely: type "bạn",
  // click away and back, type "m" — `diffToEdit('bạn', 'm')` would erase all
  // three characters the shell already has before "m" ever lands.
  host.addEventListener(
    'blur',
    () => {
      // If a composition were somehow still open here (WKWebView losing
      // focus without ever firing compositionend — the deferred tick this
      // flag guards would then never resolve), leaving `compositionOpen`
      // true would permanently disable this pane's diff path: every future
      // owned `input` event would be treated as a leftover composition
      // forever. Focus loss ends the segment unconditionally either way,
      // matching xterm's own unconditional `_handleTextAreaBlur`, so clear it
      // before `resetSegment` runs (letting that call perform its full
      // textarea clear too, not just the composition-safe baseline reset).
      compositionOpen = false
      resetSegment()
      // Also close out an armed-but-unconsumed suppression, the same way a
      // `keyup` would: hold a letter down (armed; xterm cancels its keydown,
      // so no `input` follows), mouse-click into another pane before
      // releasing the key, and the keyup fires on the newly focused element
      // — this host never sees it, so `suppressState` would otherwise stay
      // `armed` until whatever keydown happens next. In between, Dictation
      // or the Emoji & Symbols picker used right after clicking back in
      // would have its `insertText` wrongly swallowed. Blur is not a keyup,
      // but it ends the segment the same way, so it drives the same
      // transition.
      suppressState = nextSuppressState(suppressState, { type: 'keyup' })
    },
    true
  )

  // Composition belongs to xterm end to end — including the textarea itself.
  // xterm's own compositionstart/update/end listeners are bound WITHOUT
  // capture (bubble phase; see CompositionHelper), so this capture-phase
  // listener runs BEFORE `CompositionHelper.compositionstart()` reads
  // `_compositionPosition.start = textarea.value.length`. Writing to
  // `.value` here — even to clear it — changes what that read sees and is
  // exactly the kind of mutation-during-composition WebKit responds to by
  // aborting the composition outright. So only the baseline resets; the
  // textarea is left for xterm to read and drive.
  host.addEventListener(
    'compositionstart',
    () => {
      compositionOpen = true
      resetSegmentBaseline()
    },
    true
  )
  host.addEventListener(
    'compositionend',
    () => {
      // xterm's own CompositionHelper explicitly refuses to read the textarea
      // synchronously here — its comment: composition events fire before the
      // textarea changes on most browsers — and defers the read (and its own
      // send) to `setTimeout(…, 0)`. Reading `term.textarea.value` right now
      // would risk capturing a stale, pre-commit value on exactly the same
      // browsers that comment is about; mirror xterm's own timing rather than
      // guess at something better. `compositionOpen` stays true until this
      // tick resolves, so the `input` listener above ignores any leftover
      // `input` event xterm's own deferred send is about to also handle —
      // without that, WKWebView delivering the post-commit `input` as
      // `inputType: "insertText"` with `isComposing: false` would let this
      // layer diff a stale `committed` and send the composed text a second
      // time, alongside xterm's own pending send. CJK cannot be verified on
      // this machine, so matching xterm's own mechanism exactly is the goal,
      // not a bespoke alternative.
      setTimeout(() => {
        compositionOpen = false
        committed = term.textarea?.value ?? ''
      }, 0)
    },
    true
  )

  // Match VS Code: Ctrl+C copies the selection (Cmd+C on mac), Ctrl+V pastes.
  // Returning false stops xterm from forwarding the key to the pty, but does
  // NOT cancel the browser default action: without preventDefault() the
  // webview still fires a native `paste` event into xterm's hidden textarea,
  // which xterm pastes into the pty a second time (double-paste). So every
  // handled action also calls preventDefault(). Ctrl+C with no selection
  // returns true so the shell still receives SIGINT.
  const linkDeps = { findAvailableEditor, openInEditor, revealInFileManager }

  // Record where each press began. xterm's Linkifier already refuses a mouseup on
  // a different link than the mousedown, so dragging AWAY is handled; what it
  // misses is a drag that selects text inside one link's own bounds.
  host.addEventListener('mousedown', (e) => {
    const entry = entries.get(id)
    if (entry) entry.lastMouseDown = { clientX: e.clientX, clientY: e.clientY }
  })

  /**
   * The single activation path for every link kind and every source (OSC 8,
   * WebLinksAddon, the path provider). URLs go to the OS default browser — the
   * in-app preview column stays reserved for the `browser.open_preview` MCP
   * tool, i.e. for pages an agent decides to show you, not for every link you
   * click. Paths need Cmd/Ctrl because launching an external editor takes OS
   * focus away from the app; a path never reaches the OS default opener, which
   * would make a misclick on a script execute it.
   */
  const followLink = (event: MouseEvent, kind: LinkKind, target: string): void => {
    const entry = entries.get(id)
    if (isDragNotClick(entry?.lastMouseDown, event)) return
    if (!shouldFollowLink(event, isMac, kind)) return

    if (kind === 'url') {
      openUrl(target).catch(console.warn)
      return
    }
    const { path, line, col } = parsePathSuffix(target)
    void resolvePathLink(getTerminalCwd(id) ?? '', path)
      .then((resolved) => {
        if (resolved) return openPathLocation(linkDeps, resolved, line, col)
      })
      .catch(console.warn)
  }

  // OSC 8 hyperlinks — what Claude Code emits since v2.1.x. Without a linkHandler
  // xterm's OscLinkProvider DROPS every non-http target (so file:// links never
  // appear at all) and sends http ones to a defaultActivate that calls confirm()
  // then window.open() — both wrong inside a Tauri webview. allowNonHttpProtocols
  // is what lets file:// through; classifyOscLink is the protection that permission
  // requires, refusing everything except http(s) and file.
  const linkHandler: ILinkHandler = {
    allowNonHttpProtocols: true,
    activate: (event, text) => {
      const classified = classifyOscLink(text)
      if (classified) followLink(event, classified.kind, classified.target)
    }
  }
  term.options.linkHandler = linkHandler

  // Bare http(s) URLs in plain text. Kept on WebLinksAddon (its regex is well
  // tested) but routed through followLink so every link source shares one
  // gesture gate and one destination — the OS default browser.
  term.loadAddon(new WebLinksAddon((event, uri) => followLink(event, 'url', uri)))

  // Plain-text file paths — stack traces, tsc/eslint/pytest output. Async because
  // each candidate has to be checked against the filesystem in Rust before it is
  // allowed to become a link; a candidate that doesn't resolve is dropped, so
  // prose that merely looks path-shaped never underlines itself.
  term.registerLinkProvider({
    provideLinks(y, callback) {
      const lineText = term.buffer.active.getLine(y - 1)?.translateToString(true)
      if (!lineText) return callback(undefined)
      const candidates = detectPathCandidates(lineText)
      if (candidates.length === 0) return callback(undefined)

      const cwd = getTerminalCwd(id) ?? ''
      void Promise.all(
        candidates.map(async (c) => {
          const { path } = parsePathSuffix(c.text)
          const resolved = await resolvePathLink(cwd, path).catch(() => null)
          if (!resolved) return null
          const link: ILink = {
            // xterm buffer ranges are 1-based and inclusive; candidate indices
            // are 0-based with an exclusive end.
            range: { start: { x: c.start + 1, y }, end: { x: c.end, y } },
            text: c.text,
            activate: (event, text) => followLink(event, 'path', text)
          }
          return link
        })
      )
        .then((links) => callback(links.filter((l): l is ILink => l !== null)))
        .catch(() => callback(undefined))
    }
  })
  term.attachCustomKeyEventHandler((event) => {
    // xterm calls this same callback from `_keyDown`, `_keyPress` AND `_keyUp`
    // — not just keydown. For a multi-character correction (`ownsMultiCharKey`,
    // shared with the `keydown` listener above) the keydown stage needs no
    // help: `evaluateKeyboardEvent` has no branch for `key.length > 1`, so
    // `_keyDown` already leaves it alone. But because `_keyDown` never handled
    // it, `_keyPress` runs next and falls back to
    // `String.fromCharCode(ev.charCode)` — a single code unit — which would
    // truncate the correction to its first character and send that as an
    // unwanted extra write. Returning `false` here for the matching `keypress`
    // event stops `_keyPress` before it sends (it bails on exactly this check,
    // before it calls `cancel()`) WITHOUT calling `preventDefault()` — so the
    // browser's default text insertion, and the `input` event the adapter
    // above diffs, still happens. That `input` event — not this handler — is
    // this layer's one and only writer for these corrections.
    if (event.type === 'keypress' && ownsMultiCharKey(event)) return false

    const action = decideClipboardAction(event, { hasSelection: term.hasSelection(), isMac })
    if (action === 'copy') {
      event.preventDefault()
      const selection = term.getSelection()
      if (selection) writeClipboard(selection).catch(console.warn)
      return false
    }
    if (action === 'paste') {
      event.preventDefault()
      // Async read; fire-and-forget and suppress xterm's default handling now.
      readClipboard()
        .then((text) => {
          if (text) term.paste(text)
        })
        .catch(console.warn)
      return false
    }
    return true
  })

  const session = new TerminalSession(
    id,
    {
      write: (data) => {
        // Every decoded pty chunk is one activity tick: the pane is "working"
        // while bytes flow (including agent spinner redraws) and goes idle after
        // ACTIVITY_IDLE_MS of silence.
        activityTracker.notify(id)
        term.write(data)
      }
    },
    { createTerminal, killTerminal }
  )

  const entry: Entry = {
    term,
    fit,
    host,
    session,
    config: {},
    cwd: '',
    opened: false,
    resetInputSegment: resetSegment
  }
  entries.set(id, entry)
  return entry
}

/**
 * Mount the terminal into `container`: move its host there, (lazily) open xterm,
 * keep it sized to the container, and spawn the pty if it hasn't been already.
 * Safe to call repeatedly — remounts re-attach the same live terminal.
 */
export function attachTerminal(id: string, container: HTMLElement, config: AttachConfig): void {
  const entry = getOrCreate(id)
  entry.config = {
    ...config,
    // shellId is locked at first attach: subsequent remounts (e.g. when a sibling
    // pane closes and the split tree collapses) must NOT swap the retry shell
    // out from under the user.
    shellId: entry.config.shellId ?? config.shellId
  }
  // Seed the link-resolution cwd from the spawn config. OSC 7 overwrites this as
  // soon as the shell draws its first prompt; until then (and forever, in shells
  // that don't report it) the spawn directory is the best answer available.
  // `||` not `??` so an earlier OSC 7 value isn't clobbered by a later remount.
  entry.cwd = entry.cwd || config.cwd || ''
  container.appendChild(entry.host)

  if (!entry.opened) {
    entry.term.open(entry.host)
    loadWebglRenderer(entry.term)
    entry.opened = true
  }
  safeFit(entry)

  entry.observer?.disconnect()
  entry.observer = new ResizeObserver(() => {
    if (safeFit(entry)) resizeTerminal(id, entry.term.cols, entry.term.rows)
  })
  entry.observer.observe(container)

  entry.session.start({ ...entry.config, cols: entry.term.cols, rows: entry.term.rows })
}

/** Detach the terminal from the DOM without killing the pty (e.g. on remount). */
export function detachTerminal(id: string): void {
  const entry = entries.get(id)
  if (!entry) return
  entry.observer?.disconnect()
  entry.observer = undefined
  entry.host.remove()
}

/** Permanently destroy a terminal: kill the pty, dispose xterm, drop the entry. */
export function disposeTerminal(id: string): void {
  const entry = entries.get(id)
  if (!entry) return
  entry.observer?.disconnect()
  entry.session.dispose()
  entry.term.dispose()
  entry.host.remove()
  entries.delete(id)
  // Drop the pending idle timer WITHOUT firing its callback, then remove the
  // store entry — order matters so the timer can't re-add a cleared id.
  activityTracker.cancel(id)
  useTerminalActivityStore.getState().clear(id)
  useTerminalTypingStore.getState().clearTyping(id)
}

/** Dispose every terminal whose id is not in `keep` (its leaf was removed). */
export function disposeOrphanTerminals(keep: Set<string>): void {
  for (const id of [...entries.keys()]) {
    if (!keep.has(id)) disposeTerminal(id)
  }
}

export function focusTerminal(id: string): void {
  entries.get(id)?.term.focus()
}

/**
 * Type `text` into a terminal as if the user pasted it. Routed through
 * `term.paste` rather than `writeTerminal` on purpose: paste flows through
 * `onData`, so it picks up the broadcast fan-out above for free instead of
 * duplicating that rule here. Also gets bracketed-paste framing, so a shell
 * treats the text as literal input and never runs it on its own.
 *
 * Resets the IME input segment first (see `Entry.resetInputSegment`):
 * `term.paste` writes straight to the pty and clears xterm's textarea itself,
 * which would otherwise leave the segment's `committed` baseline describing
 * text the pty no longer has.
 * No-op when the terminal is not live.
 */
export function pasteIntoTerminal(id: string, text: string): void {
  const entry = entries.get(id)
  if (!entry) return
  entry.resetInputSegment()
  entry.term.paste(text)
}

/**
 * Deliver a War Room payload's BODY to one pty: bracketed-paste framing when
 * the foreground app enabled it (agent CLIs do — the text arrives as one
 * literal block). Deliberately NOT routed through `term.paste`/onData like
 * pasteIntoTerminal: that path fans out to an armed broadcast group, and a
 * room delivery must reach exactly its recipient.
 *
 * Writes ONLY the body — no trailing Enter. Agent TUIs (Claude Code
 * included) deliberately ignore an Enter that arrives in the same stdin
 * flush as a bracketed paste — that's the guard that stops a pasted body's
 * own embedded newlines from self-submitting the paste early — so a `\r`
 * glued directly onto the paste's closing marker is swallowed by that guard
 * and the prompt is left sitting, unsubmitted, in the composer. The Enter
 * must arrive as its own later write instead: see `submitTerminalPrompt`,
 * which the War Room delivery scheduler calls after a delay.
 */
export function deliverPromptToTerminal(id: string, text: string): void {
  const entry = entries.get(id)
  if (!entry) return
  entry.resetInputSegment()
  // Parity with term.paste's own CRLF normalization: terminals expect CR for line breaks.
  const normalized = text.replace(/\r?\n/g, '\r')
  const body = entry.term.modes.bracketedPasteMode ? `\x1b[200~${normalized}\x1b[201~` : normalized
  void writeTerminal(id, body)
}

/**
 * Submit a War Room prompt previously written by `deliverPromptToTerminal`:
 * writes just Enter, as its own stdin flush arriving later so the TUI treats
 * it as a real keypress rather than part of the paste (see that function's
 * doc comment for why a glued CR gets eaten). No-op for an unknown or
 * since-disposed terminal, same guard as every other entry point here. No
 * `resetInputSegment` call — nothing has been typed into this pane's
 * textarea between the body write and this call for that baseline to need
 * invalidating.
 */
export function submitTerminalPrompt(id: string): void {
  const entry = entries.get(id)
  if (!entry) return
  void writeTerminal(id, '\r')
}

/** Re-spawn the pty after exit/error, clearing the screen first. */
export function retryTerminal(id: string): void {
  const entry = entries.get(id)
  if (!entry) return
  entry.term.reset()
  // The pty this segment's committed baseline described is gone.
  entry.resetInputSegment()
  safeFit(entry)
  entry.session.retry({ ...entry.config, cols: entry.term.cols, rows: entry.term.rows })
}

/**
 * Re-spawn the pty with a new config (agent command / cwd / shell). Unlike
 * `attachTerminal`, this is a deliberate user action, so it DOES override the
 * shellId that attach locks in. Clears the screen, then restarts the pty.
 */
export function respawnTerminal(id: string, config: AttachConfig): void {
  const entry = entries.get(id)
  if (!entry) return
  entry.config = { ...entry.config, ...config }
  entry.term.reset()
  // The pty this segment's committed baseline described is gone.
  entry.resetInputSegment()
  safeFit(entry)
  entry.session.respawn({ ...entry.config, cols: entry.term.cols, rows: entry.term.rows })
}

/**
 * Resolve once a terminal has finished relocating (respawn: old pty killed, new
 * pty up). The session emits `connecting` then, only after the old pty exits,
 * `running` — so a settled state after a `connecting` means the OLD pty (and its
 * Job-Object child tree) is dead and any cwd it held is released. Used before
 * deleting a worktree so the delete never races a live pty (which on Windows
 * guts the directory then fails rmdir, leaving a husk). A timeout backstop keeps
 * a stuck pane from hanging the caller.
 */
export function awaitTerminalRelocated(id: string, timeoutMs = 4000): Promise<void> {
  const entry = entries.get(id)
  if (!entry) return Promise.resolve()
  return new Promise((resolve) => {
    let sawConnecting = entry.session.getStatus().kind === 'connecting'
    let done = false
    const finish = (): void => {
      if (done) return
      done = true
      unsub()
      clearTimeout(timer)
      resolve()
    }
    const unsub = entry.session.subscribe(() => {
      const k = entry.session.getStatus().kind
      if (k === 'connecting') sawConnecting = true
      else if (sawConnecting) finish()
    })
    const timer = setTimeout(finish, timeoutMs)
  })
}

export function getTerminalStatus(id: string): TerminalStatus {
  return entries.get(id)?.session.getStatus() ?? NO_STATUS
}

/** The terminal's live cwd — OSC 7 if the shell reports it, else the spawn cwd. */
export function getTerminalCwd(id: string): string | undefined {
  return entries.get(id)?.cwd || undefined
}

export function subscribeTerminalStatus(id: string, listener: () => void): () => void {
  return entries.get(id)?.session.subscribe(listener) ?? (() => {})
}

/**
 * Push the latest text prefs onto every live terminal, then reflow so cols/rows
 * follow the new metrics. Font family/size/line-height set xterm options
 * directly; ligatures are a CSS feature on the host element (xterm's DOM
 * renderer inherits it into the rows).
 */
export function applyTerminalText(pref: TerminalTextPref): void {
  for (const [id, entry] of entries) {
    entry.term.options.fontFamily = pref.fontFamily
    entry.term.options.fontSize = pref.fontSize
    entry.term.options.lineHeight = pref.lineHeight
    entry.host.style.fontFeatureSettings = ligatureFeatureSettings(pref.ligatures)
    if (safeFit(entry)) resizeTerminal(id, entry.term.cols, entry.term.rows)
  }
}

// Push text-preference changes to every live terminal. Subscribing here (rather
// than the store importing the registry) keeps the dependency one-directional.
useTerminalTextStore.subscribe((state) => applyTerminalText(state.text))
