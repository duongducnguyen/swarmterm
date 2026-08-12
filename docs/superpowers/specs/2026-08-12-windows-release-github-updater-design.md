# Windows release + GitHub-powered auto-update

**Date:** 2026-08-12
**Status:** Approved (design delegated — user approved flow + approach A, then
handed detail decisions over; user is final tester)
**Goal:** Ship Windows builds alongside the existing macOS releases, and let
installed apps on both platforms discover, download, and install new versions
straight from GitHub Releases — everything built locally on two machines, no
CI.

## Background

macOS releasing is done and verified (`docs/release-macos.md`,
`scripts/release-macos.sh`): a universal `.dmg`, signed, notarized, stapled,
built by `npm run release:mac`. Its doc explicitly names Windows bundles and
in-app updates as separate work — this spec is that work.

Current state that shapes the design:

- `tauri.conf.json` has `plugins: {}`, no `createUpdaterArtifacts`, and
  `bundle.targets: "all"`.
- Version `0.1.0` is duplicated in `package.json`, `src-tauri/Cargo.toml`
  (+ `Cargo.lock`), and `src-tauri/tauri.conf.json`.
- `.github/workflows/ci.yml` runs tests only; the repo is public, so
  `https://github.com/duongducnguyen/swarmterm/releases/latest/download/latest.json`
  is fetchable unauthenticated.
- Release secrets live in `.env.release` (gitignored) as plain env vars;
  signing material lives outside the repo in `~/Developer/apple-signing/`.
- The tray menu (`tray.rs`) is Show / Quit; capabilities are a single
  `default.json`.

Decisions taken with the user:

| Question | Decision |
|---|---|
| Where do Windows builds run? | Locally, on the user's Windows machine. CI later, separately. |
| Windows code signing | None. Accept the SmartScreen "Unknown publisher" flow; document it. Authenticode is orthogonal to updater security (minisign) and can be added later without redesign. |
| Updater platforms | Both macOS and Windows. |
| Updater UX | Check silently a few seconds after startup; if an update exists show a small non-blocking notification; download only when the user clicks; prompt to restart when ready. Manual "Check for Updates…" in the tray menu. |
| Approach | Official `tauri-plugin-updater` + a GitHub **draft release** as the meeting point for the two build machines. |

## Non-goals

- **CI releases.** Everything here must also run headless later (plain env
  vars, no interactive steps), but the workflow itself is future work.
- **Linux bundles.** The `latest.json` schema is per-platform, so adding
  `linux-x86_64` later is additive.
- **Windows Authenticode / SmartScreen reputation.** Deliberately skipped.
- **Delta updates, update channels, rollback.** One channel: latest release.
- **MSI.** NSIS only — Tauri's recommended target for the updater, installs
  per-user without admin.

## Design

### 1. Release flow (two machines, five steps)

```
[Mac]                                    [Windows]
1. npm run bump -- 0.2.0
   → package.json, Cargo.toml, Cargo.lock, tauri.conf.json
2. git tag v0.2.0 && git push origin v0.2.0
3. npm run release:mac                   3. npm run release:win
   → .dmg (new installs)                    → Swarmterm_0.2.0_x64-setup.exe
   → Swarmterm.app.tar.gz + .sig            → …setup.exe.sig
4. npm run release:publish               4. npm run release:publish
        └──────────► draft release "v0.2.0" ◄──────────┘
5. npm run release:publish -- --publish   (either machine; refuses if a
   → draft goes public                     platform is missing)
```

- The **draft release is the transfer medium** — machines never copy files to
  each other. `release:publish` is idempotent (uploads with `--clobber`); run
  it in any order, any number of times.
- Drafts are inherently safe: `releases/latest/download/latest.json` only
  resolves against **published** releases, so a half-assembled draft is
  invisible to every installed app. `--publish` is the single go-live switch.
- The `.dmg` and the NSIS `.exe` double as the human-facing downloads on the
  Releases page. The updater consumes the `.app.tar.gz` (macOS) and the same
  NSIS `.exe` (Windows).

### 2. Updater configuration

`tauri.conf.json`:

```json
"bundle": { "createUpdaterArtifacts": true },
"plugins": {
  "updater": {
    "pubkey": "<generated minisign public key>",
    "endpoints": [
      "https://github.com/duongducnguyen/swarmterm/releases/latest/download/latest.json"
    ],
    "windows": { "installMode": "passive" }
  }
}
```

New crates: `tauri-plugin-updater`, `tauri-plugin-process` (for `relaunch`),
registered in `lib.rs`. New npm deps: `@tauri-apps/plugin-updater`,
`@tauri-apps/plugin-process`. Capabilities gain `updater:default` and
`process:default`.

`latest.json` platform keys: `darwin-aarch64` and `darwin-x86_64` both point
at the one universal `.app.tar.gz`; `windows-x86_64` points at the NSIS
`.exe`. Each entry's `signature` is the *content* of the matching `.sig`
asset.

### 3. Signing key (minisign) — the update trust root

- Generated once: `npm run tauri signer generate` with a password. Private
  key + password live in `~/Developer/apple-signing/` next to the Apple
  credentials, mode 600, **never in the repo**; the same key file is copied to
  the Windows machine (its `.env.release` points at its local copy).
- `.env.release` (both machines) gains `TAURI_SIGNING_PRIVATE_KEY` (path) and
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. `tauri build` reads them; both release
  scripts assert they are set before building.
- The public key is committed in `tauri.conf.json`.
- **Documented in bold in the release docs:** losing the private key (or its
  password) permanently strands every shipped app — they can never accept an
  update again. Back both up. Leaking the key alone does not let an attacker
  push updates (they would also need GitHub release access), but treat it as a
  secret.

### 4. Scripts

**`scripts/release-windows.ps1`** (`npm run release:win`) — the
`release-macos.sh` counterpart, minus signing/notarization:

- Parses `.env.release` (same `KEY=VALUE` format).
- Dies early, with a clear message, if the signing-key vars are missing.
- `npm run tauri build -- --bundles nsis`.
- Asserts `Swarmterm_<version>_x64-setup.exe` + `.sig` exist and the filename
  version matches `tauri.conf.json`.

**`scripts/release-macos.sh`** — small extension: assert the two signing-key
vars (smoke pass included, since `createUpdaterArtifacts` applies there too)
and assert `.app.tar.gz` + `.sig` exist after the build. Signing/notarization
flow untouched.

**`scripts/release/publish.mjs`** (`npm run release:publish`) — Node, runs
identically on both machines, shells out to `gh`:

1. Assert `gh auth status` OK; read version from `tauri.conf.json`; assert
   tag `v<version>` exists (warn if it isn't HEAD).
2. `gh release view v<version>` → missing ⇒ `gh release create --draft`.
3. Upload this platform's artifacts with `--clobber` (mac: `.dmg`,
   `.app.tar.gz`, `.sig`; win: `setup.exe`, `.sig`).
4. Rebuild `latest.json` from the draft's current asset list + local `.sig`
   contents, upload with `--clobber`.
5. With `--publish`: refuse unless `platforms` covers both mac keys and
   `windows-x86_64`; then `gh release edit --draft=false`.

The asset-list → `latest.json` mapping is a **pure function in
`src/lib/release-manifest.ts`** with Vitest tests beside it (repo TDD
convention); the `.mjs` script is a thin shell around it and `gh`.

**`scripts/bump-version.mjs`** (`npm run bump -- <version>`) — writes the
version into `package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`
(the `swarmterm` package block only), and `src-tauri/tauri.conf.json`, then
verifies all four agree. Release scripts also assert this agreement.

### 5. In-app updater

Module boundaries follow the repo layout:

- **`src/tauri/updater.ts`** — the only IPC surface: thin typed wrappers over
  `@tauri-apps/plugin-updater` (`check`, `downloadAndInstall` with progress
  callback) and `@tauri-apps/plugin-process` (`relaunch`).
- **`src/lib/updater-flow.ts`** (+ tests, written first) — pure state
  machine: `idle → checking → available → downloading → ready | error`, plus
  `upToDate` for manual checks. Encodes the decisions: startup checks are
  silent on error and silent when up-to-date; manual checks surface both;
  download progress is (downloaded, total?) → percent-or-indeterminate.
- **`src/store/updater-store.ts`** — zustand store holding the flow state;
  actions call `src/tauri/updater.ts` and reduce through `updater-flow.ts`.
- **UI** — a small VS Code-style notification toast, anchored **bottom-left**
  (over the terminal area — never bottom-right, where the native preview
  webview would paint over it). States: "Update v0.2.0 available —
  Download / Dismiss", progress bar while downloading, "Restart to update —
  Restart / Later" when ready, error + "up to date" (manual checks only).
  The toast carries `data-focus-return` so clicks hand focus back to the
  terminal (repo focus gotcha).
- **Triggers** — `App.tsx` schedules one silent check ~5 s after startup.
  The tray menu gains **"Check for Updates…"** (`tray.rs`), which emits an
  event the renderer listens for and runs a *manual* check.
- **Windows specifics** — with NSIS + `installMode: "passive"`, the plugin
  runs the new installer and the app exits; the installer relaunches the app.
  `relaunch()` is only called on macOS after install.

### 6. Error handling

- Startup check: any failure (offline, GitHub down, malformed manifest) is
  swallowed — the app must never nag when the network is bad.
- Manual check: errors render in the toast with the message, and can be
  dismissed.
- Download failure: toast returns to `available` with an error note; retry is
  just clicking Download again.
- Signature mismatch: the plugin rejects the artifact; surfaces as a download
  error. Nothing is installed.
- `release:publish --publish` refuses on missing platforms; uploads are
  `--clobber` so re-runs after partial failure are safe.

### 7. Documentation

- **`docs/release-process.md`** (new) — the start-here page: the five-step
  flow, key management + the key-loss warning, `latest.json` anatomy,
  publishing, links to the two platform pages.
- **`docs/release-windows.md`** (new) — one-time Windows machine setup (Rust,
  VS Build Tools, Node, `gh`), `.env.release`, `npm run release:win`, and the
  SmartScreen section: what users see, what to tell them, why it is unsigned.
- **`docs/release-macos.md`** — add the two signing-key vars and the updater
  artifacts; rewrite "Not covered here".
- **`docs/user-guide.md`** — new "Updates" section (user-visible feature);
  README untouched (high-level only).
- **`docs/manual-smoke-tests.md`** — updater checklist: install previous
  version, publish next, see toast, update through, verify version; SmartScreen
  walkthrough on Windows.
- **`CLAUDE.md`** — docs map + a short updater gotcha entry.
- **`.env.release.example`** — the two new vars with provenance comments.

### 8. Testing

- **Vitest (TDD):** `src/lib/updater-flow.test.ts`,
  `src/lib/release-manifest.test.ts`.
- **Type/lint gates:** `npx tsc --noEmit`, `cargo test` (plugins add no Rust
  logic, suite must stay green), `cargo clippy` via CI.
- **On this machine:** `npm run release:mac -- --smoke` must produce the
  signed `.app` *plus* `.app.tar.gz` + `.sig`; `publish.mjs` exercised
  end-to-end against a throwaway draft release on a test tag, then deleted.
- **User (final tester):** `npm run release:win` on the Windows machine;
  install `setup.exe` through SmartScreen; full cross-platform release of a
  real version; observe the update toast on an older install and ride it
  through restart on both platforms.

## Risks

- **Key loss bricks updates** — mitigated by the documented backup step and
  co-locating with the already-backed-up Apple credentials.
- **Universal-mac key duplication** (`darwin-aarch64`/`darwin-x86_64` sharing
  one artifact) is the tauri-action convention but is asserted by the smoke
  test on this machine before the first real release.
- **`releases/latest` skew:** if a future release is ever published without
  updater artifacts, installed apps see a manifest 404 and treat it as
  "check failed" — safe, but documented so it is not done accidentally.
