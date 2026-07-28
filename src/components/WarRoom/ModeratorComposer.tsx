/**
 * The user's seat at the table: send probes, broadcasts and executes without
 * leaving the panel. Validation mirrors the server (war-room-composer.ts) so
 * the control can explain itself before a round trip; the server's own error
 * is what lands in the error line if they ever disagree.
 *
 * Shaped as one box, not a stack of fields: the textarea sits on top and a
 * toolbar (target · mode · send) sits inside the same border beneath it, so
 * the whole thing reads as a composer rather than a form. The paper plane is
 * reserved for the send button — an earlier version put it on the mode
 * toggle, where it read as "click to send".
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { ChevronDown, SendHorizontal, Users, Zap } from 'lucide-react'
import { useWarRoomStore } from '@/store/war-room-store'
import { useAppStore, selectFocusedTerminalId } from '@/store/app-store'
import { focusTerminal } from '@/lib/terminal-registry'
import {
  EVERYONE,
  composerTargets,
  reconcileTarget,
  validateComposer
} from '@/lib/war-room-composer'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { warRoomModeratorSend, type WarRoomMode } from '@/tauri/warroom'
import { memberColor } from '@/lib/war-room-identity'
import { cn } from '@/lib/utils'

const MAX_ROWS = 6

const MODE_HINT: Record<WarRoomMode, string> = {
  probe: 'Probe — the message goes to the peer’s inbox and nudges them to read it.',
  execute: 'Execute — the text is pasted into one agent’s terminal and run as a prompt.'
}

export function ModeratorComposer(): ReactElement {
  const members = useWarRoomStore((s) => s.members)
  const [text, setText] = useState('')
  const [mode, setMode] = useState<WarRoomMode>('probe')
  const [targetId, setTargetId] = useState<string>(EVERYONE)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  // `sending` (state) drives the display; this ref is the actual send guard.
  // Native key-repeat on a held Enter can dispatch a second keydown before
  // React flushes the state update from the first, so a state read in the
  // handler can still see stale `false` — the ref is written synchronously
  // and can't be stale.
  const inFlightRef = useRef(false)

  // Membership and mode both invalidate a selection; reconciling in an effect
  // (rather than at render) keeps the trigger label and the menu in step.
  useEffect(() => {
    setTargetId((current) => reconcileTarget(current, members, mode))
  }, [members, mode])

  const targets = composerTargets(members, mode)
  const validation = validateComposer({ text, targetId, mode, members })
  const canSend = validation.ok && !sending
  const hasConnectedMember = members.some((m) => m.connected)

  // In execute mode reconcileTarget's last resort is EVERYONE (see its own doc
  // comment: deliberately invalid, so validateComposer reports the real reason
  // rather than this component inventing a recipient). composerTargets never
  // emits an EVERYONE row for execute, so the trigger needs its own fallback
  // label; the real reason still shows under the box.
  const selected = targets.find((t) => t.id === targetId)
  const targetLabel = selected?.label ?? (mode === 'execute' ? 'No eligible agent' : 'Everyone')
  const isBroadcast = targetId === EVERYONE

  function grow(): void {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    const max = MAX_ROWS * 18
    el.style.height = `${Math.min(el.scrollHeight, max)}px`
  }

  async function send(): Promise<void> {
    if (inFlightRef.current) return
    if (!validation.ok) {
      setError(validation.reason)
      return
    }
    inFlightRef.current = true
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
      inFlightRef.current = false
      setSending(false)
    }
  }

  const placeholder = !hasConnectedMember
    ? 'No connected agents yet — drag a pane in.'
    : mode === 'execute'
      ? `Prompt to run in ${targetLabel}’s terminal…`
      : isBroadcast
        ? 'Message the room…'
        : `Message ${targetLabel}…`

  const modeButton = (m: WarRoomMode, label: string, Icon: typeof Zap): ReactElement => (
    <button
      onClick={() => setMode(m)}
      title={MODE_HINT[m]}
      aria-pressed={mode === m}
      className={cn(
        'flex items-center gap-1 rounded-[3px] px-1.5 py-[3px] text-[11px] transition-colors',
        mode !== m && 'text-muted-foreground hover:text-foreground',
        mode === m && m === 'execute' && 'bg-[#f97316]/20 text-[#f97316]',
        mode === m && m === 'probe' && 'bg-card text-foreground shadow-sm'
      )}
    >
      <Icon className="h-3 w-3" />
      {label}
    </button>
  )

  return (
    <div className="shrink-0 border-t border-border p-1.5">
      <div
        className={cn(
          'rounded-md border bg-card transition-colors focus-within:border-[#00b0f4]',
          mode === 'execute' ? 'border-[#f97316]/50' : 'border-border'
        )}
      >
        <textarea
          ref={areaRef}
          rows={1}
          value={text}
          // Nobody can receive anything yet — disable rather than merely hint
          // via the placeholder, matching the design (spec §Composer UI).
          disabled={!hasConnectedMember}
          placeholder={placeholder}
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
          className="block w-full resize-none bg-transparent px-2 pb-1 pt-1.5 text-xs leading-[18px] text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
        />

        <div className="flex items-center gap-1 px-1 pb-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                title="Choose who receives this"
                className="flex min-w-0 items-center gap-1 rounded px-1.5 py-[3px] text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {isBroadcast ? (
                  <Users className="h-3 w-3 shrink-0" />
                ) : (
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: memberColor(targetId) }}
                  />
                )}
                <span className="max-w-[7rem] truncate">{targetLabel}</span>
                <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {targets.map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  disabled={t.disabled !== null}
                  title={t.disabled ?? undefined}
                  onSelect={() => setTargetId(t.id)}
                >
                  {t.id === EVERYONE ? (
                    <Users className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: memberColor(t.id) }}
                    />
                  )}
                  <span className="truncate">{t.label}</span>
                  {t.disabled !== null && (
                    <span className="ml-auto pl-3 text-[10px] text-muted-foreground">
                      unavailable
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Two options on one track: unmistakably a mode, where a single
              toggling button reads as an action. */}
          <div className="flex items-center rounded bg-muted/60 p-px">
            {modeButton('probe', 'Probe', SendHorizontal)}
            {modeButton('execute', 'Execute', Zap)}
          </div>

          <button
            onClick={() => void send()}
            disabled={!canSend}
            title="Send · Enter (Shift+Enter for a new line)"
            aria-label="Send"
            className={cn(
              'ml-auto flex shrink-0 items-center justify-center rounded p-1 transition-colors',
              canSend
                ? mode === 'execute'
                  ? 'text-[#f97316] hover:bg-[#f97316]/15'
                  : 'text-[#00b0f4] hover:bg-[#00b0f4]/15'
                : 'cursor-not-allowed text-muted-foreground/40'
            )}
          >
            <SendHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {error !== null && <div className="mt-1 px-1 text-[10px] text-[#ed4245]">{error}</div>}
      {error === null && !validation.ok && text.trim() !== '' && (
        <div className="mt-1 px-1 text-[10px] text-muted-foreground">{validation.reason}</div>
      )}
    </div>
  )
}
