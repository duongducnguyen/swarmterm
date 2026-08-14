import { describe, expect, it } from 'vitest'
import { progressPercent, reduceUpdater, updateButtonView, type UpdaterState } from './updater-flow'

const idle: UpdaterState = { phase: 'idle' }

describe('reduceUpdater', () => {
  it('starts a check from idle', () => {
    expect(reduceUpdater(idle, { type: 'check', manual: false })).toEqual({
      phase: 'checking',
      manual: false
    })
  })

  it('ignores a second check while one is in flight', () => {
    const checking = reduceUpdater(idle, { type: 'check', manual: false })
    expect(reduceUpdater(checking, { type: 'check', manual: true })).toBe(checking)
  })

  it('surfaces a found update regardless of trigger', () => {
    const checking = reduceUpdater(idle, { type: 'check', manual: false })
    expect(reduceUpdater(checking, { type: 'found', version: '0.2.0', notes: 'n' })).toEqual({
      phase: 'available',
      version: '0.2.0',
      notes: 'n'
    })
  })

  it('startup check is silent when up to date, manual check says so', () => {
    const silent = reduceUpdater(idle, { type: 'check', manual: false })
    expect(reduceUpdater(silent, { type: 'none' })).toEqual(idle)
    const manual = reduceUpdater(idle, { type: 'check', manual: true })
    expect(reduceUpdater(manual, { type: 'none' })).toEqual({ phase: 'upToDate' })
  })

  it('startup check swallows failures, manual check surfaces them', () => {
    const silent = reduceUpdater(idle, { type: 'check', manual: false })
    expect(reduceUpdater(silent, { type: 'checkFailed', message: 'offline' })).toEqual(idle)
    const manual = reduceUpdater(idle, { type: 'check', manual: true })
    expect(reduceUpdater(manual, { type: 'checkFailed', message: 'offline' })).toEqual({
      phase: 'error',
      message: 'offline'
    })
  })

  it('walks download → ready and accumulates progress', () => {
    let s: UpdaterState = { phase: 'available', version: '0.2.0' }
    s = reduceUpdater(s, { type: 'downloadStart' })
    expect(s).toEqual({ phase: 'downloading', version: '0.2.0', downloaded: 0 })
    s = reduceUpdater(s, { type: 'progress', chunk: 25, total: 100 })
    s = reduceUpdater(s, { type: 'progress', chunk: 25 })
    expect(s).toEqual({ phase: 'downloading', version: '0.2.0', downloaded: 50, total: 100 })
    expect(reduceUpdater(s, { type: 'downloaded' })).toEqual({ phase: 'ready', version: '0.2.0' })
  })

  it('returns to available with the error on download failure', () => {
    const dl: UpdaterState = { phase: 'downloading', version: '0.2.0', downloaded: 10 }
    expect(reduceUpdater(dl, { type: 'downloadFailed', message: 'sig mismatch' })).toEqual({
      phase: 'available',
      version: '0.2.0',
      error: 'sig mismatch'
    })
  })

  it('dismiss clears every phase except an in-flight download', () => {
    expect(reduceUpdater({ phase: 'available', version: 'v' }, { type: 'dismiss' })).toEqual(idle)
    expect(reduceUpdater({ phase: 'upToDate' }, { type: 'dismiss' })).toEqual(idle)
    expect(reduceUpdater({ phase: 'error', message: 'm' }, { type: 'dismiss' })).toEqual(idle)
    expect(reduceUpdater({ phase: 'ready', version: 'v' }, { type: 'dismiss' })).toEqual(idle)
    const dl: UpdaterState = { phase: 'downloading', version: 'v', downloaded: 1 }
    expect(reduceUpdater(dl, { type: 'dismiss' })).toBe(dl)
  })
})

describe('progressPercent', () => {
  it('is null while the total is unknown, else a clamped percent', () => {
    expect(progressPercent({ phase: 'downloading', version: 'v', downloaded: 5 })).toBeNull()
    expect(
      progressPercent({ phase: 'downloading', version: 'v', downloaded: 50, total: 200 })
    ).toBe(25)
    expect(progressPercent({ phase: 'idle' })).toBeNull()
  })
})

describe('updateButtonView', () => {
  it('renders nothing until an update is actually known', () => {
    expect(updateButtonView({ phase: 'idle' })).toBeNull()
    expect(updateButtonView({ phase: 'checking', manual: true })).toBeNull()
    expect(updateButtonView({ phase: 'upToDate' })).toBeNull()
    expect(updateButtonView({ phase: 'error', message: 'm' })).toBeNull()
  })

  it('offers the update by version once available', () => {
    expect(updateButtonView({ phase: 'available', version: '0.2.0' })).toEqual({
      kind: 'update',
      label: 'Update to v0.2.0',
      tooltip: 'Update to v0.2.0'
    })
  })

  it('turns into a retry with the error as tooltip after a failed download', () => {
    expect(
      updateButtonView({ phase: 'available', version: '0.2.0', error: 'sig mismatch' })
    ).toEqual({
      kind: 'update',
      label: 'Retry update',
      tooltip: 'Download failed: sig mismatch'
    })
  })

  it('shows progress while downloading, indeterminate without a total', () => {
    expect(
      updateButtonView({ phase: 'downloading', version: 'v', downloaded: 50, total: 200 })
    ).toEqual({ kind: 'downloading', label: 'Downloading… 25%' })
    expect(updateButtonView({ phase: 'downloading', version: 'v', downloaded: 5 })).toEqual({
      kind: 'downloading',
      label: 'Downloading…'
    })
  })

  it('asks for a restart once the download is staged', () => {
    expect(updateButtonView({ phase: 'ready', version: '0.2.0' })).toEqual({
      kind: 'restart',
      label: 'Restart to update'
    })
  })
})
