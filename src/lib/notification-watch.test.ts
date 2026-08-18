import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentPaneState } from '@/lib/agent-state/rollup'
import { NOTIFY_DELAY_MS, startNotificationWatch, type NotificationWatchDeps } from './notification-watch'

const s = (state: AgentPaneState['state'], seen = true): AgentPaneState => ({ state, seen })

interface Harness {
  deps: NotificationWatchDeps
  emit: (next: Record<string, AgentPaneState>, prev: Record<string, AgentPaneState>) => void
  fireTimers: () => void
  playChime: ReturnType<typeof vi.fn>
  sendSystem: ReturnType<typeof vi.fn>
  states: { current: Record<string, AgentPaneState> }
  focus: { window: boolean; watchedId: string | null }
}

function harness(): Harness {
  let listener: ((n: Record<string, AgentPaneState>, p: Record<string, AgentPaneState>) => void) | null = null
  const timers = new Map<number, () => void>()
  let nextHandle = 1
  const playChime = vi.fn()
  const sendSystem = vi.fn()
  const states = { current: {} as Record<string, AgentPaneState> }
  const focus = { window: true, watchedId: null as string | null }
  const deps: NotificationWatchDeps = {
    subscribeAgentStates: (l) => {
      listener = l
      return () => { listener = null }
    },
    getAgentStates: () => states.current,
    isPaneWatched: (id) => focus.watchedId === id,
    isWindowFocused: () => focus.window,
    getAgentId: (id) => (id === 'plain' ? undefined : 'claude-code'),
    getPrefs: () => ({ sound: true, system: true, perAgent: {} }),
    getPaneTitle: () => 'my pane',
    playChime,
    sendSystemNotification: sendSystem,
    setTimer: (fn, ms) => {
      expect(ms).toBe(NOTIFY_DELAY_MS)
      const h = nextHandle++
      timers.set(h, fn)
      return h
    },
    clearTimer: (h) => { timers.delete(h as number) }
  }
  return {
    deps,
    emit: (next, prev) => {
      states.current = next
      listener?.(next, prev)
    },
    fireTimers: () => {
      const fns = [...timers.values()]
      timers.clear()
      fns.forEach((fn) => fn())
    },
    playChime,
    sendSystem,
    states,
    focus
  }
}

describe('startNotificationWatch', () => {
  let h: Harness
  beforeEach(() => { h = harness() })

  it('chimes after the delay when blocked persists (window focused → no banner)', () => {
    startNotificationWatch(h.deps)
    h.emit({ t1: s('blocked') }, { t1: s('working') })
    expect(h.playChime).not.toHaveBeenCalled()
    h.fireTimers()
    expect(h.playChime).toHaveBeenCalledWith('attention')
    expect(h.sendSystem).not.toHaveBeenCalled()
  })

  it('adds the banner when the window is unfocused at fire time', () => {
    startNotificationWatch(h.deps)
    h.emit({ t1: s('blocked') }, { t1: s('working') })
    h.focus.window = false
    h.fireTimers()
    expect(h.sendSystem).toHaveBeenCalledWith({ title: 'Claude Code needs your input', body: 'my pane' })
  })

  it('drops when the state resolved during the delay', () => {
    startNotificationWatch(h.deps)
    h.emit({ t1: s('blocked') }, { t1: s('working') })
    h.states.current = { t1: s('working') }
    h.fireTimers()
    expect(h.playChime).not.toHaveBeenCalled()
  })

  it('a newer transition replaces the pending one', () => {
    startNotificationWatch(h.deps)
    h.emit({ t1: s('blocked') }, { t1: s('working') })
    h.emit({ t1: s('idle', false) }, { t1: s('blocked') })
    h.fireTimers()
    expect(h.playChime).toHaveBeenCalledTimes(1)
    expect(h.playChime).toHaveBeenCalledWith('completion')
  })

  it('removal cancels the pending notification', () => {
    startNotificationWatch(h.deps)
    h.emit({ t1: s('blocked') }, { t1: s('working') })
    h.emit({}, { t1: s('blocked') })
    h.fireTimers()
    expect(h.playChime).not.toHaveBeenCalled()
  })

  it('skips panes without an agent id', () => {
    startNotificationWatch(h.deps)
    h.emit({ plain: s('blocked') }, {})
    h.fireTimers()
    expect(h.playChime).not.toHaveBeenCalled()
  })

  it('disposer cancels pending timers', () => {
    const stop = startNotificationWatch(h.deps)
    h.emit({ t1: s('blocked') }, { t1: s('working') })
    stop()
    h.fireTimers()
    expect(h.playChime).not.toHaveBeenCalled()
  })
})
