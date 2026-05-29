import { create } from 'zustand'

export interface WebTab {
  id: string
  terminalId: string
  url: string
  title?: string
}

export interface BrowserStore {
  tabs: WebTab[]
  activeTabId: string | null
  visible: boolean
  fullscreen: boolean
  openTab: (input: { terminalId: string; url: string }) => void
  closeTab: (tabId: string) => void
  closeTabsForTerminal: (terminalId: string) => void
  setActiveTab: (tabId: string) => void
  navigate: (tabId: string, url: string) => void
  setTitle: (tabId: string, title: string) => void
  toggleVisible: () => void
  setFullscreen: (fullscreen: boolean) => void
}

function uid(): string {
  return crypto.randomUUID()
}

/** Pick a surviving tab's id after `removedId` leaves `before`, or null. */
function neighbourId(before: WebTab[], removedId: string): string | null {
  const idx = before.findIndex((t) => t.id === removedId)
  const remaining = before.filter((t) => t.id !== removedId)
  if (remaining.length === 0) return null
  return remaining[Math.min(idx, remaining.length - 1)].id
}

export const useBrowserStore = create<BrowserStore>((set) => ({
  tabs: [],
  activeTabId: null,
  visible: false,
  fullscreen: false,

  openTab: ({ terminalId, url }) =>
    set((s) => {
      const tab: WebTab = { id: uid(), terminalId, url }
      return { tabs: [...s.tabs, tab], activeTabId: tab.id, visible: true }
    }),

  closeTab: (tabId) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== tabId)
      const activeTabId =
        s.activeTabId === tabId ? neighbourId(s.tabs, tabId) : s.activeTabId
      return { tabs, activeTabId, visible: tabs.length > 0 && s.visible, fullscreen: tabs.length === 0 ? false : s.fullscreen }
    }),

  closeTabsForTerminal: (terminalId) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.terminalId !== terminalId)
      const activeStillThere = tabs.some((t) => t.id === s.activeTabId)
      const activeTabId = activeStillThere ? s.activeTabId : (tabs[0]?.id ?? null)
      return { tabs, activeTabId, visible: tabs.length > 0 && s.visible, fullscreen: tabs.length === 0 ? false : s.fullscreen }
    }),

  setActiveTab: (tabId) => set({ activeTabId: tabId }),
  navigate: (tabId, url) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, url } : t)) })),
  setTitle: (tabId, title) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, title } : t)) })),
  toggleVisible: () => set((s) => ({ visible: !s.visible })),
  setFullscreen: (fullscreen) => set({ fullscreen })
}))
