import { create } from 'zustand'

/**
 * One preview per terminal, keyed by terminalId. The old model (many tabs per
 * terminal, merged into one global strip with a global activeTabId) collapsed
 * under parallel agents — see the 2026-07-06 spec. Panel open/close is NOT
 * here: it belongs to git-store.panelOpen (the right panel owns its chrome).
 */
export interface Preview {
  url: string
  title?: string
  loading?: boolean
  history: string[]
  historyIndex: number
}

export interface BrowserStore {
  previews: Record<string, Preview>
  /** Create the terminal's preview, or navigate it if one already exists. */
  openPreview: (terminalId: string, url: string) => void
  closePreview: (terminalId: string) => void
  navigate: (terminalId: string, url: string) => void
  setTitle: (terminalId: string, title: string) => void
  goBack: (terminalId: string) => void
  goForward: (terminalId: string) => void
  /** Fold a `preview:state` event (real navigation/title/loading) into the store. */
  applyNavState: (terminalId: string, ev: { url?: string; title?: string; loading?: boolean }) => void
}

/** Push `url` onto the history, truncating forward entries; no-op on same url. */
function pushUrl(p: Preview, url: string): Preview {
  if (p.history[p.historyIndex] === url) return p
  const history = [...p.history.slice(0, p.historyIndex + 1), url]
  return { ...p, url, history, historyIndex: history.length - 1 }
}

/**
 * Real navigations come back as events — including the ones our own Back/
 * Forward buttons caused via history.back() — so a url that matches the
 * neighbouring history entry moves the index instead of pushing a duplicate.
 */
function applyUrl(p: Preview, url: string): Preview {
  if (p.history[p.historyIndex] === url) return { ...p, url }
  if (p.history[p.historyIndex - 1] === url)
    return { ...p, url, historyIndex: p.historyIndex - 1 }
  if (p.history[p.historyIndex + 1] === url)
    return { ...p, url, historyIndex: p.historyIndex + 1 }
  return pushUrl(p, url)
}

export const useBrowserStore = create<BrowserStore>((set) => ({
  previews: {},

  openPreview: (terminalId, url) =>
    set((s) => {
      const existing = s.previews[terminalId]
      const preview = existing ? pushUrl(existing, url) : { url, history: [url], historyIndex: 0 }
      return { previews: { ...s.previews, [terminalId]: preview } }
    }),

  closePreview: (terminalId) =>
    set((s) => {
      if (!(terminalId in s.previews)) return s
      const previews = { ...s.previews }
      delete previews[terminalId]
      return { previews }
    }),

  navigate: (terminalId, url) =>
    set((s) => {
      const p = s.previews[terminalId]
      if (!p) return s
      return { previews: { ...s.previews, [terminalId]: pushUrl(p, url) } }
    }),

  setTitle: (terminalId, title) =>
    set((s) => {
      const p = s.previews[terminalId]
      if (!p) return s
      return { previews: { ...s.previews, [terminalId]: { ...p, title } } }
    }),

  goBack: (terminalId) =>
    set((s) => {
      const p = s.previews[terminalId]
      if (!p || p.historyIndex <= 0) return s
      const historyIndex = p.historyIndex - 1
      return {
        previews: { ...s.previews, [terminalId]: { ...p, historyIndex, url: p.history[historyIndex] } },
      }
    }),

  goForward: (terminalId) =>
    set((s) => {
      const p = s.previews[terminalId]
      if (!p || p.historyIndex >= p.history.length - 1) return s
      const historyIndex = p.historyIndex + 1
      return {
        previews: { ...s.previews, [terminalId]: { ...p, historyIndex, url: p.history[historyIndex] } },
      }
    }),

  applyNavState: (terminalId, ev) =>
    set((s) => {
      const p = s.previews[terminalId]
      if (!p) return s // late event after closePreview — must not resurrect
      let next = p
      if (ev.url !== undefined) next = applyUrl(next, ev.url)
      if (ev.title !== undefined) next = { ...next, title: ev.title }
      if (ev.loading !== undefined) next = { ...next, loading: ev.loading }
      return { previews: { ...s.previews, [terminalId]: next } }
    }),
}))
