import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { createTerminal, killTerminal, resizeTerminal, writeTerminal } from '@/tauri/terminal'
import { TerminalSession, type TerminalStatus } from '@/lib/terminal-session'

export type { TerminalStatus }

/**
 * Windows Terminal's default "Campbell" scheme — the full 16-color ANSI palette
 * plus native background/foreground. Used verbatim (regardless of the app's
 * light/dark theme) so the terminal shows the same colors as a real shell.
 */
const CAMPBELL_THEME: ITheme = {
  background: '#0C0C0C',
  foreground: '#CCCCCC',
  cursor: '#FFFFFF',
  cursorAccent: '#0C0C0C',
  selectionBackground: 'rgba(255,255,255,0.3)',
  black: '#0C0C0C',
  brightBlack: '#767676',
  red: '#C50F1F',
  brightRed: '#E74856',
  green: '#13A10E',
  brightGreen: '#16C60C',
  yellow: '#C19C00',
  brightYellow: '#F9F1A5',
  blue: '#0037DA',
  brightBlue: '#3B78FF',
  magenta: '#881798',
  brightMagenta: '#B4009E',
  cyan: '#3A96DD',
  brightCyan: '#61D6D6',
  white: '#CCCCCC',
  brightWhite: '#F2F2F2'
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

  const term = new Terminal({
    cursorBlink: true,
    fontFamily: '"Cascadia Mono", "Consolas", "JetBrains Mono", monospace',
    fontSize: 13,
    scrollback: 5000,
    theme: CAMPBELL_THEME
  })
  const fit = new FitAddon()
  term.loadAddon(fit)
  term.loadAddon(new WebLinksAddon())
  term.onData((data) => void writeTerminal(id, data))

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
    // out from under the user. cwd / initialCommand are stable leaf props, so
    // overwriting them is a no-op anyway.
    shellId: entry.config.shellId ?? config.shellId
  }
  container.appendChild(entry.host)

  if (!entry.opened) {
    entry.term.open(entry.host)
    entry.opened = true
  }
  safeFit(entry)

  entry.observer?.disconnect()
  entry.observer = new ResizeObserver(() => {
    if (safeFit(entry)) resizeTerminal(id, entry.term.cols, entry.term.rows)
  })
  entry.observer.observe(container)

  entry.session.start({ ...config, cols: entry.term.cols, rows: entry.term.rows })
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

export function getTerminalStatus(id: string): TerminalStatus {
  return entries.get(id)?.session.getStatus() ?? NO_STATUS
}

export function subscribeTerminalStatus(id: string, listener: () => void): () => void {
  return entries.get(id)?.session.subscribe(listener) ?? (() => {})
}
