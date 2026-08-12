// Upload this machine's release artifacts to the GitHub draft release for the
// current version and (re)assemble latest.json from whatever the draft holds.
// Idempotent: every upload is --clobber, so re-runs after partial failure are
// safe, and either build machine can run it in any order. The draft is the
// meeting point — machines never copy files to each other, and a draft is
// invisible to `releases/latest`, so installed apps never see a half release.
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
const die = (msg) => {
  console.error(`release-publish: ${msg}`)
  process.exit(1)
}
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...opts })
const gh = (...args) => run('gh', [...args, '--repo', REPO])

const wantPublish = process.argv.includes('--publish')
const version = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8')).version
const tag = `v${version}`

try {
  run('gh', ['auth', 'status'])
} catch {
  die('gh is not authenticated — run: gh auth login')
}
try {
  run('git', ['rev-parse', '--verify', `refs/tags/${tag}`])
} catch {
  die(`git tag ${tag} does not exist — run: git tag ${tag} && git push origin ${tag}`)
}
const tagSha = run('git', ['rev-parse', `${tag}^{commit}`]).trim()
const headSha = run('git', ['rev-parse', 'HEAD']).trim()
if (tagSha !== headSha) {
  console.warn(
    `release-publish: WARNING — ${tag} is not HEAD; you are uploading builds of a different commit than the tag names`
  )
}

// Draft release is created on demand; notes are edited on the web (or via
// `gh release edit`) and flow into latest.json on the next run — including
// the --publish run, so last-minute note edits still land in the manifest.
let isDraft = true
try {
  isDraft = JSON.parse(gh('release', 'view', tag, '--json', 'isDraft')).isDraft
} catch {
  gh('release', 'create', tag, '--draft', '--title', tag, '--notes', '')
}
if (!isDraft && !wantPublish) {
  console.warn(`release-publish: ${tag} is already public — uploads will hit a live release`)
}

// This platform's artifacts, wherever the local build put them.
const mac = 'src-tauri/target/universal-apple-darwin/release/bundle'
const win = 'src-tauri/target/release/bundle/nsis'
const globDmg = (dir) =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.dmg')).map((f) => join(dir, f)) : []
const candidates =
  process.platform === 'darwin'
    ? [
        ...globDmg(`${mac}/dmg`),
        `${mac}/macos/Swarmterm.app.tar.gz`,
        `${mac}/macos/Swarmterm.app.tar.gz.sig`
      ]
    : [`${win}/Swarmterm_${version}_x64-setup.exe`, `${win}/Swarmterm_${version}_x64-setup.exe.sig`]
const local = candidates.filter((p) => existsSync(p))
if (local.length === 0) {
  console.warn('release-publish: no local artifacts found — refreshing latest.json only')
} else {
  console.log(`==> uploading ${local.length} asset(s) to ${tag}`)
  gh('release', 'upload', tag, ...local, '--clobber')
}

// Rebuild latest.json from the release's CURRENT asset list. Signature
// contents live inside the .sig assets and this machine only has its own
// platform's on disk, so pull them all down.
const assetNames = JSON.parse(gh('release', 'view', tag, '--json', 'assets')).assets.map(
  (a) => a.name
)
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
