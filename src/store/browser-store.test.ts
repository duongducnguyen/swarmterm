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

  it('navigate pushes a new entry and advances historyIndex', () => {
    get().openPreview('t1', 'http://a')
    get().navigate('t1', 'http://b')
    get().navigate('t1', 'http://c')
    expect(get().previews['t1']).toMatchObject({
      url: 'http://c',
      history: ['http://a', 'http://b', 'http://c'],
      historyIndex: 2,
    })
  })

  it('navigate to the same url as current entry is a no-op', () => {
    get().openPreview('t1', 'http://a')
    get().navigate('t1', 'http://a')
    expect(get().previews['t1']).toMatchObject({ history: ['http://a'], historyIndex: 0 })
  })

  it('navigate after goBack truncates forward history', () => {
    get().openPreview('t1', 'http://a')
    get().navigate('t1', 'http://b')
    get().navigate('t1', 'http://c')
    get().goBack('t1')
    get().navigate('t1', 'http://d')
    expect(get().previews['t1']).toMatchObject({
      url: 'http://d',
      history: ['http://a', 'http://b', 'http://d'],
      historyIndex: 2,
    })
  })

  it('navigate on a terminal without a preview is a no-op', () => {
    get().navigate('t1', 'http://a')
    expect(get().previews['t1']).toBeUndefined()
  })

  it('goBack/goForward walk history and clamp at both ends', () => {
    get().openPreview('t1', 'http://a')
    get().navigate('t1', 'http://b')
    get().goBack('t1')
    expect(get().previews['t1']).toMatchObject({ url: 'http://a', historyIndex: 0 })
    get().goBack('t1') // at start — no-op
    expect(get().previews['t1']).toMatchObject({ url: 'http://a', historyIndex: 0 })
    get().goForward('t1')
    expect(get().previews['t1']).toMatchObject({ url: 'http://b', historyIndex: 1 })
    get().goForward('t1') // at end — no-op
    expect(get().previews['t1']).toMatchObject({ url: 'http://b', historyIndex: 1 })
  })

  it('goBack/goForward/setTitle on a terminal without a preview are no-ops', () => {
    get().goBack('t1')
    get().goForward('t1')
    get().setTitle('t1', 'x')
    expect(get().previews['t1']).toBeUndefined()
  })

  it('setTitle sets the title of that terminal preview only', () => {
    get().openPreview('t1', 'http://a')
    get().openPreview('t2', 'http://b')
    get().setTitle('t1', 'Hello')
    expect(get().previews['t1']!.title).toBe('Hello')
    expect(get().previews['t2']!.title).toBeUndefined()
  })
})
