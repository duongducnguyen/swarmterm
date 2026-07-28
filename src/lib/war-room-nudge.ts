/**
 * War Room delivery texts + flush ordering. Pure — the store queues
 * PendingDeliveries per terminal and the delivery wiring decides WHEN
 * (sustained idle); this module decides WHAT gets typed.
 *
 * Probe bodies deliberately never appear here: only a short nudge is typed
 * into the agent's terminal and the content stays in the MCP inbox, so
 * cross-agent chatter can't bloat an agent's context window.
 */

/** Idle must hold this long before typing into a pane. Deliberately above the
 *  activity tracker's 1100ms so a brief pause mid-turn never reads as "done". */
export const NUDGE_IDLE_MS = 3000

export interface PendingDelivery {
  fromName: string
  mode: 'probe' | 'execute'
  /** Full prompt for execute deliveries; probes carry no body. */
  content?: string
}

export function buildNudgeText(fromNames: string[]): string {
  const unique = [...new Set(fromNames)]
  const who = unique.join(', ')
  if (fromNames.length === 1) {
    return `[War Room] New message from ${who}. Call the war_room.read_inbox tool to read it, then reply with war_room.send.`
  }
  return `[War Room] ${fromNames.length} new messages (from ${who}). Call the war_room.read_inbox tool to read them, then reply with war_room.send.`
}

export function buildIntroText(peerNames: string[]): string {
  const with_ = peerNames.length > 0 ? ` with ${peerNames.join(', ')}` : ''
  return (
    `[War Room] You joined Swarmterm's War Room${with_}. ` +
    `First call war_room.list_peers now — that confirms your connection (until then ` +
    `peers see you as pending and cannot message you). ` +
    `Tools: war_room.list_peers (who is here), war_room.send (mode "probe" to message a peer, ` +
    `mode "execute" to hand a peer a prompt their terminal will run), war_room.read_inbox ` +
    `(read messages sent to you — you will be nudged). ` +
    // The human is a peer like any other, so agents must be told the id and
    // that this one peer has no terminal to be nudged in.
    `The peer "Moderator" (terminalId "__moderator__") is the human user driving Swarmterm: ` +
    `war_room.send to them when you need a decision. They read everything in the panel and ` +
    `have no terminal, so never send them mode "execute". ` +
    `Coordinate through these tools and keep message bodies out of the terminal.`
  )
}

/** Paste payloads for one idle window: executes verbatim in arrival order,
 *  then a single merged nudge covering every queued probe. */
export function flushQueue(queue: PendingDelivery[]): string[] {
  const out: string[] = []
  for (const d of queue) {
    if (d.mode === 'execute' && d.content !== undefined) out.push(d.content)
  }
  const probes = queue.filter((d) => d.mode === 'probe')
  if (probes.length > 0) out.push(buildNudgeText(probes.map((d) => d.fromName)))
  return out
}

/**
 * How long after the last keystroke a focused pane still counts as "being
 * typed in". Deliberately well above NUDGE_IDLE_MS: the two guards answer
 * different questions (has the pty stopped talking? has the user stopped
 * typing?) and a pane is routinely output-idle while the user is mid-sentence.
 */
export const TYPING_QUIET_MS = 6000

export interface TypingSnapshot {
  /** Is this the pane the keyboard currently goes to? */
  focused: boolean
  /** ms epoch of the last user input, or undefined if never typed in. */
  lastKeyAt: number | undefined
  /** A line has been typed here and not yet submitted or abandoned. */
  dirty: boolean
}

/**
 * Should a queued delivery be held rather than typed into this pane right now?
 * There is no maximum hold on purpose — force-delivering after N seconds would
 * reintroduce exactly the corruption this guards against, just more rarely.
 * The escape is the user-facing "Deliver now" affordance, which clears the
 * typing signal instead of bypassing this rule.
 */
export function shouldDeferDelivery(s: TypingSnapshot, now: number): boolean {
  // Unfocused-but-dirty still holds: the line survives losing focus.
  if (s.dirty) return true
  if (!s.focused) return false
  // Safety net for input the dirty flag can miss — a TUI consuming keystrokes
  // through a path `onData` does not represent.
  return s.lastKeyAt !== undefined && now - s.lastKeyAt < TYPING_QUIET_MS
}
