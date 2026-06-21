import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'
import { createTerminal, killTerminal, resizeTerminal, writeTerminal } from '@/tauri/terminal'
import { TerminalSession, type TerminalStatus } from '@/lib/terminal-session'
import { useTerminalTextStore } from '@/store/terminal-text-store'
import { resolveBroadcastTargets } from '@/lib/broadcast-input'
import { useAppStore, selectWorkspaceByTerminalId } from '@/store/app-store'
import type { TerminalTextPref } from '@/lib/terminal-text'
import { decideClipboardAction, isMacPlatform } from '@/lib/terminal-clipboard'
import { readClipboard, writeClipboard } from '@/tauri/clipboard'
import { shouldFollowLink } from '@/lib/terminal-links'
import { openUrl } from '@/tauri/opener'

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
}

interface Entry {
  term: Terminal
  fit: FitAddon
  /** Stable host the xterm renders into; moved between pane containers. */
  host: HTMLDivElement
  session: TerminalSession
  config: AttachConfig
  opened: boolean
  observer?: ResizeObserver
}

/** Live terminals keyed by terminalId, owned outside React's render tree. */
const entries = new Map<string, Entry>()

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
  // Fan out to the broadcast group when this terminal is an armed member;
  // otherwise this is the only target, so behaviour is unchanged. onData fires
  // only for the terminal the user is typing in, so `id` is the source. Paste
  // (term.paste) flows through onData too, so it fans out for free. Each target
  // pty echoes independently — this is real broadcast, not a text mirror.
  term.onData((data) => {
    const state = useAppStore.getState()
    const ws = selectWorkspaceByTerminalId(state, id)
    const targets = ws
      ? resolveBroadcastTargets(ws.layout, ws.broadcastActive, ws.broadcastLeafIds, id)
      : [id]
    for (const target of targets) void writeTerminal(target, data)
  })

  // Match VS Code: Ctrl+C copies the selection (Cmd+C on mac), Ctrl+V pastes.
  // Returning false stops xterm from forwarding the key to the pty, but does
  // NOT cancel the browser default action: without preventDefault() the
  // webview still fires a native `paste` event into xterm's hidden textarea,
  // which xterm pastes into the pty a second time (double-paste). So every
  // handled action also calls preventDefault(). Ctrl+C with no selection
  // returns true so the shell still receives SIGINT.
  const isMac = isMacPlatform()
  // Make http/https URLs clickable. Mirror VS Code: only follow on Cmd+click
  // (mac) / Ctrl+click (win/linux) so a plain click still selects text. Route to
  // the OS default browser via the opener plugin; WebLinksAddon's regex only
  // matches well-formed http(s), so openUrl always gets a valid URL.
  term.loadAddon(
    new WebLinksAddon((event, uri) => {
      if (!shouldFollowLink(event, isMac)) return
      openUrl(uri).catch(console.warn)
    })
  )
  term.attachCustomKeyEventHandler((event) => {
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
    { write: (data) => term.write(data) },
    { createTerminal, killTerminal }
  )

  const entry: Entry = { term, fit, host, session, config: {}, opened: false }
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

/** Re-spawn the pty after exit/error, clearing the screen first. */
export function retryTerminal(id: string): void {
  const entry = entries.get(id)
  if (!entry) return
  entry.term.reset()
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
  safeFit(entry)
  entry.session.respawn({ ...entry.config, cols: entry.term.cols, rows: entry.term.rows })
}

export function getTerminalStatus(id: string): TerminalStatus {
  return entries.get(id)?.session.getStatus() ?? NO_STATUS
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
