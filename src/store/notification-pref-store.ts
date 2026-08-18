import { create } from 'zustand'
import {
  DEFAULT_NOTIFICATION_PREFS,
  readStoredNotificationPrefs,
  storeNotificationPrefs,
  type NotificationPrefs
} from '@/lib/notification-pref'

export interface NotificationPrefStore {
  prefs: NotificationPrefs
  setSound: (on: boolean) => void
  setSystem: (on: boolean) => void
  setAgentEnabled: (agentId: string, on: boolean) => void
}

/**
 * Notification preferences. Reads the persisted choice on first creation and
 * writes every change back to localStorage. Renderer-only — touches `window`.
 */
export const useNotificationPrefStore = create<NotificationPrefStore>((set, get) => {
  const initial =
    typeof window === 'undefined'
      ? DEFAULT_NOTIFICATION_PREFS
      : readStoredNotificationPrefs(window.localStorage)
  const apply = (prefs: NotificationPrefs): void => {
    storeNotificationPrefs(window.localStorage, prefs)
    set({ prefs })
  }
  return {
    prefs: initial,
    setSound: (on) => apply({ ...get().prefs, sound: on }),
    setSystem: (on) => apply({ ...get().prefs, system: on }),
    setAgentEnabled: (agentId, on) =>
      apply({ ...get().prefs, perAgent: { ...get().prefs.perAgent, [agentId]: on } })
  }
})
