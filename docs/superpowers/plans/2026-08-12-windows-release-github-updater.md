# Windows Release + GitHub Auto-Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Windows NSIS builds alongside the existing macOS releases and let installed apps on both platforms self-update from GitHub Releases, per `docs/superpowers/specs/2026-08-12-windows-release-github-updater-design.md`.

**Architecture:** `tauri-plugin-updater` with minisign-signed artifacts; two local build machines (mac + Windows) meet on a GitHub **draft release** via an idempotent `release:publish` script that assembles `latest.json`; a pure-TS state machine drives a bottom-left toast in the renderer.

**Tech Stack:** Tauri 2 (`tauri-plugin-updater`, `tauri-plugin-process`), React 19 + zustand, Node scripts over `gh` CLI, PowerShell (Windows build wrapper), Vitest.

## Global Constraints

- TypeScript strict (`noUnusedLocals`, `noUnusedParameters`); dead code fails `npx tsc --noEmit`.
- TDD for pure logic: test file first, beside the module. Pure logic never imports React or Tauri APIs.
- `src/tauri/*` is the ONLY IPC surface — components never import `@tauri-apps/*` directly.
- Comments explain *why*, not *what*; match density of `pty.rs` / `terminal-registry.ts`.
- All docs in English. README untouched (high-level only — user rule).
- Platform code behind `#[cfg(...)]` (Rust) / runtime checks (TS).
- Before claiming done: `npm test`, `npx tsc --noEmit`, `cargo test` (from `src-tauri/`), `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`.
- Secrets never in the repo: private key + password live in `~/Developer/apple-signing/` and `.env.release` (gitignored).
- Updater endpoint (verbatim): `https://github.com/duongducnguyen/swarmterm/releases/latest/download/latest.json`.
- `latest.json` platform keys (verbatim): `darwin-aarch64`, `darwin-x86_64` (both → the one universal `.app.tar.gz`), `windows-x86_64` (→ the NSIS `.exe`).

---

### Task 1: Signing key + updater plugin plumbing (Rust/config)

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `package.json` (deps only)
- Modify: `.env.release.example`

**Interfaces:**
- Produces: updater + process plugins registered; `createUpdaterArtifacts: true`; pubkey baked into config. Later tasks rely on `@tauri-apps/plugin-updater` / `@tauri-apps/plugin-process` being installed.

- [ ] **Step 1: Generate the minisign keypair (one-time, outside repo)**

```bash
PW="$(openssl rand -base64 24)"
npx tauri signer generate -w ~/Developer/apple-signing/swarmterm-updater.key -p "$PW"
# Persist the password next to the key so one backup captures both:
printf '%s\n' "$PW" > ~/Developer/apple-signing/swarmterm-updater.key.password
chmod 600 ~/Developer/apple-signing/swarmterm-updater.key*
cat ~/Developer/apple-signing/swarmterm-updater.key.pub   # → pubkey for Step 2
```

Append to the local `.env.release` (gitignored — verify `git check-ignore .env.release` says so first):

```bash
TAURI_SIGNING_PRIVATE_KEY=/Users/duongducnguyen/Developer/apple-signing/swarmterm-updater.key
TAURI_SIGNING_PRIVATE_KEY_PASSWORD=<the generated password>
```

- [ ] **Step 2: Configure `tauri.conf.json`**

Add to `bundle`: `"createUpdaterArtifacts": true`. Replace `"plugins": {}` with:

```json
"plugins": {
  "updater": {
    "pubkey": "<content of swarmterm-updater.key.pub, one line>",
    "endpoints": [
      "https://github.com/duongducnguyen/swarmterm/releases/latest/download/latest.json"
    ],
    "windows": { "installMode": "passive" }
  }
}
```

- [ ] **Step 3: Add Rust deps and register plugins**

`src-tauri/Cargo.toml` `[dependencies]`:

```toml
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
```

`src-tauri/src/lib.rs`, after `.plugin(tauri_plugin_opener::init())`:

```rust
.plugin(tauri_plugin_updater::Builder::new().build())
.plugin(tauri_plugin_process::init())
```

- [ ] **Step 4: Grant capabilities**

In `src-tauri/capabilities/default.json` `permissions`, add `"updater:default"` and `"process:default"`. (If `tauri build` rejects `process:default`, use `"process:allow-restart"` — the only call we make.)

- [ ] **Step 5: Install JS plugin packages**

```bash
npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process
```

- [ ] **Step 6: Verify compilation**

Run: `cd src-tauri && cargo test` — expect green (plugins add no logic). Run `npx tsc --noEmit` — green.

- [ ] **Step 7: Update `.env.release.example`**

Append with provenance comments (same voice as existing entries):

```bash
# Updater signing (minisign) — generated once with `npx tauri signer generate`.
# The PRIVATE key and its password live outside the repo; losing either
# permanently strands every shipped app (they can never accept an update
# again). The same key must be present on every release machine.
TAURI_SIGNING_PRIVATE_KEY=
TAURI_SIGNING_PRIVATE_KEY_PASSWORD=
```

- [ ] **Step 8: Commit**

```bash
git add src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/capabilities/default.json package.json package-lock.json .env.release.example
git commit -m "feat(updater): wire tauri-plugin-updater + signing key config"
```

---

### Task 2: `latest.json` assembly — pure module (TDD)

**Files:**
- Create: `scripts/release/manifest.mjs`
- Test: `scripts/release/manifest.test.mjs`

Plain `.mjs` (not `src/lib/*.ts`): `publish.mjs` runs under Node directly and cannot import TS without a build step. Same TDD bar — Vitest picks up `scripts/**/*.test.mjs` with the default include glob (verify with `npx vitest run scripts/release` in Step 2; if the glob misses, add `test.include` to `vite.config.ts` covering both `src` and `scripts`).

**Interfaces:**
- Produces (consumed by Task 3):

```js
export const REQUIRED_PLATFORMS = ['darwin-aarch64', 'darwin-x86_64', 'windows-x86_64']
/** ({version, notes, pubDate, repo, assetNames, signatures}) →
 *  { manifest: object|null, platforms: string[], missing: string[] }
 *  - assetNames: string[] of asset file names currently on the release
 *  - signatures: Record<sigAssetName, sigFileContent>
 *  - URLs are the *published* form:
 *    https://github.com/<repo>/releases/download/v<version>/<encoded name>
 *    (draft asset URLs die on publish — never use them)
 *  - manifest is null when no platform is complete. */
export function buildManifest(input)
```

- [ ] **Step 1: Write the failing tests**

```js
// scripts/release/manifest.test.mjs
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run scripts/release` — expect FAIL (module not found). If instead "no test files found", add to `vite.config.ts`: `test: { include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'] }` and re-run.

- [ ] **Step 3: Implement `manifest.mjs`**

```js
// Assembles the tauri-plugin-updater `latest.json` from a GitHub release's
// asset list. Pure — no I/O — so the mapping rules are unit-testable and the
// publish script stays a thin shell around `gh`.
export const REQUIRED_PLATFORMS = ['darwin-aarch64', 'darwin-x86_64', 'windows-x86_64']

const downloadUrl = (repo, version, name) =>
  `https://github.com/${repo}/releases/download/v${version}/${encodeURIComponent(name)}`

/** Pick this platform's updater artifact out of the asset list. Prefers the
 *  name embedding the release version so a stale upload can't shadow the
 *  current one. */
function pickArtifact(assetNames, version, matches) {
  const all = assetNames.filter((n) => matches(n) && !n.endsWith('.sig'))
  return all.find((n) => n.includes(`_${version}_`) || n.includes(`_${version}.`)) ?? all[0] ?? null
}

export function buildManifest({ version, notes, pubDate, repo, assetNames, signatures }) {
  const platforms = {}
  const found = []
  const missing = []

  const wire = (keys, label, matches) => {
    const artifact = pickArtifact(assetNames, version, matches)
    if (!artifact) return missing.push(`${label}: updater artifact not uploaded yet`)
    const sig = signatures[`${artifact}.sig`]
    if (!sig) return missing.push(`${label}: ${artifact}.sig missing or unreadable`)
    for (const key of keys) {
      platforms[key] = { signature: sig.trim(), url: downloadUrl(repo, version, artifact) }
      found.push(key)
    }
  }

  // The one universal .app.tar.gz serves both mac architectures — the
  // tauri-action convention the plugin resolves against.
  wire(['darwin-aarch64', 'darwin-x86_64'], 'macos', (n) => n.endsWith('.app.tar.gz'))
  wire(['windows-x86_64'], 'windows', (n) => /-setup\.exe$/.test(n))

  const manifest = found.length
    ? { version, notes, pub_date: pubDate, platforms }
    : null
  return { manifest, platforms: found, missing }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run scripts/release` — expect 5 passing. Then `npm test` — whole suite green.

- [ ] **Step 5: Commit**

```bash
git add scripts/release/manifest.mjs scripts/release/manifest.test.mjs vite.config.ts
git commit -m "feat(release): pure latest.json assembly with tests"
```

---

### Task 3: `publish.mjs` + `bump-version.mjs` + npm scripts

**Files:**
- Create: `scripts/release/publish.mjs`
- Create: `scripts/release/bump-lib.mjs`
- Test: `scripts/release/bump-lib.test.mjs`
- Create: `scripts/bump-version.mjs`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: `buildManifest`, `REQUIRED_PLATFORMS` from `./manifest.mjs` (Task 2).
- Produces: `npm run release:publish [-- --publish]`, `npm run bump -- <x.y.z>`.

- [ ] **Step 1: Write failing tests for the pure bump transforms**

```js
// scripts/release/bump-lib.test.mjs
import { describe, expect, it } from 'vitest'
import { bumpCargoLock, bumpCargoToml, bumpJson } from './bump-lib.mjs'

describe('bumpCargoToml', () => {
  it('rewrites only the [package] version', () => {
    const toml = '[package]\nname = "swarmterm"\nversion = "0.1.0"\n\n[dependencies]\nserde = { version = "1" }\n'
    const out = bumpCargoToml(toml, '0.2.0')
    expect(out).toContain('version = "0.2.0"')
    expect(out).toContain('serde = { version = "1" }')
  })
})

describe('bumpCargoLock', () => {
  it('rewrites only the swarmterm package block', () => {
    const lock = '[[package]]\nname = "serde"\nversion = "1.0.0"\n\n[[package]]\nname = "swarmterm"\nversion = "0.1.0"\n'
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
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run scripts/release` → FAIL (bump-lib not found).

- [ ] **Step 3: Implement `bump-lib.mjs`**

```js
// Text-level version rewrites. String surgery instead of parse/serialize so
// untouched lines keep their exact formatting (Cargo.lock is machine-written;
// a wholesale re-serialize would make the diff unreviewable).
export const bumpJson = (text, version) =>
  text.replace(/^(\s*"version":\s*")[^"]+(")/m, `$1${version}$2`)

export const bumpCargoToml = (text, version) =>
  text.replace(/^(version\s*=\s*")[^"]+(")/m, `$1${version}$2`)

export const bumpCargoLock = (text, version) =>
  text.replace(/(\[\[package\]\]\nname = "swarmterm"\nversion = ")[^"]+(")/, `$1${version}$2`)
```

(Assumption pinned by the test: in `Cargo.toml`, `[package]` is the first table so its `version` line is the first match; `Cargo.lock` blocks are exactly `[[package]]\nname\nversion` — true for lockfile v3/v4.)

- [ ] **Step 4: Run to verify pass** — `npx vitest run scripts/release` → green.

- [ ] **Step 5: Implement `scripts/bump-version.mjs`**

```js
// Bumps the version everywhere it is duplicated, then verifies agreement.
// Usage: npm run bump -- 0.2.0
import { readFileSync, writeFileSync } from 'node:fs'
import { bumpCargoLock, bumpCargoToml, bumpJson } from './release/bump-lib.mjs'

const version = process.argv[2]
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('usage: npm run bump -- <x.y.z>')
  process.exit(1)
}

const edits = [
  ['package.json', bumpJson],
  ['src-tauri/tauri.conf.json', bumpJson],
  ['src-tauri/Cargo.toml', bumpCargoToml],
  ['src-tauri/Cargo.lock', bumpCargoLock]
]
for (const [file, fn] of edits) writeFileSync(file, fn(readFileSync(file, 'utf8'), version))

// Trust nothing: re-read and assert every copy agrees before the tag is cut.
const read = (f) => readFileSync(f, 'utf8')
const versions = [
  JSON.parse(read('package.json')).version,
  JSON.parse(read('src-tauri/tauri.conf.json')).version,
  read('src-tauri/Cargo.toml').match(/^version\s*=\s*"([^"]+)"/m)[1],
  read('src-tauri/Cargo.lock').match(/name = "swarmterm"\nversion = "([^"]+)"/)[1]
]
if (versions.some((v) => v !== version)) {
  console.error(`bump: files disagree after write: ${versions.join(', ')}`)
  process.exit(1)
}
console.log(`bump: all four files at ${version} — next: git commit, git tag v${version}`)
```

- [ ] **Step 6: Implement `scripts/release/publish.mjs`**

```js
// Upload this machine's release artifacts to the GitHub draft release for the
// current version and (re)assemble latest.json from whatever the draft holds.
// Idempotent: every upload is --clobber, so re-runs after partial failure are
// safe, and either build machine can run it in any order. The draft is the
// meeting point — machines never copy files to each other.
//
//   npm run release:publish              upload + refresh latest.json
//   npm run release:publish -- --publish also flip the draft public (refuses
//                                        while any platform is missing)
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { REQUIRED_PLATFORMS, buildManifest } from './manifest.mjs'

const REPO = 'duongducnguyen/swarmterm'
const die = (msg) => { console.error(`release-publish: ${msg}`); process.exit(1) }
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts })
const gh = (...args) => run('gh', [...args, '--repo', REPO])

const wantPublish = process.argv.includes('--publish')
const version = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).version
const tag = `v${version}`

try { run('gh', ['auth', 'status']) } catch { die('gh is not authenticated — run: gh auth login') }
try { run('git', ['rev-parse', '--verify', `refs/tags/${tag}`]) } catch { die(`git tag ${tag} does not exist — run: git tag ${tag} && git push origin ${tag}`) }
const tagSha = run('git', ['rev-parse', `${tag}^{commit}`]).trim()
const headSha = run('git', ['rev-parse', 'HEAD']).trim()
if (tagSha !== headSha) console.warn(`release-publish: WARNING — ${tag} is not HEAD; building from a different commit than you are tagging`)

// Draft release is created on demand; notes are edited on the web (or later
// via gh release edit) and flow into latest.json at the next run.
let view
try { view = JSON.parse(gh('release', 'view', tag, '--json', 'assets,isDraft,body,createdAt')) }
catch {
  gh('release', 'create', tag, '--draft', '--title', tag, '--notes', '')
  view = { assets: [], isDraft: true, body: '', createdAt: new Date().toISOString() }
}
if (!view.isDraft && !wantPublish) console.warn(`release-publish: ${tag} is already public — uploads will hit a live release`)

// This platform's artifacts, wherever the local build put them.
const mac = 'src-tauri/target/universal-apple-darwin/release/bundle'
const win = 'src-tauri/target/release/bundle/nsis'
const candidates = process.platform === 'darwin'
  ? [
      ...globDmg(`${mac}/dmg`),
      `${mac}/macos/Swarmterm.app.tar.gz`,
      `${mac}/macos/Swarmterm.app.tar.gz.sig`
    ]
  : [
      `${win}/Swarmterm_${version}_x64-setup.exe`,
      `${win}/Swarmterm_${version}_x64-setup.exe.sig`
    ]
function globDmg(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((f) => f.endsWith('.dmg')).map((f) => join(dir, f))
}
const local = candidates.filter((p) => existsSync(p))
if (local.length === 0) {
  console.warn('release-publish: no local artifacts found — refreshing latest.json only')
} else {
  console.log(`==> uploading ${local.length} asset(s) to draft ${tag}`)
  gh('release', 'upload', tag, ...local, '--clobber')
}

// Rebuild latest.json from the release's CURRENT asset list. Signature
// contents live in the .sig assets (this machine only has its own platform's
// .sig on disk), so pull them all down.
const assetNames = JSON.parse(gh('release', 'view', tag, '--json', 'assets')).assets.map((a) => a.name)
const sigDir = mkdtempSync(join(tmpdir(), 'swarmterm-sigs-'))
const signatures = {}
if (assetNames.some((n) => n.endsWith('.sig'))) {
  gh('release', 'download', tag, '--pattern', '*.sig', '--dir', sigDir)
  for (const f of readdirSync(sigDir)) signatures[f] = readFileSync(join(sigDir, f), 'utf8')
}
const fresh = JSON.parse(gh('release', 'view', tag, '--json', 'body,createdAt'))
const { manifest, platforms, missing } = buildManifest({
  version,
  notes: fresh.body ?? '',
  pubDate: fresh.createdAt ?? new Date().toISOString(),
  repo: REPO,
  assetNames,
  signatures
})
rmSync(sigDir, { recursive: true, force: true })

for (const m of missing) console.log(`    still missing — ${m}`)
if (!manifest) die('no platform is complete yet; nothing to write into latest.json')

const manifestPath = join(mkdtempSync(join(tmpdir(), 'swarmterm-manifest-')), 'latest.json')
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
gh('release', 'upload', tag, manifestPath, '--clobber')
console.log(`==> latest.json refreshed (${platforms.join(', ')})`)

if (wantPublish) {
  const absent = REQUIRED_PLATFORMS.filter((p) => !platforms.includes(p))
  if (absent.length) die(`refusing to publish — missing platforms: ${absent.join(', ')}`)
  gh('release', 'edit', tag, '--draft=false')
  console.log(`==> ${tag} is live: https://github.com/${REPO}/releases/tag/${tag}`)
} else {
  console.log('==> draft only; run with -- --publish when every platform is up')
}
```

- [ ] **Step 7: Add npm scripts**

In `package.json` `scripts`:

```json
"bump": "node scripts/bump-version.mjs",
"release:publish": "node scripts/release/publish.mjs",
"release:win": "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release-windows.ps1"
```

- [ ] **Step 8: Sanity-run the failure paths**

- `npm run bump -- not-a-version` → usage error, exit 1.
- `npm run bump -- 0.1.0` → "all four files at 0.1.0", `git status` clean (no-op rewrite).
- `npm run release:publish` with no `v0.1.0` tag → dies with the tag hint.

- [ ] **Step 9: Commit**

```bash
git add scripts/release/publish.mjs scripts/release/bump-lib.mjs scripts/release/bump-lib.test.mjs scripts/bump-version.mjs package.json
git commit -m "feat(release): publish + bump scripts around GitHub draft releases"
```

---

### Task 4: Updater state machine — pure lib (TDD)

**Files:**
- Create: `src/lib/updater-flow.ts`
- Test: `src/lib/updater-flow.test.ts`

**Interfaces:**
- Produces (consumed by Task 5's store and Task 6's toast):

```ts
export type UpdaterState =
  | { phase: 'idle' }
  | { phase: 'checking'; manual: boolean }
  | { phase: 'available'; version: string; notes?: string; error?: string }
  | { phase: 'downloading'; version: string; downloaded: number; total?: number }
  | { phase: 'ready'; version: string }
  | { phase: 'upToDate' }
  | { phase: 'error'; message: string }

export type UpdaterEvent =
  | { type: 'check'; manual: boolean }
  | { type: 'found'; version: string; notes?: string }
  | { type: 'none' }
  | { type: 'checkFailed'; message: string }
  | { type: 'downloadStart' }
  | { type: 'progress'; chunk: number; total?: number }
  | { type: 'downloaded' }
  | { type: 'downloadFailed'; message: string }
  | { type: 'dismiss' }

export const STARTUP_CHECK_DELAY_MS = 5_000
export function reduceUpdater(state: UpdaterState, ev: UpdaterEvent): UpdaterState
/** Percent 0–100, or null while the total is unknown (indeterminate bar). */
export function progressPercent(state: UpdaterState): number | null
```

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/updater-flow.test.ts
import { describe, expect, it } from 'vitest'
import {
  progressPercent,
  reduceUpdater,
  type UpdaterState
} from './updater-flow'

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
    expect(progressPercent({ phase: 'downloading', version: 'v', downloaded: 50, total: 200 })).toBe(25)
    expect(progressPercent({ phase: 'idle' })).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/updater-flow` → FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/updater-flow.ts`**

```ts
/**
 * Pure state machine for the in-app updater. The rules that matter live here,
 * not in the store or the toast:
 *  - a startup ("silent") check must never nag — up-to-date and failures both
 *    collapse back to idle; only a manual tray check surfaces them,
 *  - one flight at a time — check/download events during the wrong phase are
 *    ignored rather than queued,
 *  - a failed download falls back to `available` with the error attached, so
 *    retry is just clicking Download again.
 */
export type UpdaterState =
  | { phase: 'idle' }
  | { phase: 'checking'; manual: boolean }
  | { phase: 'available'; version: string; notes?: string; error?: string }
  | { phase: 'downloading'; version: string; downloaded: number; total?: number }
  | { phase: 'ready'; version: string }
  | { phase: 'upToDate' }
  | { phase: 'error'; message: string }

export type UpdaterEvent =
  | { type: 'check'; manual: boolean }
  | { type: 'found'; version: string; notes?: string }
  | { type: 'none' }
  | { type: 'checkFailed'; message: string }
  | { type: 'downloadStart' }
  | { type: 'progress'; chunk: number; total?: number }
  | { type: 'downloaded' }
  | { type: 'downloadFailed'; message: string }
  | { type: 'dismiss' }

export const STARTUP_CHECK_DELAY_MS = 5_000

export function reduceUpdater(state: UpdaterState, ev: UpdaterEvent): UpdaterState {
  switch (ev.type) {
    case 'check':
      // Never interrupt an in-flight check or download; a manual check may
      // restart from any settled phase (idle, available, upToDate, error…).
      if (state.phase === 'checking' || state.phase === 'downloading') return state
      return { phase: 'checking', manual: ev.manual }
    case 'found':
      if (state.phase !== 'checking') return state
      return { phase: 'available', version: ev.version, notes: ev.notes }
    case 'none':
      if (state.phase !== 'checking') return state
      return state.manual ? { phase: 'upToDate' } : { phase: 'idle' }
    case 'checkFailed':
      if (state.phase !== 'checking') return state
      return state.manual ? { phase: 'error', message: ev.message } : { phase: 'idle' }
    case 'downloadStart':
      if (state.phase !== 'available') return state
      return { phase: 'downloading', version: state.version, downloaded: 0 }
    case 'progress':
      if (state.phase !== 'downloading') return state
      return {
        ...state,
        downloaded: state.downloaded + ev.chunk,
        total: ev.total ?? state.total
      }
    case 'downloaded':
      if (state.phase !== 'downloading') return state
      return { phase: 'ready', version: state.version }
    case 'downloadFailed':
      if (state.phase !== 'downloading') return state
      return { phase: 'available', version: state.version, error: ev.message }
    case 'dismiss':
      // Downloads have no cancel path in the plugin; everything else clears.
      return state.phase === 'downloading' ? state : { phase: 'idle' }
  }
}

export function progressPercent(state: UpdaterState): number | null {
  if (state.phase !== 'downloading' || state.total === undefined || state.total <= 0) return null
  return Math.min(100, Math.round((state.downloaded / state.total) * 100))
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/lib/updater-flow` → green; `npx tsc --noEmit` → green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/updater-flow.ts src/lib/updater-flow.test.ts
git commit -m "feat(updater): pure update-flow state machine"
```

---

### Task 5: IPC surface + zustand store

**Files:**
- Create: `src/tauri/updater.ts`
- Create: `src/store/updater-store.ts`

**Interfaces:**
- Consumes: `reduceUpdater`, `UpdaterState` (Task 4); plugin packages (Task 1).
- Produces (consumed by Task 6):

```ts
// src/tauri/updater.ts
export interface FoundUpdate { version: string; notes?: string }
export type ProgressEvent =
  | { kind: 'started'; total?: number }
  | { kind: 'chunk'; length: number }
  | { kind: 'finished' }
export function checkForUpdate(): Promise<FoundUpdate | null>
export function downloadAndInstall(onProgress: (e: ProgressEvent) => void): Promise<void>
export function restartApp(): Promise<void>
export function onUpdateCheckRequested(cb: () => void): Promise<() => void>

// src/store/updater-store.ts
export interface UpdaterStore {
  state: UpdaterState
  check: (manual: boolean) => Promise<void>
  download: () => Promise<void>
  restart: () => Promise<void>
  dismiss: () => void
}
export const useUpdaterStore: UseBoundStore<StoreApi<UpdaterStore>>
```

- [ ] **Step 1: Implement `src/tauri/updater.ts`**

```ts
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { listen } from '@tauri-apps/api/event'

export interface FoundUpdate {
  version: string
  notes?: string
}

export type ProgressEvent =
  | { kind: 'started'; total?: number }
  | { kind: 'chunk'; length: number }
  | { kind: 'finished' }

// The plugin's Update object carries the download handle; it lives here (not
// in the store) so React state stays serializable and the IPC surface stays
// the only module touching @tauri-apps/*.
let pending: Update | null = null

export async function checkForUpdate(): Promise<FoundUpdate | null> {
  const update = await check()
  pending = update
  if (!update) return null
  return { version: update.version, notes: update.body ?? undefined }
}

/** On Windows (NSIS, passive mode) the returned promise never resolves — the
 *  installer takes over and the app exits mid-call. Callers must not sequence
 *  anything after it that matters on Windows. */
export async function downloadAndInstall(
  onProgress: (e: ProgressEvent) => void
): Promise<void> {
  if (!pending) throw new Error('no update staged — call checkForUpdate first')
  await pending.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        onProgress({ kind: 'started', total: event.data.contentLength })
        break
      case 'Progress':
        onProgress({ kind: 'chunk', length: event.data.chunkLength })
        break
      case 'Finished':
        onProgress({ kind: 'finished' })
        break
    }
  })
}

export const restartApp = (): Promise<void> => relaunch()

/** Tray → renderer: the "Check for Updates…" menu item. */
export function onUpdateCheckRequested(cb: () => void): Promise<() => void> {
  return listen('updater:check-requested', () => cb())
}
```

- [ ] **Step 2: Implement `src/store/updater-store.ts`**

```ts
import { create } from 'zustand'
import { reduceUpdater, type UpdaterState } from '@/lib/updater-flow'
import {
  checkForUpdate,
  downloadAndInstall,
  restartApp
} from '@/tauri/updater'

export interface UpdaterStore {
  state: UpdaterState
  check: (manual: boolean) => Promise<void>
  download: () => Promise<void>
  restart: () => Promise<void>
  dismiss: () => void
}

/**
 * Thin bridge: every transition funnels through the pure reducer so the
 * "silent startup / talkative manual" rules stay unit-tested in lib. The
 * reducer also acts as the concurrency guard — a dispatch that the current
 * phase forbids is a no-op, so double-clicks and overlapping checks resolve
 * here without flags.
 */
export const useUpdaterStore = create<UpdaterStore>((set, get) => {
  const dispatch = (ev: Parameters<typeof reduceUpdater>[1]) =>
    set({ state: reduceUpdater(get().state, ev) })

  return {
    state: { phase: 'idle' },
    check: async (manual) => {
      const before = get().state
      dispatch({ type: 'check', manual })
      if (get().state === before) return // reducer refused: already busy
      try {
        const found = await checkForUpdate()
        if (found) dispatch({ type: 'found', version: found.version, notes: found.notes })
        else dispatch({ type: 'none' })
      } catch (e) {
        dispatch({ type: 'checkFailed', message: String(e) })
      }
    },
    download: async () => {
      const before = get().state
      dispatch({ type: 'downloadStart' })
      if (get().state === before) return
      try {
        await downloadAndInstall((ev) => {
          if (ev.kind === 'started') dispatch({ type: 'progress', chunk: 0, total: ev.total })
          else if (ev.kind === 'chunk') dispatch({ type: 'progress', chunk: ev.length })
        })
        // Windows never reaches here (installer exits the app); on macOS the
        // new bundle is staged and wants a relaunch.
        dispatch({ type: 'downloaded' })
      } catch (e) {
        dispatch({ type: 'downloadFailed', message: String(e) })
      }
    },
    restart: () => restartApp(),
    dismiss: () => dispatch({ type: 'dismiss' })
  }
})
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit` green; `npm test` green.

- [ ] **Step 4: Commit**

```bash
git add src/tauri/updater.ts src/store/updater-store.ts
git commit -m "feat(updater): IPC surface + store bridging the pure flow"
```

---

### Task 6: Toast UI + App wiring + tray menu item

**Files:**
- Create: `src/components/UpdateToast.tsx`
- Modify: `src/App.tsx` (mount toast; startup check; tray-event listener)
- Modify: `src-tauri/src/tray.rs` (menu item + emit)

**Interfaces:**
- Consumes: `useUpdaterStore` (Task 5), `progressPercent`, `STARTUP_CHECK_DELAY_MS` (Task 4), `onUpdateCheckRequested` (Task 5).

- [ ] **Step 1: Tray menu item (Rust)**

In `tray.rs::setup_tray`, add between `show` and `quit_item`:

```rust
let check_updates =
    MenuItemBuilder::with_id("check-updates", "Check for Updates…").build(app)?;
```

Include it in the menu: `.items(&[&show, &check_updates, &quit_item])`. In `on_menu_event`, add an arm (needs `use tauri::Emitter;`):

```rust
"check-updates" => {
    // Surface the window first: the result renders as an in-app toast, and a
    // toast inside a hidden window is a check that never happened.
    show_main(app);
    let _ = app.emit("updater:check-requested", ());
}
```

- [ ] **Step 2: Verify Rust** — `cd src-tauri && cargo test && cargo fmt --check && cargo clippy --all-targets -- -D warnings` → green.

- [ ] **Step 3: `UpdateToast.tsx`**

VS Code-notification look with existing tokens and `components/ui/button`. Anchored **bottom-left**: the native preview webview paints over all DOM on the right column, and making the toast an "overlay" (hiding the preview) would be worse than moving the toast. `data-focus-return` hands focus back to the terminal after clicks (repo focus gotcha). Check the navbar's width at runtime; if `left-3` collides with its bottom items use `left-14`.

```tsx
import { Button } from '@/components/ui/button'
import { progressPercent } from '@/lib/updater-flow'
import { useUpdaterStore } from '@/store/updater-store'

/** Bottom-left so the native preview webview (right column) can never paint
 *  over it; deliberately NOT an overlay in the overlay-watch sense — an
 *  update nag must not blank the user's preview. */
export function UpdateToast() {
  const state = useUpdaterStore((s) => s.state)
  const { download, restart, dismiss } = useUpdaterStore.getState()

  if (state.phase === 'idle' || state.phase === 'checking') return null

  const pct = progressPercent(state)
  return (
    <div
      data-focus-return
      className="fixed bottom-3 left-3 z-50 w-80 rounded-md border border-border bg-popover p-3 text-sm text-popover-foreground shadow-lg"
    >
      {state.phase === 'available' && (
        <>
          <div className="font-medium">Update available: v{state.version}</div>
          {state.error && (
            <div className="mt-1 text-xs text-destructive">Download failed: {state.error}</div>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={dismiss}>
              Dismiss
            </Button>
            <Button size="sm" onClick={() => void download()}>
              Download
            </Button>
          </div>
        </>
      )}
      {state.phase === 'downloading' && (
        <>
          <div className="font-medium">Downloading v{state.version}…</div>
          <div className="mt-2 h-1 overflow-hidden rounded bg-muted">
            <div
              className={pct === null ? 'h-full w-1/3 animate-pulse bg-primary' : 'h-full bg-primary'}
              style={pct === null ? undefined : { width: `${pct}%` }}
            />
          </div>
        </>
      )}
      {state.phase === 'ready' && (
        <>
          <div className="font-medium">v{state.version} is ready</div>
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={dismiss}>
              Later
            </Button>
            <Button size="sm" onClick={() => void restart()}>
              Restart to update
            </Button>
          </div>
        </>
      )}
      {state.phase === 'upToDate' && (
        <>
          <div className="font-medium">Swarmterm is up to date</div>
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="ghost" onClick={dismiss}>
              OK
            </Button>
          </div>
        </>
      )}
      {state.phase === 'error' && (
        <>
          <div className="font-medium">Update check failed</div>
          <div className="mt-1 break-words text-xs text-muted-foreground">{state.message}</div>
          <div className="mt-2 flex justify-end">
            <Button size="sm" variant="ghost" onClick={dismiss}>
              Dismiss
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Wire into `App.tsx`**

Next to the existing module-singleton wiring effects (near `wirePreviewEvents`, ~line 466):

```tsx
// One silent update check per launch, a few seconds after boot so it never
// competes with pty spawn; failures are swallowed by the flow reducer.
useEffect(() => {
  const t = window.setTimeout(
    () => void useUpdaterStore.getState().check(false),
    STARTUP_CHECK_DELAY_MS
  )
  return () => window.clearTimeout(t)
}, [])

// Tray "Check for Updates…" → manual check (talkative: reports up-to-date
// and failures in the toast).
useEffect(() => {
  const unlisten = onUpdateCheckRequested(() => void useUpdaterStore.getState().check(true))
  return () => void unlisten.then((fn) => fn())
}, [])
```

Imports: `useUpdaterStore` from `@/store/updater-store`, `STARTUP_CHECK_DELAY_MS` from `@/lib/updater-flow`, `onUpdateCheckRequested` from `@/tauri/updater`, `UpdateToast` from `@/components/UpdateToast`. Render `<UpdateToast />` as a last child of the root container (it is `position: fixed`, placement in the tree only matters for readability).

- [ ] **Step 5: Verify** — `npx tsc --noEmit`, `npm test` → green. `npm run tauri dev` briefly: tray shows "Check for Updates…", clicking it produces the toast within ~seconds ("up to date" or "check failed" — both prove the pipeline; there is no release yet, so a `Could not fetch a valid release JSON`-style error is the expected success signal here).

- [ ] **Step 6: Commit**

```bash
git add src/components/UpdateToast.tsx src/App.tsx src-tauri/src/tray.rs
git commit -m "feat(updater): toast UI, startup check, tray menu entry"
```

---

### Task 7: Build scripts — `release-windows.ps1` + `release-macos.sh` extension

**Files:**
- Create: `scripts/release-windows.ps1`
- Modify: `scripts/release-macos.sh`

**Interfaces:**
- Consumes: `.env.release` vars from Task 1.
- Produces: `npm run release:win`; mac script now also guarantees `.app.tar.gz` + `.sig`.

- [ ] **Step 1: Write `scripts/release-windows.ps1`**

```powershell
# Build a Windows release of Swarmterm: NSIS installer + minisign updater
# signature. No Authenticode — SmartScreen's "Unknown publisher" flow is
# accepted and documented in docs/release-windows.md. The updater's trust
# comes from the minisign signature, not from Windows code signing.
#
#   npm run release:win
#
# Credentials come from .env.release (gitignored), same format as macOS.
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Die($msg) {
  Write-Host "release-windows: $msg" -ForegroundColor Red
  exit 1
}

if (Test-Path ".env.release") {
  Get-Content ".env.release" | ForEach-Object {
    if ($_ -match '^\s*(#|$)') { return }
    $name, $value = $_ -split '=', 2
    if ($null -eq $value) { return }
    [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim().Trim('"'), "Process")
  }
}

if (-not $env:TAURI_SIGNING_PRIVATE_KEY) {
  Die "TAURI_SIGNING_PRIVATE_KEY is unset - copy .env.release.example to .env.release"
}
if (-not $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD) {
  Die "TAURI_SIGNING_PRIVATE_KEY_PASSWORD is unset - see .env.release.example"
}
# The variable accepts the key content or a path; only validate paths.
if (($env:TAURI_SIGNING_PRIVATE_KEY -notmatch 'PRIVATE KEY') -and
    -not (Test-Path $env:TAURI_SIGNING_PRIVATE_KEY)) {
  Die "TAURI_SIGNING_PRIVATE_KEY is not a file: $($env:TAURI_SIGNING_PRIVATE_KEY)"
}

$version = (Get-Content "src-tauri/tauri.conf.json" -Raw | ConvertFrom-Json).version
Write-Host "==> building NSIS installer (v$version)"
npm run tauri build -- --bundles nsis
if ($LASTEXITCODE -ne 0) { Die "tauri build failed" }

$setup = "src-tauri/target/release/bundle/nsis/Swarmterm_${version}_x64-setup.exe"
if (-not (Test-Path $setup)) { Die "installer not found: $setup" }
if (-not (Test-Path "$setup.sig")) {
  Die "updater signature not found: $setup.sig - was the build run without the signing key?"
}

Write-Host "==> release OK: $setup"
Write-Host "    next: npm run release:publish"
```

- [ ] **Step 2: Syntax-check the script on this machine**

Run: `pwsh -NoProfile -Command "[scriptblock]::Create((Get-Content -Raw scripts/release-windows.ps1)) | Out-Null; 'parse OK'"` if `pwsh` exists; otherwise rely on review. (Real execution is the user's Windows test.)

- [ ] **Step 3: Extend `scripts/release-macos.sh`**

After the existing `APPLE_SIGNING_IDENTITY` check, add:

```bash
# createUpdaterArtifacts makes every build emit the updater's .app.tar.gz +
# minisign signature; without the key the build itself fails halfway, so fail
# fast and name the fix.
for v in TAURI_SIGNING_PRIVATE_KEY TAURI_SIGNING_PRIVATE_KEY_PASSWORD; do
  [ -n "${!v:-}" ] || die "$v is unset — see .env.release.example (updater signing)"
done
```

After the signature-verification block (before the `if [ "$SMOKE" = 1 ]` exit), add:

```bash
echo "==> verifying updater artifacts"
UPDATER_TGZ="$APP.tar.gz"
[ -f "$UPDATER_TGZ" ]       || die "updater artifact missing: $UPDATER_TGZ"
[ -f "$UPDATER_TGZ.sig" ]   || die "updater signature missing: $UPDATER_TGZ.sig"
```

(`$APP.tar.gz` expands to `…/Swarmterm.app.tar.gz`, which is where the bundler writes it. If the smoke pass (`--bundles app`) turns out not to produce the tar.gz, move this block after the smoke exit and note it in the script comment — full releases are the invariant that matters.)

- [ ] **Step 4: Verify** — `bash -n scripts/release-macos.sh` → parses. Full proof comes in Task 9's smoke run.

- [ ] **Step 5: Commit**

```bash
git add scripts/release-windows.ps1 scripts/release-macos.sh
git commit -m "build(release): windows NSIS script + updater artifact assertions on mac"
```

---

### Task 8: Documentation

**Files:**
- Create: `docs/release-process.md`
- Create: `docs/release-windows.md`
- Modify: `docs/release-macos.md`
- Modify: `docs/user-guide.md`
- Modify: `docs/manual-smoke-tests.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Write `docs/release-process.md`** — the start-here page. Content: the five-step flow diagram from the spec (bump → tag → build per platform → publish per machine → `--publish`); the draft-release-as-meeting-point explanation (idempotent, `--clobber`, drafts invisible to `releases/latest`); `latest.json` anatomy (three platform keys, signatures from `.sig` contents, URLs point at the published tag); **key management** with the bolded warning: *losing `swarmterm-updater.key` or its password permanently strands every shipped app — back both up; the same key must exist on every build machine*; links to the two platform pages. Also: never publish a release without updater artifacts (installed apps would see a manifest 404 until the next good release).

- [ ] **Step 2: Write `docs/release-windows.md`** — one-time setup: Rust (`rustup` MSVC toolchain), Visual Studio Build Tools (C++ workload), Node 20+, `gh` CLI (`gh auth login`), copy `swarmterm-updater.key` from the mac (secure channel — AirDrop/USB, never the repo), `cp .env.release.example .env.release` and fill the two updater vars (Windows paths). Releasing: `npm run release:win` then `npm run release:publish`. A **SmartScreen** section: the build is deliberately unsigned; what the "Windows protected your PC" dialog looks like; users click **More info → Run anyway**; what to say in release notes; adding Authenticode later changes nothing else in this pipeline. Troubleshooting table: missing VS Build Tools (link error), missing signing key (script dies early), `gh` not authenticated.

- [ ] **Step 3: Update `docs/release-macos.md`** — add the two updater vars to the variables table; mention the two extra artifacts (`Swarmterm.app.tar.gz` + `.sig`) in the Releasing section; replace the "Not covered here" paragraph: CI releases remain future work, but Windows builds (`docs/release-windows.md`) and in-app updates (`docs/release-process.md`) are now covered there.

- [ ] **Step 4: Update `docs/user-guide.md`** — new "Updates" section: Swarmterm checks GitHub Releases shortly after launch; a bottom-left notification offers Download, then Restart; tray → "Check for Updates…" checks on demand; nothing is downloaded without consent; offline is silent.

- [ ] **Step 5: Update `docs/manual-smoke-tests.md`** — add an "Updater" checklist: install the previous release; launch → within ~10 s the update toast appears; Download → progress → Restart; app relaunches at the new version (tray → About or `getVersion`); tray "Check for Updates…" on the new build reports up to date; Windows-only: SmartScreen More info → Run anyway path works on a fresh download.

- [ ] **Step 6: Update `CLAUDE.md`** — docs map: add `docs/release-process.md` and `docs/release-windows.md` lines. Gotchas: one short entry, e.g.: *"**Auto-update.** `tauri-plugin-updater` against GitHub Releases (`latest.json` assembled by `scripts/release/publish.mjs` onto a draft release). Updater trust = minisign key in `~/Developer/apple-signing/` — losing it strands every shipped app. The update toast is bottom-left on purpose (native preview webview paints over DOM bottom-right) and is deliberately not an overlay-watch overlay. Windows: `downloadAndInstall` never resolves — the NSIS installer exits the app."*

- [ ] **Step 7: Commit**

```bash
git add docs/release-process.md docs/release-windows.md docs/release-macos.md docs/user-guide.md docs/manual-smoke-tests.md CLAUDE.md
git commit -m "docs: release process, windows release, in-app updates"
```

---

### Task 9: End-to-end verification on this machine

**Files:** none new — this task proves the pipeline.

- [ ] **Step 1: Full gates**

```bash
npm test && npx tsc --noEmit
cd src-tauri && cargo test && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cd ..
```

All green, with output shown.

- [ ] **Step 2: Smoke build with updater artifacts**

Run: `npm run release:mac -- --smoke`
Expected: signed `.app` AND `Swarmterm.app.tar.gz` + `.sig` beside it (this validates `createUpdaterArtifacts` + the new assertions). If the smoke bundle set doesn't emit the tar.gz, apply the Task 7 Step 3 fallback (assert full-pass only) and re-run.

- [ ] **Step 3: Publish dry-run against a throwaway draft**

```bash
git tag v0.1.0                       # current version; local only
npm run release:publish              # uploads smoke artifacts, builds latest.json (mac keys only)
gh release view v0.1.0 --json assets --jq '.assets[].name'   # expect .app.tar.gz, .sig, latest.json
npm run release:publish -- --publish # MUST refuse: windows-x86_64 missing
gh release download v0.1.0 --pattern latest.json --output - | head -30  # eyeball keys/sig/urls
# teardown — draft was never public:
gh release delete v0.1.0 --yes
git tag -d v0.1.0
```

- [ ] **Step 4: Update memory + report**

Final report to the user (Vietnamese) listing what shipped, the backup warning for the key, and the user's Windows test checklist: `release:win`, SmartScreen install, then the first real cross-platform release (`bump` → tag → both builds → publish) and riding an update through on an old install.

---

## Self-review notes

- **Spec coverage:** flow (T3/T7/T9), updater config+key (T1), manifest (T2), scripts (T3/T7), in-app updater (T4/T5/T6), error handling (encoded in T4 reducer + T3 refusals), docs (T8), testing (tests in T2/T3/T4, gates+smoke+dry-run in T9). Spec's `src/lib/release-manifest.ts` became `scripts/release/manifest.mjs` — Node can't import TS without a build step; same TDD bar, documented in T2.
- **Types:** `FoundUpdate`/`ProgressEvent` defined in T5 and consumed only there and T6; `UpdaterState/Event` defined in T4, imported in T5/T6; `buildManifest` signature identical in T2 definition and T3 usage.
- **Placeholders:** none — every script/component is written out in full.
