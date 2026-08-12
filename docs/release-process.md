# Releasing Swarmterm

Start here. Platform specifics live in [release-macos.md](release-macos.md)
and [release-windows.md](release-windows.md); this page is the flow that ties
the two machines together and the rules that keep auto-update working.

## The five steps

```
[Mac]                                    [Windows]
1. npm run bump -- 0.2.0
   → package.json, Cargo.toml, Cargo.lock, tauri.conf.json
   → commit
2. git tag v0.2.0 && git push origin v0.2.0
3. npm run release:mac                   3. npm run release:win
   → .dmg (new installs)                    → Swarmterm_0.2.0_x64-setup.exe
   → Swarmterm.app.tar.gz + .sig            → …setup.exe.sig
4. npm run release:publish               4. npm run release:publish
        └──────────► draft release "v0.2.0" ◄──────────┘
5. npm run release:publish -- --publish   (either machine; refuses while any
   → the draft goes public                 platform is missing)
```

The **GitHub draft release is the transfer medium** — the two machines never
copy files to each other. `release:publish` uploads whatever the local build
produced (`--clobber`, so re-runs are harmless), then reassembles
`latest.json` from every asset currently on the draft. Run it from either
machine, in either order, as many times as you like.

Drafts are inherently safe: the updater endpoint
`releases/latest/download/latest.json` only resolves against **published**
releases, so installed apps cannot see a half-assembled draft. The
`--publish` flag is the single go-live switch, and it refuses to fire until
all three platform entries exist.

Release notes: write them on the draft's GitHub page (or `gh release edit`)
any time before publishing — every `release:publish` run copies the current
body into `latest.json`, including the `--publish` run itself.

## The updater signing key

Updates are trusted via **minisign**, not via Apple/Windows code signing.
Every build signs its updater artifacts with the private key; the public key
is baked into `tauri.conf.json`; the plugin refuses any artifact whose
signature does not verify.

- Private key: `~/Developer/apple-signing/swarmterm-updater.key`
- Its password: `~/Developer/apple-signing/swarmterm-updater.key.password`
- Both referenced from `.env.release` as `TAURI_SIGNING_PRIVATE_KEY` (path)
  and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- The **same key file** must exist on every build machine — copy it to the
  Windows box over a private channel (AirDrop, USB stick), never through the
  repo or a chat upload.

> **Losing the private key or its password permanently strands every shipped
> app** — they verify updates against the baked-in public key and will never
> accept an artifact signed by a replacement. Back up both files with the
> Apple credentials. Leaking the key is bad but not fatal (an attacker would
> also need write access to GitHub Releases); losing it is fatal.

## `latest.json` anatomy

Assembled by `scripts/release/manifest.mjs` (unit-tested; the publish script
is a thin `gh` wrapper around it):

```json
{
  "version": "0.2.0",
  "notes": "…release body…",
  "pub_date": "2026-08-12T00:00:00Z",
  "platforms": {
    "darwin-aarch64":  { "signature": "…", "url": "…/v0.2.0/Swarmterm.app.tar.gz" },
    "darwin-x86_64":   { "signature": "…", "url": "…/v0.2.0/Swarmterm.app.tar.gz" },
    "windows-x86_64":  { "signature": "…", "url": "…/v0.2.0/Swarmterm_0.2.0_x64-setup.exe" }
  }
}
```

Both `darwin-*` keys point at the one universal `.app.tar.gz`. The Windows
entry points at the NSIS installer itself. Signatures are the contents of the
`.sig` files the build emitted. URLs use the published-release form — draft
asset URLs are ephemeral and die on publish, which is why the script never
uses them.

## Rules that keep updates working

- **Never publish a release without updater artifacts.** `releases/latest`
  would start serving a 404 manifest and every installed app's update check
  fails (silently on startup, visibly via the tray) until the next good
  release. The publish script's refusal logic enforces this — don't hand-roll
  releases in the web UI.
- **Don't rotate the signing key.** See the warning above.
- The in-app flow: silent check ~5 s after launch; tray → **Check for
  Updates…** for a talkative manual check; download only on click; macOS
  restarts via the toast, Windows hands off to the NSIS installer
  (`installMode: passive`).

## What is deliberately not here

CI releases (GitHub Actions) remain future work — every step above is
headless-capable (plain env vars, no prompts) so the eventual workflow is a
lift-and-shift. Linux bundles: additive later (`linux-x86_64` key in the same
manifest). Windows Authenticode: see the SmartScreen section of
[release-windows.md](release-windows.md).
