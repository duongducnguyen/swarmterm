# macOS release signing: Developer ID + notarization (local)

**Date:** 2026-08-11
**Status:** Approved
**Goal:** Produce a universal `Swarmterm.dmg` that a stranger can download and
open with no Gatekeeper warning — signed with a Developer ID Application
certificate, notarized by Apple, and stapled. Built from a developer machine,
by one command.

## Background

The repo has never been signed. `tauri.conf.json` carries no `bundle.macOS`
block, there is no entitlements file, and `.github/workflows/ci.yml` only runs
tests — it never builds or releases. Every prior build was an unsigned local
`tauri build`, which macOS refuses to open on any machine but the one that
produced it.

Apple-side provisioning is already done (2026-08-11) and verified:

| Item | Value / state |
|---|---|
| Certificate | `Developer ID Application: Duc Nguyen Duong (462FZ9H8C7)`, valid to 2031-08-12 |
| Team ID | `462FZ9H8C7` |
| Private key | in `login.keychain-db`, `codesign` granted permanent access ("Always Allow") |
| Intermediate | `Developer ID Certification Authority (G2)` installed into `login.keychain-db` |
| Notary credentials | App Store Connect API key (`.p8`) + Issuer ID + Key ID, verified with `xcrun notarytool history` |
| Rust targets | `aarch64-apple-darwin`, `x86_64-apple-darwin` |

Two failures were hit during provisioning and both are non-obvious enough to
belong in the shipped docs: a machine with only Command Line Tools (no Xcode)
lacks the G2 intermediate, so `codesign` reports *unable to build chain to
self-signed root* and `security find-identity -v` reports zero identities even
though the certificate is present; and a freshly created private key grants no
tool access, so the first `codesign` run fails with `errSecInternalComponent`
until the keychain prompt is answered with **Always Allow**.

Signing material lives in `~/Developer/apple-signing/` (mode 700), never in the
repo.

## Non-goals

- **GitHub Actions.** Deferred deliberately: a release workflow should cover
  Windows and Linux too, and that is its own design. This spec only guarantees
  the credential set is CI-shaped (plain environment variables, no interactive
  step at build time) so the later workflow is a lift-and-shift.
- **Auto-update.** `tauri-plugin-updater` needs its own minisign keypair,
  `latest.json`, and an endpoint. Separate spec.
- **Mac App Store.** Requires App Sandbox; Swarmterm spawns arbitrary shells
  and binds a loopback port, so it would not survive review.
- **Windows / Linux signing.** Windows needs a separate OV/EV certificate that
  the Apple account does not provide.
- **`.pkg` installers**, custom DMG artwork, and Sparkle-style delta updates.

## Design

### Credential surface

Four environment variables, read by `tauri build` itself — no custom signing
code. Names are Tauri's, unchanged, so the same four become GitHub Secrets
later.

| Variable | Meaning |
|---|---|
| `APPLE_SIGNING_IDENTITY` | Full identity string, e.g. `Developer ID Application: Duc Nguyen Duong (462FZ9H8C7)` |
| `APPLE_API_ISSUER` | App Store Connect Issuer ID (UUID) |
| `APPLE_API_KEY` | Key ID (10 chars) |
| `APPLE_API_KEY_PATH` | Absolute path to `AuthKey_<KeyID>.p8` |

They live in `.env.release` at the repo root — already covered by the `.env*`
rule in `.gitignore`, with `*.p8`, `*.p12`, `*.cer` added explicitly as a
second line of defence. A committed `.env.release.example` documents the names
with empty values.

`APPLE_SIGNING_IDENTITY` is deliberately **not** written into
`tauri.conf.json`: the string embeds one developer's name and team, so
hardcoding it breaks `tauri build` for anyone else who clones the repo.

### Repo changes

**`src-tauri/tauri.conf.json`** — add a `bundle.macOS` block setting
`minimumSystemVersion: "10.15"` (Tauri 2's floor). `hardenedRuntime` defaults
to `true` and is left implicit.

**`src-tauri/Info.plist`** (new) — Tauri merges this file into the generated
bundle plist. It carries `NSDesktopFolderUsageDescription`,
`NSDocumentsFolderUsageDescription`, and `NSDownloadsFolderUsageDescription`.
Shells spawned inside a pane touch those directories, and macOS attributes the
resulting TCC prompt to Swarmterm; without these strings the prompt reads blank
and users decline it.

**`scripts/release-macos.sh`** (new, ~40 lines) — the only new moving part:

1. `set -euo pipefail`; resolve the repo root from `$0`.
2. Source `.env.release` if present (`set -a` / `set +a`).
3. Fail fast with a readable message on any missing variable, on a missing
   `.p8` file, or on a missing `x86_64-apple-darwin` rust target.
4. Build. Default is
   `npm run tauri build -- --target universal-apple-darwin --bundles dmg`.
   With `--smoke` the script switches to `--target aarch64-apple-darwin
   --bundles app` and unsets the three notary variables, which is exactly
   pass 1 below.
5. Run the verification matrix; exit non-zero on the first failure. Under
   `--smoke` only the two `codesign` checks apply — an unnotarized bundle has
   nothing to staple.
6. Print the absolute path of the produced artifact.

**`package.json`** — `"release:mac": "bash scripts/release-macos.sh"`.

**`docs/release-macos.md`** (new, English) — the operator-facing runbook: one-time
Apple setup, the four variables, the two-pass flow, the verification table, and
the error playbook below.

**`docs/manual-smoke-tests.md`** — one new section: install from the `.dmg` on a
machine that has never run Swarmterm, then open a pane, open a web preview, and
run a War Room exchange.

### Entitlements policy: add nothing until proven necessary

No entitlements file ships. Hardened runtime alone is what notarization
requires, and none of Swarmterm's unusual behaviours need an exception for a
non-sandboxed app: spawning shells is ordinary `posix_spawn`, the MCP server
binds loopback (no sandbox to escape), and WKWebView runs JavaScript in its own
system-signed process, so the app needs no JIT entitlement of its own.

If the smoke pass proves otherwise, entitlements are added one at a time
(`com.apple.security.cs.allow-jit`, then
`com.apple.security.cs.disable-library-validation`) via
`bundle.macOS.entitlements`, each with a comment naming the symptom that forced
it. Every added entitlement is another thing Apple's scanner weighs.

### Two-pass release flow

The passes exist because they fail differently and one is 15 minutes slower.

**Pass 1 — hardened-runtime smoke (fast, no notarization).** Build
`aarch64-apple-darwin` with `--bundles app` and only `APPLE_SIGNING_IDENTITY`
set. Tauri signs but skips notarization. Launch the `.app` and exercise the
three subsystems most likely to break under hardened runtime: pty spawn, the
native child webview, and the MCP loopback server. This is the real technical
risk of the change and it must be settled before spending Apple's queue time.

**Pass 2 — real release.** All four variables set; universal target;
`--bundles dmg`. Tauri signs, submits to `notarytool`, waits, staples, and
writes the DMG.

### Verification matrix

The script asserts each of these; a human never eyeballs them.

| Check | Required output |
|---|---|
| `codesign --verify --deep --strict --verbose=2 Swarmterm.app` | `valid on disk`, `satisfies its Designated Requirement` |
| `codesign -dv --verbose=4 Swarmterm.app` | `flags=0x10000(runtime)`, `TeamIdentifier=462FZ9H8C7`, a `Timestamp=` line |
| `xcrun stapler validate Swarmterm.dmg` | `The validate action worked!` |
| `spctl -a -t open --context context:primary-signature -vvv Swarmterm.dmg` | `accepted`, `source=Notarized Developer ID` |

One manual check stays manual, because it is the only one that reproduces what
a downloader experiences:

```
xattr -w com.apple.quarantine "0083;00000000;Safari;" Swarmterm.dmg
open Swarmterm.dmg
```

No warning dialog means the release is good.

## Error playbook

Documented in `docs/release-macos.md`.

| Symptom | Cause | Fix |
|---|---|---|
| `security find-identity -v` shows 0 identities though the cert is installed | missing `Developer ID CA (G2)` intermediate (machines without full Xcode) | import it from `https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer` into `login.keychain-db` |
| `errSecInternalComponent` on the first `codesign` | private key has no tool ACL yet | answer the keychain prompt with **Always Allow** (once per machine) |
| `unable to build chain to self-signed root` | same missing intermediate | as above |
| `The signature does not include a secure timestamp` | `timestamp.apple.com` unreachable while signing | retry on an unfiltered network; never pass `--timestamp=none` for a release |
| `notarytool` returns `Invalid` | a nested binary is unsigned or lacks hardened runtime | `xcrun notarytool log <submission-id>` names the offending path |
| `notarytool` returns 401/403 | API key role too low | raise the key to **App Manager** in App Store Connect |
| Users still see "app is damaged" | stapling skipped, or the DMG predates notarization | re-run pass 2; confirm with `stapler validate` |

## Testing

There is nothing here a unit test can hold: the logic is a shell script over
Apple infrastructure, and `src/lib/` gains no code. The verification matrix is
the test, and it runs on every release because the script exits non-zero when
any assertion fails. Coverage for what signing can break at runtime comes from
the pass-1 smoke and the new `docs/manual-smoke-tests.md` section.

## Risks

- **Hardened runtime breaks a subsystem.** Judged unlikely (see the
  entitlements section) but unproven until pass 1 runs. Mitigation is the
  staged entitlements ladder.
- **Certificate loss.** The private key exists in exactly one keychain. Export
  a `.p12` backup to secure storage — also the exact artifact a future CI
  workflow needs.
- **Universal build breaks a Rust dependency.** `portable-pty` and the
  windows-only crates are gated by `cfg`, so x86_64 should build clean, but it
  has never been compiled on this repo. Pass 2 is the first proof.

## Deferred

- GitHub Actions release workflow covering macOS, Windows, and Linux, reusing
  these four variables as Secrets plus a base64 `.p12`.
- `tauri-plugin-updater` and its signing keypair.
- Windows Authenticode certificate.
