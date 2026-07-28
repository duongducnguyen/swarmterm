/**
 * The user's seat at the table: send probes, broadcasts and executes without
 * leaving the panel. Validation mirrors the server (war-room-composer.ts) so
 * the button can explain itself before a round trip; the server's own error
 * is what lands in the error line if they ever disagree.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Send, Zap } from 'lucide-react'
import { useWarRoomStore } from '@/store/war-room-store'
import { useAppStore, selectFocusedTerminalId } from '@/store/app-store'
import { focusTerminal } from '@/lib/terminal-registry'
import {
  EVERYONE,
  composerTargets,
  reconcileTarget,
  validateComposer
} from '@/lib/war-room-composer'
import { warRoomModeratorSend, type WarRoomMode } from '@/tauri/warroom'
import { cn } from '@/lib/utils'

const MAX_ROWS = 6

export function ModeratorComposer(): ReactElement {
  const members = useWarRoomStore((s) => s.members)
  const [text, setText] = useState('')
  const [mode, setMode] = useState<WarRoomMode>('probe')
  const [targetId, setTargetId] = useState<string>(EVERYONE)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  // Membership and mode both invalidate a selection; reconciling in an effect
  // (rather than at render) keeps the select a controlled component with a
  // value that always exists in its option list.
  useEffect(() => {
    setTargetId((current) => reconcileTarget(current, members, mode))
  }, [members, mode])

  const targets = composerTargets(members, mode)
  const validation = validateComposer({ text, targetId, mode, members })
  const canSend = validation.ok && !sending

  function grow(): void {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    const max = MAX_ROWS * 18
    el.style.height = `${Math.min(el.scrollHeight, max)}px`
  }

  async function send(): Promise<void> {
    if (!validation.ok) {
      setError(validation.reason)
      return
    }
    setSending(true)
    try {
      await warRoomModeratorSend({
        to: targetId === EVERYONE ? null : targetId,
        content: text.trim(),
        mode
      })
      setText('')
      setError(null)
      // The textarea shrinks back only if we re-measure after the value clears.
      requestAnimationFrame(grow)
    } catch (e) {
      setError(String(e))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="shrink-0 border-t border-border p-1.5">
      <div className="mb-1 flex items-center gap-1">
        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="min-w-0 flex-1 truncate rounded border border-border bg-card px-1.5 py-0.5 text-[11px] text-foreground"
          aria-label="Send to"
        >
          {targets.map((t) => (
            <option key={t.id} value={t.id} disabled={t.disabled !== null} title={t.disabled ?? undefined}>
              {t.label}
              {t.disabled !== null ? ' (unavailable)' : ''}
            </option>
          ))}
        </select>
        <button
          onClick={() => setMode((m) => (m === 'probe' ? 'execute' : 'probe'))}
          title={
            mode === 'probe'
              ? 'Probe: the message goes to the peer’s inbox and nudges them.'
              : 'Execute: the text is pasted into one agent’s terminal and run as a prompt.'
          }
          className={cn(
            'flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors',
            mode === 'execute'
              ? 'bg-[#f97316]/15 text-[#f97316]'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          )}
        >
          {mode === 'execute' ? <Zap className="h-3 w-3" /> : <Send className="h-3 w-3" />}
          {mode === 'execute' ? 'Execute' : 'Probe'}
        </button>
      </div>

      <textarea
        ref={areaRef}
        rows={1}
        value={text}
        placeholder={
          members.some((m) => m.connected)
            ? mode === 'execute'
              ? 'Prompt to run in that agent’s terminal…'
              : 'Message the room as Moderator…'
            : 'No connected agents yet — drag a pane in and let its agent connect.'
        }
        onChange={(e) => {
          setText(e.target.value)
          setError(null)
          grow()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void send()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            // Hand the keyboard back to the terminal — the right panel owns
            // focus while it has it, so nothing else will do this for us.
            e.currentTarget.blur()
            const id = selectFocusedTerminalId(useAppStore.getState())
            if (id !== undefined) focusTerminal(id)
          }
        }}
        className={cn(
          'w-full resize-none rounded border bg-card px-2 py-1 text-xs text-foreground outline-none placeholder:text-muted-foreground',
          mode === 'execute' ? 'border-[#f97316]/50' : 'border-border focus:border-[#00b0f4]'
        )}
      />

      {error !== null && <div className="mt-1 text-[10px] text-[#ed4245]">{error}</div>}
      {error === null && !validation.ok && text.trim() !== '' && (
        <div className="mt-1 text-[10px] text-muted-foreground">{validation.reason}</div>
      )}
      <div className="mt-0.5 text-right text-[10px] text-muted-foreground">
        {canSend ? 'Enter to send · Shift+Enter for a new line' : ' '}
      </div>
    </div>
  )
}
