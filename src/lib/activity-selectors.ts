/**
 * True when any of the given terminal ids is currently flagged active in the
 * activity map. Used to light a workspace tab when one of its (possibly
 * off-screen) panes is working.
 */
export function anyLeafActive(
  terminalIds: string[],
  active: Record<string, boolean>
): boolean {
  return terminalIds.some((id) => active[id] === true)
}
