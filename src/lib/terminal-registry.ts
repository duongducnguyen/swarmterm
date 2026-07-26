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
import { imeTextFromKeyEvent } from '@/lib/ime-input'
import {
  breaksSegment,
  diffToEdit,
  encodeEdit,
  ownsInputEvent,
  ownsKeydown
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
  // otherwise this is the only target, so behaviour is unchanged. onData fires
  // only for the terminal the user is typing in, so `id` is the source. Paste
  // (term.paste) flows through onData too, so it fans out for free. Each target
  // pty echoes independently — this is real broadcast, not a text mirror.
  const sendInput = (data: string): void => {
    const state = useAppStore.getState()
    const ws = selectWorkspaceByTerminalId(state, id)
    const targets = ws
      ? resolveBroadcastTargets(ws.layout, ws.broadcastActive, ws.broadcastLeafIds, id)
      : [id]
    for (const target of targets) void writeTerminal(target, data)
  }
  term.onData(sendInput)

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

  // Discards the open segment without touching the textarea. The only caller
  // is compositionstart (see below) — composition is xterm's alone, and this
  // layer may not write to the textarea while one is active.
  const resetSegmentBaseline = (): void => {
    committed = ''
  }

  // Restarts the segment AND clears the textarea. Clearing matters here: xterm
  // cancels every key it handles, so after (say) a real Backspace the pty line
  // has moved but the textarea still holds the old word, and diffing against
  // that would send corrections for text the shell no longer has. Also reused
  // as `Entry.resetInputSegment` (assigned below) for paste/respawn/retry,
  // which move the pty line from entirely outside this textarea's `input`
  // event and so need the same invalidation. Never call this from a
  // composition handler — see `resetSegmentBaseline`.
  const resetSegment = (): void => {
    resetSegmentBaseline()
    if (term.textarea) term.textarea.value = ''
  }

  host.addEventListener(
    'keydown',
    (event) => {
      if (ownsKeydown(event)) {
        // Keep it away from CompositionHelper, whose own textarea diff would
        // send a second, wrong copy of everything below.
        event.stopPropagation()
        return
      }
      if (!event.isComposing && breaksSegment(event)) resetSegment()
    },
    true
  )

  host.addEventListener(
    'input',
    (event) => {
      const inputEvent = event as InputEvent
      if (!ownsInputEvent(inputEvent)) return
      event.stopPropagation()

      const next = term.textarea?.value ?? ''
      const data = encodeEdit(diffToEdit(committed, next))
      committed = next
      if (data) sendInput(data)
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
  // textarea is left for xterm to read and drive. The same "adopt what xterm
  // leaves rather than overwrite it" argument the compositionend handler below
  // already makes applies here too — it just applies one event earlier.
  host.addEventListener('compositionstart', () => resetSegmentBaseline(), true)
  host.addEventListener(
    'compositionend',
    () => {
      committed = term.textarea?.value ?? ''
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
  const isMac = isMacPlatform()
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
    // A bộ gõ re-inserting a corrected word delivers several characters in one
    // keydown; xterm's keypress path can only carry the first (see ime-input.ts).
    // Send the whole string ourselves and preventDefault() so the browser never
    // fires the keypress/input events that would re-send a truncated copy.
    if (event.type === 'keydown') {
      const text = imeTextFromKeyEvent(event)
      if (text !== null) {
        event.preventDefault()
        sendInput(text)
        return false
      }
    }
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
