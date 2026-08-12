// Assembles the tauri-plugin-updater `latest.json` from a GitHub release's
// asset list. Pure — no I/O — so the mapping rules are unit-testable and the
// publish script stays a thin shell around `gh`.
export const REQUIRED_PLATFORMS = ['darwin-aarch64', 'darwin-x86_64', 'windows-x86_64']

// The *published* download URL. Draft releases hand out ephemeral asset URLs
// that die the moment the release goes public, so the manifest must always
// point at where the asset WILL live, never at where `gh` sees it today.
const downloadUrl = (repo, version, name) =>
  `https://github.com/${repo}/releases/download/v${version}/${encodeURIComponent(name)}`

/** Pick this platform's updater artifact out of the asset list. Prefers the
 *  name embedding the release version so a stale upload can't shadow the
 *  current one. */
function pickArtifact(assetNames, version, matches) {
  const all = assetNames.filter((n) => matches(n) && !n.endsWith('.sig'))
  return all.find((n) => n.includes(`_${version}_`) || n.includes(`_${version}.`)) ?? all[0] ?? null
}

/**
 * @param {object} input
 * @param {string} input.version   e.g. "0.2.0" (no leading v)
 * @param {string} input.notes     release body, verbatim
 * @param {string} input.pubDate   ISO-8601
 * @param {string} input.repo      "owner/name"
 * @param {string[]} input.assetNames  names currently on the release
 * @param {Record<string,string>} input.signatures  sig asset name → content
 * @returns {{ manifest: object|null, platforms: string[], missing: string[] }}
 *   `manifest` is null until at least one platform has both its artifact and
 *   its signature; `missing` names what still blocks the rest.
 */
export function buildManifest({ version, notes, pubDate, repo, assetNames, signatures }) {
  const platforms = {}
  const found = []
  const missing = []

  const wire = (keys, label, matches) => {
    const artifact = pickArtifact(assetNames, version, matches)
    if (!artifact) {
      missing.push(`${label}: updater artifact not uploaded yet`)
      return
    }
    const sig = signatures[`${artifact}.sig`]
    if (!sig) {
      missing.push(`${label}: ${artifact}.sig missing or unreadable`)
      return
    }
    for (const key of keys) {
      platforms[key] = { signature: sig.trim(), url: downloadUrl(repo, version, artifact) }
      found.push(key)
    }
  }

  // The one universal .app.tar.gz serves both mac architectures — the
  // tauri-action convention, which the plugin resolves per running arch.
  wire(['darwin-aarch64', 'darwin-x86_64'], 'macos', (n) => n.endsWith('.app.tar.gz'))
  wire(['windows-x86_64'], 'windows', (n) => /-setup\.exe$/.test(n))

  const manifest = found.length ? { version, notes, pub_date: pubDate, platforms } : null
  return { manifest, platforms: found, missing }
}
