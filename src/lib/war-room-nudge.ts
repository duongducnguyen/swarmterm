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
    `Tools: war_room.list_peers (who is here), war_room.send (mode "probe" to message a peer, ` +
    `mode "execute" to hand a peer a prompt their terminal will run), war_room.read_inbox ` +
    `(read messages sent to you — you will be nudged). Coordinate through these tools and ` +
    `keep message bodies out of the terminal.`
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
