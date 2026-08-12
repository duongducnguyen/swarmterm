import { describe, expect, it } from 'vitest'
import { bumpCargoLock, bumpCargoToml, bumpJson } from './bump-lib.mjs'

describe('bumpCargoToml', () => {
  it('rewrites only the [package] version', () => {
    const toml =
      '[package]\nname = "swarmterm"\nversion = "0.1.0"\n\n[dependencies]\nserde = { version = "1" }\n'
    const out = bumpCargoToml(toml, '0.2.0')
    expect(out).toContain('version = "0.2.0"')
    expect(out).toContain('serde = { version = "1" }')
  })
})

describe('bumpCargoLock', () => {
  it('rewrites only the swarmterm package block', () => {
    const lock =
      '[[package]]\nname = "serde"\nversion = "1.0.0"\n\n[[package]]\nname = "swarmterm"\nversion = "0.1.0"\n'
    const out = bumpCargoLock(lock, '0.2.0')
    expect(out).toContain('name = "serde"\nversion = "1.0.0"')
    expect(out).toContain('name = "swarmterm"\nversion = "0.2.0"')
  })
})

describe('bumpJson', () => {
  it('rewrites the top-level version preserving 2-space format', () => {
    const out = bumpJson('{\n  "name": "x",\n  "version": "0.1.0"\n}\n', '0.2.0')
    expect(out).toBe('{\n  "name": "x",\n  "version": "0.2.0"\n}\n')
  })
})
