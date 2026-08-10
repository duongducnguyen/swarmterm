import { beforeEach, describe, expect, it } from 'vitest'
import { useBrowserStore } from './browser-store'

const reset = () => useBrowserStore.setState({ previews: {} })
const get = () => useBrowserStore.getState()

describe('browser-store', () => {
  beforeEach(reset)

  it('openPreview creates the preview with history=[url]', () => {
    get().openPreview('t1', 'http://localhost:3000')
    expect(get().previews['t1']).toMatchObject({
      url: 'http://localhost:3000',
      history: ['http://localhost:3000'],
      historyIndex: 0,
    })
  })

  it('openPreview on a terminal that already has one navigates it', () => {
    get().openPreview('t1', 'http://a')
    get().openPreview('t1', 'http://b')
    expect(get().previews['t1']).toMatchObject({
      url: 'http://b',
      history: ['http://a', 'http://b'],
      historyIndex: 1,
    })
  })

  it('openPreview with the currently shown url is a no-op', () => {
    get().openPreview('t1', 'http://a')
    get().openPreview('t1', 'http://a')
    expect(get().previews['t1']).toMatchObject({ history: ['http://a'], historyIndex: 0 })
  })

  it('openPreview does not touch other terminals', () => {
    get().openPreview('t1', 'http://a')
    get().openPreview('t2', 'http://b')
    expect(get().previews['t1']).toMatchObject({ url: 'http://a' })
    expect(get().previews['t2']).toMatchObject({ url: 'http://b' })
  })

  it('closePreview removes only that terminal entry; unknown terminal is a no-op', () => {
    get().openPreview('t1', 'http://a')
    get().openPreview('t2', 'http://b')
    get().closePreview('t1')
    expect(get().previews['t1']).toBeUndefined()
    expect(get().previews['t2']).toMatchObject({ url: 'http://b' })
    get().closePreview('nope') // must not throw or clobber state
    expect(get().previews['t2']).toMatchObject({ url: 'http://b' })
  })
})

describe('applyNavState', () => {
  beforeEach(reset)

  it('pushes a new url into history', () => {
    const { openPreview, applyNavState } = get()
    openPreview('t1', 'http://a/')
    applyNavState('t1', { url: 'http://b/' })
    const p = get().previews['t1']
    expect(p.url).toBe('http://b/')
    expect(p.history).toEqual(['http://a/', 'http://b/'])
    expect(p.historyIndex).toBe(1)
  })
  it('recognises a back navigation instead of pushing', () => {
    const { openPreview, applyNavState } = get()
    openPreview('t1', 'http://a/')
    applyNavState('t1', { url: 'http://b/' })
    applyNavState('t1', { url: 'http://a/' })
    const p = get().previews['t1']
    expect(p.history).toEqual(['http://a/', 'http://b/'])
    expect(p.historyIndex).toBe(0)
  })
  it('recognises a forward navigation', () => {
    const { openPreview, applyNavState } = get()
    openPreview('t1', 'http://a/')
    applyNavState('t1', { url: 'http://b/' })
    applyNavState('t1', { url: 'http://a/' })
    applyNavState('t1', { url: 'http://b/' })
    const p = get().previews['t1']
    expect(p.history).toEqual(['http://a/', 'http://b/'])
    expect(p.historyIndex).toBe(1)
  })
  it('a url off the back/forward neighbours after a back nav truncates forward history', () => {
    // Ports the old navigate()-after-goBack() truncation assertion onto the
    // applyNavState path now that Back/Forward drive history.back()/forward()
    // in the real webview and the resulting url comes back as an event.
    const { openPreview, applyNavState } = get()
    openPreview('t1', 'http://a/')
    applyNavState('t1', { url: 'http://b/' })
    applyNavState('t1', { url: 'http://c/' })
    applyNavState('t1', { url: 'http://b/' }) // back nav: b is the index-1 neighbour
    applyNavState('t1', { url: 'http://d/' }) // new branch off b — c falls off
    const p = get().previews['t1']
    expect(p.history).toEqual(['http://a/', 'http://b/', 'http://d/'])
    expect(p.historyIndex).toBe(2)
  })
  it('applies title and loading', () => {
    const { openPreview, applyNavState } = get()
    openPreview('t1', 'http://a/')
    applyNavState('t1', { title: 'Docs', loading: true })
    const p = get().previews['t1']
    expect(p.title).toBe('Docs')
    expect(p.loading).toBe(true)
  })
  it('ignores events for unknown terminals — never resurrects a closed preview', () => {
    get().applyNavState('ghost', { url: 'http://a/' })
    expect(get().previews['ghost']).toBeUndefined()
  })
})
