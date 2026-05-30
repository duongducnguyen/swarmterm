import { beforeEach, describe, expect, it } from 'vitest'
import { useBrowserStore } from './browser-store'

const reset = () =>
  useBrowserStore.setState({ tabs: [], activeTabId: null, visible: false, fullscreen: false })

describe('browser-store', () => {
  beforeEach(reset)

  it('openTab adds a tab, makes it active and shows the column', () => {
    useBrowserStore.getState().openTab({ terminalId: 't1', url: 'http://localhost:3000' })
    const s = useBrowserStore.getState()
    expect(s.tabs).toHaveLength(1)
    expect(s.tabs[0]).toMatchObject({ terminalId: 't1', url: 'http://localhost:3000' })
    expect(s.activeTabId).toBe(s.tabs[0].id)
    expect(s.visible).toBe(true)
  })

  it('closeTab removes it and moves active to a neighbour, hiding when empty', () => {
    const open = useBrowserStore.getState().openTab
    open({ terminalId: 't1', url: 'http://a' })
    open({ terminalId: 't1', url: 'http://b' })
    const [first, second] = useBrowserStore.getState().tabs
    useBrowserStore.getState().setActiveTab(first.id)
    useBrowserStore.getState().closeTab(first.id)
    expect(useBrowserStore.getState().activeTabId).toBe(second.id)
    useBrowserStore.getState().closeTab(second.id)
    expect(useBrowserStore.getState().tabs).toHaveLength(0)
    expect(useBrowserStore.getState().activeTabId).toBeNull()
    expect(useBrowserStore.getState().visible).toBe(false)
  })

  it('closeTabsForTerminal drops every tab of that terminal', () => {
    const open = useBrowserStore.getState().openTab
    open({ terminalId: 't1', url: 'http://a' })
    open({ terminalId: 't2', url: 'http://b' })
    open({ terminalId: 't1', url: 'http://c' })
    useBrowserStore.getState().closeTabsForTerminal('t1')
    const s = useBrowserStore.getState()
    expect(s.tabs).toHaveLength(1)
    expect(s.tabs[0].terminalId).toBe('t2')
    expect(s.activeTabId).toBe(s.tabs[0].id)
  })

  it('navigate updates url, setTitle updates title', () => {
    useBrowserStore.getState().openTab({ terminalId: 't1', url: 'http://a' })
    const id = useBrowserStore.getState().tabs[0].id
    useBrowserStore.getState().navigate(id, 'http://b')
    useBrowserStore.getState().setTitle(id, 'Hello')
    const tab = useBrowserStore.getState().tabs[0]
    expect(tab.url).toBe('http://b')
    expect(tab.title).toBe('Hello')
  })

  it('toggleVisible and setFullscreen flip their flags', () => {
    useBrowserStore.getState().toggleVisible()
    expect(useBrowserStore.getState().visible).toBe(true)
    useBrowserStore.getState().setFullscreen(true)
    expect(useBrowserStore.getState().fullscreen).toBe(true)
  })

  // --- per-tab history tests ---

  it('openTab initializes history=[url] and historyIndex=0', () => {
    useBrowserStore.getState().openTab({ terminalId: 't1', url: 'http://start' })
    const tab = useBrowserStore.getState().tabs[0]
    expect(tab.history).toEqual(['http://start'])
    expect(tab.historyIndex).toBe(0)
  })

  it('navigate pushes a new entry and advances historyIndex', () => {
    useBrowserStore.getState().openTab({ terminalId: 't1', url: 'http://a' })
    const id = useBrowserStore.getState().tabs[0].id
    useBrowserStore.getState().navigate(id, 'http://b')
    useBrowserStore.getState().navigate(id, 'http://c')
    const tab = useBrowserStore.getState().tabs[0]
    expect(tab.history).toEqual(['http://a', 'http://b', 'http://c'])
    expect(tab.historyIndex).toBe(2)
    expect(tab.url).toBe('http://c')
  })

  it('navigate to the same url as current entry is a no-op', () => {
    useBrowserStore.getState().openTab({ terminalId: 't1', url: 'http://a' })
    const id = useBrowserStore.getState().tabs[0].id
    useBrowserStore.getState().navigate(id, 'http://a')
    const tab = useBrowserStore.getState().tabs[0]
    expect(tab.history).toEqual(['http://a'])
    expect(tab.historyIndex).toBe(0)
  })

  it('navigate after goBack truncates forward history', () => {
    useBrowserStore.getState().openTab({ terminalId: 't1', url: 'http://a' })
    const id = useBrowserStore.getState().tabs[0].id
    useBrowserStore.getState().navigate(id, 'http://b')
    useBrowserStore.getState().navigate(id, 'http://c')
    useBrowserStore.getState().goBack(id)
    // now at index 1 (http://b), forward has http://c
    useBrowserStore.getState().navigate(id, 'http://d')
    const tab = useBrowserStore.getState().tabs[0]
    expect(tab.history).toEqual(['http://a', 'http://b', 'http://d'])
    expect(tab.historyIndex).toBe(2)
    expect(tab.url).toBe('http://d')
  })

  it('goBack moves through history and updates tab.url', () => {
    useBrowserStore.getState().openTab({ terminalId: 't1', url: 'http://a' })
    const id = useBrowserStore.getState().tabs[0].id
    useBrowserStore.getState().navigate(id, 'http://b')
    useBrowserStore.getState().navigate(id, 'http://c')
    useBrowserStore.getState().goBack(id)
    expect(useBrowserStore.getState().tabs[0].url).toBe('http://b')
    expect(useBrowserStore.getState().tabs[0].historyIndex).toBe(1)
    useBrowserStore.getState().goBack(id)
    expect(useBrowserStore.getState().tabs[0].url).toBe('http://a')
    expect(useBrowserStore.getState().tabs[0].historyIndex).toBe(0)
  })

  it('goBack at start is a no-op', () => {
    useBrowserStore.getState().openTab({ terminalId: 't1', url: 'http://a' })
    const id = useBrowserStore.getState().tabs[0].id
    useBrowserStore.getState().goBack(id)
    const tab = useBrowserStore.getState().tabs[0]
    expect(tab.historyIndex).toBe(0)
    expect(tab.url).toBe('http://a')
  })

  it('goForward moves through history and updates tab.url', () => {
    useBrowserStore.getState().openTab({ terminalId: 't1', url: 'http://a' })
    const id = useBrowserStore.getState().tabs[0].id
    useBrowserStore.getState().navigate(id, 'http://b')
    useBrowserStore.getState().navigate(id, 'http://c')
    useBrowserStore.getState().goBack(id)
    useBrowserStore.getState().goBack(id)
    expect(useBrowserStore.getState().tabs[0].url).toBe('http://a')
    useBrowserStore.getState().goForward(id)
    expect(useBrowserStore.getState().tabs[0].url).toBe('http://b')
    expect(useBrowserStore.getState().tabs[0].historyIndex).toBe(1)
    useBrowserStore.getState().goForward(id)
    expect(useBrowserStore.getState().tabs[0].url).toBe('http://c')
    expect(useBrowserStore.getState().tabs[0].historyIndex).toBe(2)
  })

  it('goForward at end is a no-op', () => {
    useBrowserStore.getState().openTab({ terminalId: 't1', url: 'http://a' })
    const id = useBrowserStore.getState().tabs[0].id
    useBrowserStore.getState().goForward(id)
    const tab = useBrowserStore.getState().tabs[0]
    expect(tab.historyIndex).toBe(0)
    expect(tab.url).toBe('http://a')
  })
})
