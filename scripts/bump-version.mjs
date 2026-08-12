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
