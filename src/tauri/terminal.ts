import { invoke, Channel } from '@tauri-apps/api/core'

/** Output streamed from a pty: decoded text, then a final exit. */
export type PtyOut =
  | { type: 'data'; payload: string }
  | { type: 'exit'; payload: { exitCode: number } }

export interface CreateTerminalOptions {
  cwd?: string
  shell?: string
  initialCommand?: string
  cols: number
  rows: number
}

export interface CreateTerminalResult {
  ok: boolean
  pid?: number
  shell?: string
  error?: string
}

/** Spawn a pty; `onOutput` receives every data chunk and the final exit. */
export function createTerminal(
  id: string,
  options: CreateTerminalOptions,
  onOutput: (msg: PtyOut) => void
): Promise<CreateTerminalResult> {
  const onData = new Channel<PtyOut>()
  onData.onmessage = onOutput
  return invoke<CreateTerminalResult>('create_terminal', { id, options, onData })
}

export const writeTerminal = (id: string, data: string): Promise<void> =>
  invoke('write_terminal', { id, data })

export const resizeTerminal = (id: string, cols: number, rows: number): Promise<void> =>
  invoke('resize_terminal', { id, cols, rows })

export const killTerminal = (id: string): Promise<void> => invoke('kill_terminal', { id })
