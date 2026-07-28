import { create } from 'zustand'
import { classifyInput } from '@/lib/terminal-typing'

/**
 * Per-terminal "the user is typing here" signal, keyed by terminalId. Runtime
 * state OUTSIDE the layout tree, exactly like terminal-activity-store (which
 * tracks pty OUTPUT — this one tracks user INPUT, and the War Room delivery
 * scheduler needs both: a pane can be output-idle and still mid-sentence).
 *
 * Written from `sendInput` in terminal-registry, the single place that sees
 * genuine user input. War Room deliveries write through `writeTerminal`
 * directly and never reach that hook, so a nudge can never mark its own
 * recipient as "the user is typing".
 */
export interface TerminalTypingStore {
  /** ms epoch of the last input of any kind, per terminal. */
  lastKeyAt: Record<string, number>
  /** True while a line has been typed and not yet submitted or abandoned. */
  dirty: Record<string, boolean>
  noteInput: (terminalId: string, data: string) => void
  /** "Done typing here" — used both by the Deliver-now buttons and by pane
   *  disposal, which want the same thing: drop this terminal's entries. */
  clearTyping: (terminalId: string) => void
}

export const useTerminalTypingStore = create<TerminalTypingStore>((set) => ({
  lastKeyAt: {},
  dirty: {},

  noteInput: (terminalId, data) =>
    set((s) => {
      const kind = classifyInput(data)
      const lastKeyAt = { ...s.lastKeyAt, [terminalId]: Date.now() }
      // Navigation moves the cursor without changing the line, so it refreshes
      // recency but must not clear a half-typed line.
      if (kind === 'nav') return { lastKeyAt }
      return { lastKeyAt, dirty: { ...s.dirty, [terminalId]: kind === 'edit' } }
    }),

  clearTyping: (terminalId) =>
    set((s) => {
      if (!(terminalId in s.dirty) && !(terminalId in s.lastKeyAt)) return s
      const dirty = { ...s.dirty }
      const lastKeyAt = { ...s.lastKeyAt }
      delete dirty[terminalId]
      delete lastKeyAt[terminalId]
      return { dirty, lastKeyAt }
    })
}))
