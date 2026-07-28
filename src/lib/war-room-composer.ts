/**
 * Rules for the Moderator composer, kept out of the component so they can be
 * unit-tested. These MIRROR the server rules in src-tauri/src/warroom.rs
 * (`WarRoom::send`) so the UI can disable a send and say why without a round
 * trip — the server stays authoritative. If the two ever disagree, the server
 * wins and its message surfaces in the composer's error line.
 */
import type { WarRoomMode } from '@/tauri/warroom'

/** Sentinel for the broadcast row; sent to Rust as `to: null`. */
export const EVERYONE = '__everyone__'

/** Structural shape of a roster entry — declared here rather than imported
 *  from the store so this module stays framework-free. */
export interface ComposerMember {
  terminalId: string
  name: string
  agentId: string | null
  connected: boolean
}

export interface ComposerTarget {
  id: string
  label: string
  /** Non-null = the row is disabled and this is the reason (shown as its tooltip). */
  disabled: string | null
}

const PENDING_REASON =
  'Waiting for the agent in this pane to make its first war_room call — it cannot receive messages yet.'
const SHELL_REASON =
  'Not running a coding agent — a pasted prompt would run as shell commands.'

export function composerTargets(members: ComposerMember[], mode: WarRoomMode): ComposerTarget[] {
  // Disabled rows are shown, not omitted: a member vanishing from the list
  // reads as a bug, while a greyed row with a reason explains itself.
  const rows: ComposerTarget[] = members.map((m) => ({
    id: m.terminalId,
    label: m.name,
    disabled: !m.connected
      ? PENDING_REASON
      : mode === 'execute' && m.agentId === null
        ? SHELL_REASON
        : null
  }))
  if (mode === 'execute') return rows
  return [{ id: EVERYONE, label: 'Everyone', disabled: null }, ...rows]
}

export type ComposerValidation = { ok: true } | { ok: false; reason: string }

export function validateComposer(input: {
  text: string
  targetId: string
  mode: WarRoomMode
  members: ComposerMember[]
}): ComposerValidation {
  if (input.text.trim() === '') return { ok: false, reason: 'Message is empty.' }
  if (input.targetId === EVERYONE) {
    if (input.mode === 'execute') {
      return { ok: false, reason: 'Execute needs one target — a prompt runs in exactly one terminal.' }
    }
    if (!input.members.some((m) => m.connected)) {
      return { ok: false, reason: 'No connected agents in the War Room yet.' }
    }
    return { ok: true }
  }
  const target = composerTargets(input.members, input.mode).find((t) => t.id === input.targetId)
  if (target === undefined) return { ok: false, reason: 'That member is no longer in the War Room.' }
  if (target.disabled !== null) return { ok: false, reason: target.disabled }
  return { ok: true }
}

/**
 * Keep the selection valid as membership changes or the mode flips. Returns
 * EVERYONE as the last resort even in execute mode, where it is invalid on
 * purpose: `validateComposer` then reports the real problem ("execute needs
 * one target") instead of this function silently inventing a recipient.
 */
export function reconcileTarget(
  targetId: string,
  members: ComposerMember[],
  mode: WarRoomMode
): string {
  const rows = composerTargets(members, mode)
  const current = rows.find((t) => t.id === targetId)
  if (current !== undefined && current.disabled === null) return targetId
  return rows.find((t) => t.disabled === null)?.id ?? EVERYONE
}
