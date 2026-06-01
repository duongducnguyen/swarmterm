import { describe, it, expect } from 'vitest'
import {
  RECENTS_STORAGE_KEY,
  MAX_RECENTS,
  readRecents,
  addRecent,
  removeRecent,
  storeRecents,
  folderName,
  filterRecents,
  type RecentsStorage
} from './recent-folders'

function fakeStorage(initial: Record<string, string> = {}): RecentsStorage {
  const data: Record<string, string> = { ...initial }
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = value
    }
  }
}

describe('readRecents', () => {
  it('returns [] when nothing is stored', () => {
    expect(readRecents(fakeStorage())).toEqual([])
  })

  it('returns [] for non-JSON data', () => {
    expect(readRecents(fakeStorage({ [RECENTS_STORAGE_KEY]: 'not json' }))).toEqual([])
  })

  it('returns [] when the stored value is not an array', () => {
    expect(readRecents(fakeStorage({ [RECENTS_STORAGE_KEY]: '{"a":1}' }))).toEqual([])
  })

  it('keeps only string entries', () => {
    const storage = fakeStorage({ [RECENTS_STORAGE_KEY]: '["a",1,null,"b"]' })
    expect(readRecents(storage)).toEqual(['a', 'b'])
  })

  it('round-trips a valid array', () => {
    const storage = fakeStorage({ [RECENTS_STORAGE_KEY]: '["C:/x","C:/y"]' })
    expect(readRecents(storage)).toEqual(['C:/x', 'C:/y'])
  })
})

describe('addRecent', () => {
  it('adds to the front of an empty list', () => {
    expect(addRecent([], 'C:/x')).toEqual(['C:/x'])
  })

  it('moves an existing path to the front (de-dupe)', () => {
    expect(addRecent(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c'])
  })

  it('trims whitespace', () => {
    expect(addRecent([], '  C:/x  ')).toEqual(['C:/x'])
  })

  it('ignores an empty / whitespace-only path', () => {
    expect(addRecent(['a'], '   ')).toEqual(['a'])
  })

  it('caps the list at MAX_RECENTS, dropping the oldest', () => {
    const full = Array.from({ length: MAX_RECENTS }, (_, i) => `p${i}`)
    const result = addRecent(full, 'new')
    expect(result).toHaveLength(MAX_RECENTS)
    expect(result[0]).toBe('new')
    expect(result).not.toContain(`p${MAX_RECENTS - 1}`)
  })
})

describe('removeRecent', () => {
  it('removes the exact match', () => {
    expect(removeRecent(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
  })

  it('leaves the list unchanged when the path is absent', () => {
    expect(removeRecent(['a'], 'x')).toEqual(['a'])
  })
})

describe('storeRecents', () => {
  it('persists the list so readRecents round-trips it', () => {
    const storage = fakeStorage()
    storeRecents(storage, ['C:/x', 'C:/y'])
    expect(readRecents(storage)).toEqual(['C:/x', 'C:/y'])
  })
})

describe('folderName', () => {
  it('returns the basename of a Windows path', () => {
    expect(folderName('C:\\Users\\Duong\\AppData\\Local\\BridgeSpace')).toBe('BridgeSpace')
  })

  it('returns the basename of a POSIX path', () => {
    expect(folderName('/home/duong/projects/app')).toBe('app')
  })

  it('ignores a trailing separator', () => {
    expect(folderName('C:\\Project\\2025\\')).toBe('2025')
  })

  it('returns the drive segment for a root path', () => {
    expect(folderName('C:\\')).toBe('C:')
  })
})

describe('filterRecents', () => {
  const recents = ['C:\\Project\\2025\\frida-hook', 'C:\\Project\\2026\\wowshop', '/home/duo/app']

  it('returns all recents for an empty / whitespace query', () => {
    expect(filterRecents(recents, '')).toEqual(recents)
    expect(filterRecents(recents, '   ')).toEqual(recents)
  })

  it('matches on the folder name, case-insensitively', () => {
    expect(filterRecents(recents, 'FRIDA')).toEqual(['C:\\Project\\2025\\frida-hook'])
  })

  it('matches on the full path', () => {
    expect(filterRecents(recents, '2026')).toEqual(['C:\\Project\\2026\\wowshop'])
  })

  it('returns [] when nothing matches', () => {
    expect(filterRecents(recents, 'zzz')).toEqual([])
  })
})
