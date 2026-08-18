import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NOTIFICATION_PREFS,
  NOTIFICATION_PREF_STORAGE_KEY,
  agentNotificationsEnabled,
  readStoredNotificationPrefs,
  storeNotificationPrefs,
  type NotificationPrefStorage
} from './notification-pref'

function fakeStorage(initial: Record<string, string> = {}): NotificationPrefStorage & { data: Record<string, string> } {
  const data = { ...initial }
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v }
  }
}

describe('readStoredNotificationPrefs', () => {
  it('returns defaults when nothing is stored', () => {
    expect(readStoredNotificationPrefs(fakeStorage())).toEqual(DEFAULT_NOTIFICATION_PREFS)
  })

  it('round-trips through store', () => {
    const storage = fakeStorage()
    const prefs = { sound: false, system: true, perAgent: { codex: false } }
    storeNotificationPrefs(storage, prefs)
    expect(readStoredNotificationPrefs(storage)).toEqual(prefs)
  })

  it('falls back to defaults on malformed JSON', () => {
    const storage = fakeStorage({ [NOTIFICATION_PREF_STORAGE_KEY]: '{not json' })
    expect(readStoredNotificationPrefs(storage)).toEqual(DEFAULT_NOTIFICATION_PREFS)
  })

  it('falls back to defaults on non-object payloads', () => {
    const storage = fakeStorage({ [NOTIFICATION_PREF_STORAGE_KEY]: '"yes"' })
    expect(readStoredNotificationPrefs(storage)).toEqual(DEFAULT_NOTIFICATION_PREFS)
  })

  it('coerces missing/invalid fields per-field and keeps only boolean perAgent entries', () => {
    const storage = fakeStorage({
      [NOTIFICATION_PREF_STORAGE_KEY]: JSON.stringify({ sound: 'loud', perAgent: { codex: false, opencode: 'x' } })
    })
    expect(readStoredNotificationPrefs(storage)).toEqual({
      sound: true,
      system: true,
      perAgent: { codex: false }
    })
  })
})

describe('agentNotificationsEnabled', () => {
  const prefs = { sound: true, system: true, perAgent: { codex: false, opencode: true } }
  it('treats a missing key as enabled (fail-open for future agents)', () => {
    expect(agentNotificationsEnabled(prefs, 'claude-code')).toBe(true)
  })
  it('respects explicit false / true', () => {
    expect(agentNotificationsEnabled(prefs, 'codex')).toBe(false)
    expect(agentNotificationsEnabled(prefs, 'opencode')).toBe(true)
  })
})
