/** Persistence + pure helpers for the "recent working folders" list on Welcome. */

/** localStorage key recents are persisted under (a JSON array of path strings). */
export const RECENTS_STORAGE_KEY = 'cc-recent-folders'

/** Most entries kept; older ones drop off beyond this. */
export const MAX_RECENTS = 12

/** Minimal storage surface — lets tests pass a fake in place of localStorage. */
export interface RecentsStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

/** Read persisted recents. Missing, non-JSON, non-array, or non-string entries are dropped. */
export function readRecents(storage: RecentsStorage): string[] {
  const raw = storage.getItem(RECENTS_STORAGE_KEY)
  if (raw === null) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((p): p is string => typeof p === 'string')
  } catch {
    return []
  }
}

/** Push `path` to the front: trim, ignore empty, de-dupe (exact match), cap to MAX_RECENTS. */
export function addRecent(list: string[], path: string): string[] {
  const trimmed = path.trim()
  if (trimmed === '') return list
  const withoutDupe = list.filter((p) => p !== trimmed)
  return [trimmed, ...withoutDupe].slice(0, MAX_RECENTS)
}

/** Remove `path` (exact match) from the list. */
export function removeRecent(list: string[], path: string): string[] {
  return list.filter((p) => p !== path)
}

/** Persist the list as JSON. */
export function storeRecents(storage: RecentsStorage, list: string[]): void {
  storage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(list))
}

/** Basename of a path: split on both `/` and `\`, return the last non-empty segment. */
export function folderName(path: string): string {
  const segments = path.split(/[\\/]+/).filter((s) => s !== '')
  return segments.length > 0 ? segments[segments.length - 1] : path
}

/** Filter recents by a case-insensitive query matching the folder name or full path. Empty query → all. */
export function filterRecents(recents: string[], query: string): string[] {
  const q = query.trim().toLowerCase()
  if (q === '') return recents
  return recents.filter(
    (p) => p.toLowerCase().includes(q) || folderName(p).toLowerCase().includes(q)
  )
}
