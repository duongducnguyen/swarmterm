/** User preferences for Đ3 agent notifications. Persisted to localStorage. */
export interface NotificationPrefs {
  sound: boolean
  system: boolean
  /** Keyed by workspace template id (claude-code/codex/opencode). Missing key = enabled. */
  perAgent: Record<string, boolean>
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = { sound: true, system: true, perAgent: {} }

/** localStorage key the notification preference is persisted under. */
export const NOTIFICATION_PREF_STORAGE_KEY = 'cc-notification-prefs'

/** Minimal storage surface — lets tests pass a fake in place of localStorage. */
export interface NotificationPrefStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

/** Missing key reads as enabled so a future agent id needs no migration. */
export function agentNotificationsEnabled(prefs: NotificationPrefs, agentId: string): boolean {
  return prefs.perAgent[agentId] !== false
}

/** Per-field tolerant parse: any invalid field falls back alone, never the whole blob. */
export function readStoredNotificationPrefs(storage: NotificationPrefStorage): NotificationPrefs {
  const raw = storage.getItem(NOTIFICATION_PREF_STORAGE_KEY)
  if (raw === null) return DEFAULT_NOTIFICATION_PREFS
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return DEFAULT_NOTIFICATION_PREFS
  }
  if (typeof parsed !== 'object' || parsed === null) return DEFAULT_NOTIFICATION_PREFS
  const obj = parsed as Record<string, unknown>
  const perAgent: Record<string, boolean> = {}
  if (typeof obj.perAgent === 'object' && obj.perAgent !== null) {
    for (const [k, v] of Object.entries(obj.perAgent as Record<string, unknown>)) {
      if (typeof v === 'boolean') perAgent[k] = v
    }
  }
  return {
    sound: typeof obj.sound === 'boolean' ? obj.sound : true,
    system: typeof obj.system === 'boolean' ? obj.system : true,
    perAgent
  }
}

export function storeNotificationPrefs(storage: NotificationPrefStorage, prefs: NotificationPrefs): void {
  storage.setItem(NOTIFICATION_PREF_STORAGE_KEY, JSON.stringify(prefs))
}
