import { describe, expect, it } from 'vitest'
import { REQUIRED_PLATFORMS, buildManifest } from './manifest.mjs'

const base = {
  version: '0.2.0',
  notes: 'notes',
  pubDate: '2026-08-12T00:00:00Z',
  repo: 'duongducnguyen/swarmterm'
}
const MAC = 'Swarmterm.app.tar.gz'
const WIN = 'Swarmterm_0.2.0_x64-setup.exe'

describe('buildManifest', () => {
  it('maps a complete asset set onto all three platform keys', () => {
    const { manifest, platforms, missing } = buildManifest({
      ...base,
      assetNames: [MAC, `${MAC}.sig`, WIN, `${WIN}.sig`, 'Swarmterm_0.2.0_universal.dmg'],
      signatures: { [`${MAC}.sig`]: 'mac-sig', [`${WIN}.sig`]: 'win-sig' }
    })
    expect(missing).toEqual([])
    expect(platforms.sort()).toEqual([...REQUIRED_PLATFORMS].sort())
    expect(manifest.version).toBe('0.2.0')
    expect(manifest.pub_date).toBe(base.pubDate)
    // universal artifact serves both mac keys
    expect(manifest.platforms['darwin-aarch64']).toEqual(manifest.platforms['darwin-x86_64'])
    expect(manifest.platforms['darwin-aarch64']).toEqual({
      signature: 'mac-sig',
      url: `https://github.com/duongducnguyen/swarmterm/releases/download/v0.2.0/${MAC}`
    })
    expect(manifest.platforms['windows-x86_64'].signature).toBe('win-sig')
  })

  it('reports a platform whose artifact is missing', () => {
    const { manifest, platforms, missing } = buildManifest({
      ...base,
      assetNames: [MAC, `${MAC}.sig`],
      signatures: { [`${MAC}.sig`]: 'mac-sig' }
    })
    expect(platforms).toEqual(['darwin-aarch64', 'darwin-x86_64'])
    expect(missing.join(' ')).toMatch(/windows/)
    expect(manifest.platforms['windows-x86_64']).toBeUndefined()
  })

  it('treats an artifact without its .sig content as missing', () => {
    const { manifest, missing } = buildManifest({
      ...base,
      assetNames: [WIN, `${WIN}.sig`],
      signatures: {} // sig asset exists remotely but content unavailable
    })
    expect(manifest).toBeNull()
    expect(missing.join(' ')).toMatch(/sig/)
  })

  it('prefers the setup.exe matching the version when several exist', () => {
    const stale = 'Swarmterm_0.1.0_x64-setup.exe'
    const { manifest } = buildManifest({
      ...base,
      assetNames: [stale, `${stale}.sig`, WIN, `${WIN}.sig`],
      signatures: { [`${stale}.sig`]: 'old', [`${WIN}.sig`]: 'new' }
    })
    expect(manifest.platforms['windows-x86_64'].signature).toBe('new')
  })

  it('URL-encodes asset names', () => {
    const { manifest } = buildManifest({
      ...base,
      assetNames: [MAC, `${MAC}.sig`],
      signatures: { [`${MAC}.sig`]: 's' }
    })
    expect(manifest.platforms['darwin-aarch64'].url).toContain(encodeURIComponent(MAC))
  })
})
