/**
 * Stable visual identity for War Room members. Discord assigns each user a
 * role color; here the color is derived from the terminalId so it is stable
 * for the pane's whole life (survives renames, re-joins, transcript history)
 * without any stored mapping.
 */

/** Discord-ish role palette picked for legibility on the dark theme. The
 *  execute-embed orange (#f97316) is deliberately absent so a member color
 *  never reads as an execute marker. */
export const MEMBER_COLORS = [
  '#5865f2', // blurple
  '#57f287', // green
  '#fee75c', // yellow
  '#eb459e', // fuchsia
  '#ed4245', // red
  '#00b0f4', // sky
  '#9b84ec', // lavender
  '#f47b67', // coral
  '#3ba55d', // deep green
  '#e67e22' // amber
]

export function memberColor(terminalId: string): string {
  // FNV-ish rolling hash — cheap, deterministic, spreads UUIDs well enough
  // for a 10-color palette. Collisions are acceptable (Discord has them too).
  let h = 0
  for (let i = 0; i < terminalId.length; i++) {
    h = (h * 31 + terminalId.charCodeAt(i)) >>> 0
  }
  return MEMBER_COLORS[h % MEMBER_COLORS.length]
}
