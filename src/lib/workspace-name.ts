/** Default naming for a new workspace: the project folder, de-duped. */

import { folderName } from '@/lib/recent-folders'

/**
 * Name a workspace after the last segment of `cwd`, appending ` (1)`, ` (2)`, …
 * when that name is already in use by another workspace.
 *
 * `fallbackNumber` keeps the historical "Workspace N" name alive for the case
 * where no folder was picked (the wizard allows an empty cwd — the shell then
 * starts in the process default), so a tab is never left blank.
 */
export function workspaceNameFor(
  cwd: string,
  existingNames: string[],
  fallbackNumber: number
): string {
  const trimmed = cwd.trim()
  const base = trimmed === '' ? `Workspace ${fallbackNumber}` : folderName(trimmed)
  const taken = new Set(existingNames)
  if (!taken.has(base)) return base
  // First free suffix, not "highest + 1": closing "myapp (1)" should let the
  // next workspace reclaim that slot instead of drifting the numbers upward.
  for (let n = 1; ; n++) {
    const candidate = `${base} (${n})`
    if (!taken.has(candidate)) return candidate
  }
}
