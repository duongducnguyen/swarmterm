# macOS Release Signing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a universal `Swarmterm.dmg` that is signed with a Developer ID
Application certificate, notarized by Apple, and stapled — produced by one
command on a developer Mac.

**Architecture:** `tauri build` already knows how to codesign and notarize; it
reads four environment variables and needs no custom signing code. Everything
added here is thin: a `bundle.macOS` block, a merged `Info.plist`, and one
shell script that loads credentials from a gitignored `.env.release`, invokes
`tauri build`, and then *proves* the result with `codesign`, `stapler`, and
`spctl` instead of trusting the exit code.

**Tech Stack:** Tauri 2 bundler, Apple `codesign` / `notarytool` / `stapler` /
`spctl` (Command Line Tools), bash, npm scripts.

**Spec:** `docs/superpowers/specs/2026-08-11-macos-release-signing-design.md`

## Global Constraints

- Branch: `feat/macos-release-signing` (already created; commit everything there).
- **No secret ever enters git.** The `.p8` key, Issuer ID, and Key ID stay out
  of every tracked file. Team ID `462FZ9H8C7` is public (it is embedded in every
  signed binary) and may appear in tracked files.
- `APPLE_SIGNING_IDENTITY` is passed by environment only — never written into
  `tauri.conf.json`, because the string embeds one developer's name and team
  and would break `tauri build` for every other clone of the repo.
- Signing material lives in `~/Developer/apple-signing/` (mode 700), outside the
  repo. The `.p8` in use is `AuthKey_VVV8437M42.p8`.
- `bundle.macOS.minimumSystemVersion` is `"10.15"`.
- `hardenedRuntime` is left implicit (Tauri defaults it to `true`).
- No entitlements file ships unless Task 4 proves one is required.
- Shell scripts use `set -euo pipefail`.
- Docs in this repo are written in English.
- Scope excludes GitHub Actions, Windows/Linux signing, and the updater.

---

### Task 1: Credential plumbing

Nothing can be built until the four variables resolve. This task makes them
loadable and makes it impossible to commit them by accident.

**Files:**
- Modify: `.gitignore`
- Create: `.env.release.example`
- Create (NOT committed): `.env.release`

**Interfaces:**
- Produces: a repo-root `.env.release` exporting `APPLE_SIGNING_IDENTITY`,
  `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_PATH`. Task 3's script
  sources this file.

- [ ] **Step 1: Harden `.gitignore`**

`.env*` already matches `.env.release`, but signing material must be blocked by
name too — a stray `.p8` copied to the repo root is a credential leak, not a
config mistake. Append to `.gitignore`:

```gitignore

# Apple signing material — never commit
*.p8
*.p12
*.cer
*.certSigningRequest
```

- [ ] **Step 2: Write the committed example file**

Create `.env.release.example` — names only, no values:

```bash
# Copy to .env.release (gitignored) and fill in.
# See docs/release-macos.md for where each value comes from.

# Full identity string, exactly as `security find-identity -v -p codesigning`
# prints it inside the quotes.
APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"

# App Store Connect > Users and Access > Integrations > App Store Connect API.
# Issuer ID is the UUID above the key table; APPLE_API_KEY is the 10-character
# Key ID; APPLE_API_KEY_PATH is the absolute path to the downloaded .p8.
APPLE_API_ISSUER=
APPLE_API_KEY=
APPLE_API_KEY_PATH=
```

- [ ] **Step 3: Create the real `.env.release`**

Fill it from the operator's own credentials. The identity string comes from the
machine, the Key ID from the `.p8` filename, and the Issuer ID from App Store
Connect (the operator pastes it — it is deliberately not recorded in the repo):

```bash
IDENTITY="$(security find-identity -v -p codesigning | grep 'Developer ID Application' | head -1 | sed 's/.*"\(.*\)"/\1/')"
KEYFILE="$(ls "$HOME"/Developer/apple-signing/AuthKey_*.p8 | head -1)"
KEYID="$(basename "$KEYFILE" .p8 | sed 's/^AuthKey_//')"

cat > .env.release <<EOF
APPLE_SIGNING_IDENTITY="$IDENTITY"
APPLE_API_ISSUER=<paste the Issuer ID UUID here>
APPLE_API_KEY=$KEYID
APPLE_API_KEY_PATH=$KEYFILE
EOF
chmod 600 .env.release
```

Then edit the `APPLE_API_ISSUER` line to hold the real UUID.

- [ ] **Step 4: Verify the file loads and cannot be committed**

Run:

```bash
git check-ignore -v .env.release
( set -a; . ./.env.release; set +a
  for v in APPLE_SIGNING_IDENTITY APPLE_API_ISSUER APPLE_API_KEY APPLE_API_KEY_PATH; do
    [ -n "${!v:-}" ] && echo "$v: set" || { echo "$v: MISSING"; exit 1; }
  done
  [ -f "$APPLE_API_KEY_PATH" ] && echo "p8: present" || { echo "p8: MISSING"; exit 1; } )
```

Expected: `git check-ignore` prints the matching rule (proving the file is
ignored), then five lines reading `set` / `present`. No value is echoed.

- [ ] **Step 5: Prove the credentials authenticate against Apple**

Run:

```bash
( set -a; . ./.env.release; set +a
  xcrun notarytool history --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER" )
```

Expected: either `No submission history` or a table of past submissions. Any
`HTTP 401` / `403` means the key's role is too low — raise it to **App Manager**
in App Store Connect and retry.

- [ ] **Step 6: Back up the certificate** — *deferred by decision on 2026-08-12.*
  Losing the keychain is recoverable (revoke, re-issue from a new CSR, ~10
  minutes) and the `.p12` is only strictly needed when CI arrives, so this step
  moves to the GitHub Actions work. The commands stay here for that day.

The private key exists in exactly one keychain on one machine; losing it means
re-issuing the certificate and re-signing every future release. Export an
encrypted `.p12` — the same artifact a future CI workflow will need:

```bash
security export -k ~/Library/Keychains/login.keychain-db \
  -t identities -f pkcs12 \
  -o ~/Developer/apple-signing/DeveloperID.p12
chmod 600 ~/Developer/apple-signing/DeveloperID.p12
```

`security` prompts twice: once for a password to encrypt the `.p12` (choose one
and store it with the file's backup), once for keychain access. Verify the
export is readable, then copy the whole `~/Developer/apple-signing/` directory
to secure storage (password manager or an encrypted external disk):

```bash
openssl pkcs12 -in ~/Developer/apple-signing/DeveloperID.p12 -nokeys -passin pass:<the password you chose> | openssl x509 -noout -subject
```

Expected: the subject line naming `Developer ID Application`.

- [ ] **Step 7: Commit**

```bash
git add .gitignore .env.release.example
git status --short   # neither .env.release nor any .p12 may appear
git commit -m "build(macos): gitignore signing material, add .env.release.example"
```

---

### Task 2: Bundle configuration and Info.plist

**Files:**
- Modify: `src-tauri/tauri.conf.json` (the `bundle` object, currently lines 32-43)
- Create: `src-tauri/Info.plist`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: a bundle that carries TCC usage strings and a 10.15 floor. Task 4
  reads the resulting `Info.plist` out of the built `.app` to confirm the merge
  happened.

- [ ] **Step 1: Add the `macOS` block to the bundle config**

In `src-tauri/tauri.conf.json`, inside `"bundle"`, after the `"icon"` array, add:

```json
    "macOS": {
      "minimumSystemVersion": "10.15"
    }
```

`signingIdentity` is intentionally absent — it arrives via
`APPLE_SIGNING_IDENTITY`. `hardenedRuntime` is intentionally absent — Tauri
defaults it to `true`, and notarization requires it.

- [ ] **Step 2: Create `src-tauri/Info.plist`**

Tauri merges this file into the plist it generates. Shells spawned inside a
pane touch these directories and macOS attributes the resulting TCC prompt to
Swarmterm; without the strings the prompt body is blank and users decline it.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSDesktopFolderUsageDescription</key>
  <string>Swarmterm runs the shell commands you type, which may read or write files on your Desktop.</string>
  <key>NSDocumentsFolderUsageDescription</key>
  <string>Swarmterm runs the shell commands you type, which may read or write files in your Documents folder.</string>
  <key>NSDownloadsFolderUsageDescription</key>
  <string>Swarmterm runs the shell commands you type, which may read or write files in your Downloads folder.</string>
</dict>
</plist>
```

- [ ] **Step 3: Verify both files are well-formed**

Run:

```bash
plutil -lint src-tauri/Info.plist
node -e "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json','utf8')); console.log('tauri.conf.json OK')"
```

Expected: `src-tauri/Info.plist: OK` and `tauri.conf.json OK`. A malformed
plist fails the whole bundle step later with a far worse error message.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/tauri.conf.json src-tauri/Info.plist
git commit -m "build(macos): bundle config floor + TCC usage descriptions"
```

---

### Task 3: The release script

**Files:**
- Create: `scripts/release-macos.sh`
- Modify: `package.json` (the `scripts` object, currently lines 12-20)
- Modify: `.gitignore` — `.env*` (line 25) also swallows `.env.release.example`,
  so a `!.env.release.example` negation is required for the template to be
  trackable. Verify with `git add --dry-run .env.release.example`.

**Interfaces:**
- Consumes: `.env.release` from Task 1; the bundle config from Task 2.
- Produces: `scripts/release-macos.sh`, callable as `npm run release:mac`
  (full release) or `npm run release:mac -- --smoke` (fast signed-only build).
  Tasks 4 and 5 invoke exactly these two forms.

- [ ] **Step 1: Write the script**

Create `scripts/release-macos.sh`:

```bash
#!/usr/bin/env bash
#
# Build, sign, notarize and staple a macOS release of Swarmterm.
#
#   ./scripts/release-macos.sh           universal .dmg, notarized + stapled
#   ./scripts/release-macos.sh --smoke   arm64 .app, signed only — proves the
#                                        app survives hardened runtime without
#                                        spending Apple's queue time
#
# Credentials come from .env.release (gitignored), which takes precedence over
# anything already in the environment. See docs/release-macos.md.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

die() { echo "release-macos: $*" >&2; exit 1; }

SMOKE=0
[ "${1:-}" = "--smoke" ] && SMOKE=1

if [ -f .env.release ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.release
  set +a
fi

[ -n "${APPLE_SIGNING_IDENTITY:-}" ] \
  || die "APPLE_SIGNING_IDENTITY is unset — copy .env.release.example to .env.release"

security find-identity -v -p codesigning | grep -qF "$APPLE_SIGNING_IDENTITY" \
  || die "identity not usable in this keychain: $APPLE_SIGNING_IDENTITY"

if [ "$SMOKE" = 1 ]; then
  # Tauri notarizes whenever the notary variables are present, so the smoke
  # pass must actively remove them rather than merely not setting them.
  unset APPLE_API_ISSUER APPLE_API_KEY APPLE_API_KEY_PATH
  TARGET=aarch64-apple-darwin
  BUNDLES=app
else
  for v in APPLE_API_ISSUER APPLE_API_KEY APPLE_API_KEY_PATH; do
    [ -n "${!v:-}" ] || die "$v is unset — see .env.release.example"
  done
  [ -f "$APPLE_API_KEY_PATH" ] || die "APPLE_API_KEY_PATH is not a file: $APPLE_API_KEY_PATH"
  rustup target list --installed | grep -qx x86_64-apple-darwin \
    || die "missing rust target — run: rustup target add x86_64-apple-darwin"
  TARGET=universal-apple-darwin
  # `app` is listed alongside `dmg` on purpose: asked for the disk image alone,
  # the bundler deletes the .app it built from once the image is sealed, and
  # the signature assertions below would have nothing left to inspect.
  # (Learned the hard way on the first real run, 2026-08-12.)
  BUNDLES=app,dmg
fi

echo "==> building ($TARGET, --bundles $BUNDLES)"
npm run tauri build -- --target "$TARGET" --bundles "$BUNDLES"

APP="src-tauri/target/$TARGET/release/bundle/macos/Swarmterm.app"
[ -d "$APP" ] || die "app bundle not found: $APP"

echo "==> verifying signature"
codesign --verify --deep --strict --verbose=2 "$APP"
SIGINFO="$(codesign -dv --verbose=4 "$APP" 2>&1)"
grep -q "flags=0x10000(runtime)" <<<"$SIGINFO" || die "hardened runtime flag missing on $APP"
grep -q "^Timestamp=" <<<"$SIGINFO"            || die "secure timestamp missing on $APP"

# The team is derived from the identity string rather than hardcoded, so the
# assertion still holds for a contributor signing with their own certificate.
EXPECTED_TEAM="$(sed -n 's/.*(\([A-Z0-9]\{10\}\))[[:space:]]*$/\1/p' <<<"$APPLE_SIGNING_IDENTITY")"
[ -n "$EXPECTED_TEAM" ] || die "cannot parse a team id out of APPLE_SIGNING_IDENTITY"
grep -q "^TeamIdentifier=$EXPECTED_TEAM" <<<"$SIGINFO" \
  || die "team identifier mismatch: expected $EXPECTED_TEAM"

if [ "$SMOKE" = 1 ]; then
  echo "==> smoke build OK (signed, not notarized): $REPO_ROOT/$APP"
  exit 0
fi

DMG="$(ls -t "src-tauri/target/$TARGET/release/bundle/dmg/"*.dmg 2>/dev/null | head -1 || true)"
[ -n "$DMG" ] && [ -f "$DMG" ] || die "no .dmg was produced"

echo "==> verifying notarization"
xcrun stapler validate "$APP" || die "the .app carries no notarization ticket"

# Whether the bundler staples the disk image itself is version-dependent, and a
# downloaded .dmg is what Gatekeeper judges first. If the ticket is missing,
# notarize the image explicitly rather than hoping.
if ! xcrun stapler validate "$DMG" >/dev/null 2>&1; then
  echo "==> dmg has no ticket; notarizing the disk image itself"
  xcrun notarytool submit "$DMG" \
    --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER" \
    --wait
  xcrun stapler staple "$DMG"
fi
xcrun stapler validate "$DMG"
spctl -a -t open --context context:primary-signature -vvv "$DMG"

echo "==> release OK: $REPO_ROOT/$DMG"
```

- [ ] **Step 2: Make it executable and register the npm script**

```bash
chmod +x scripts/release-macos.sh
```

In `package.json`, add to `"scripts"` after `"logo"`:

```json
    "release:mac": "bash scripts/release-macos.sh",
```

- [ ] **Step 3: Test the guard rails — this is the script's unit test**

A real build takes tens of minutes, so the failure paths are what get tested
directly. `.env.release` overrides the environment, so it must be moved aside
for the duration — otherwise the deliberately-bad values below are silently
replaced by the good ones:

```bash
mv .env.release .env.release.bak

echo "--- 1. missing identity"
./scripts/release-macos.sh; echo "exit=$? (expected non-zero)"

echo "--- 2. identity not present in the keychain"
APPLE_SIGNING_IDENTITY="Developer ID Application: Nobody (XXXXXXXXXX)" \
  ./scripts/release-macos.sh --smoke; echo "exit=$? (expected non-zero)"

GOOD_ID="$(security find-identity -v -p codesigning | grep 'Developer ID Application' | head -1 | sed 's/.*"\(.*\)"/\1/')"

echo "--- 3. notary variables missing in full mode"
APPLE_SIGNING_IDENTITY="$GOOD_ID" \
  ./scripts/release-macos.sh; echo "exit=$? (expected non-zero)"

echo "--- 4. key path points at nothing"
APPLE_SIGNING_IDENTITY="$GOOD_ID" APPLE_API_ISSUER=x APPLE_API_KEY=y APPLE_API_KEY_PATH=/nope/missing.p8 \
  ./scripts/release-macos.sh; echo "exit=$? (expected non-zero)"

mv .env.release.bak .env.release
```

Expected messages, in order: `APPLE_SIGNING_IDENTITY is unset …`,
`identity not usable in this keychain: …`, `APPLE_API_ISSUER is unset …`,
`APPLE_API_KEY_PATH is not a file: …`. Each must appear within about a second —
if any case starts compiling Rust, that guard sits in the wrong place. Confirm
`.env.release` is back afterwards with `ls -l .env.release`.

- [ ] **Step 4: Commit**

```bash
git add scripts/release-macos.sh package.json
git commit -m "build(macos): release script with signature + notarization assertions"
```

---

### Task 4: Smoke pass — prove Swarmterm survives hardened runtime

This is the real technical risk of the whole change. Swarmterm spawns ptys,
binds a loopback port for MCP, and creates native child webviews; hardened
runtime constrains what a process may do to itself, and this task settles
whether any of it breaks — before spending Apple's queue time.

**Files:**
- Create (only if Step 4 forces it): `src-tauri/Entitlements.plist`
- Modify (only if Step 4 forces it): `src-tauri/tauri.conf.json`

**Interfaces:**
- Consumes: `npm run release:mac -- --smoke` from Task 3.
- Produces: a verdict — either "no entitlements needed" (expected) or a
  committed entitlements file naming the symptom that forced it.

- [ ] **Step 1: Run the smoke build**

```bash
npm run release:mac -- --smoke
```

Expected final line: `==> smoke build OK (signed, not notarized): …/Swarmterm.app`.
First run compiles the whole Rust tree in release mode — allow 5-15 minutes.

- [ ] **Step 2: Confirm the Info.plist merge landed**

```bash
plutil -p src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Swarmterm.app/Contents/Info.plist \
  | grep -E "NSDesktopFolderUsageDescription|LSMinimumSystemVersion"
```

Expected: the Desktop usage string and `LSMinimumSystemVersion => 10.15`. If
either is absent, Task 2 did not take effect — fix it before continuing.

- [ ] **Step 3: Launch the signed app and exercise the risky subsystems**

```bash
open src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Swarmterm.app
```

Walk the three things hardened runtime could plausibly break, in this order:

1. **pty** — create a workspace, then a terminal pane; run `ls` and confirm
   output renders. Split the pane; confirm the second shell also spawns.
2. **native webview** — open the web preview column and load
   `https://github.com`; confirm the page paints and the address bar tracks.
3. **MCP loopback** — in a pane, run `echo $SWARMTERM_MCP_URL` (must print a
   `http://127.0.0.1:<port>/mcp` URL), then
   `curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $SWARMTERM_SESSION" "$SWARMTERM_MCP_URL"`
   and confirm it answers rather than failing to connect.

- [ ] **Step 4: Only if something broke — climb the entitlements ladder**

Skip entirely if Step 3 passed. Otherwise add the *single* entitlement matching
the symptom, rebuild, and retest — never add both at once, and never add one
speculatively:

| Symptom | Entitlement |
|---|---|
| App dies at launch or the webview stays blank with JIT errors in Console | `com.apple.security.cs.allow-jit` |
| Crash mentioning a dylib or `library validation` in Console.app | `com.apple.security.cs.disable-library-validation` |

Create `src-tauri/Entitlements.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- Added because: <exact symptom observed in Step 3>. -->
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
</dict>
</plist>
```

and point the bundle at it in `src-tauri/tauri.conf.json`:

```json
    "macOS": {
      "minimumSystemVersion": "10.15",
      "entitlements": "./Entitlements.plist"
    }
```

Rebuild with `npm run release:mac -- --smoke` and repeat Step 3.

- [ ] **Step 5: Record the verdict and commit**

If Step 4 was skipped there is nothing to commit — note in the task log that
the smoke passed with no entitlements. Otherwise:

```bash
git add src-tauri/Entitlements.plist src-tauri/tauri.conf.json
git commit -m "build(macos): add <entitlement> — <symptom it fixes>"
```

---

### Task 5: Real release — universal, notarized, stapled

**Files:** none modified. This task produces an artifact and a verdict.

**Interfaces:**
- Consumes: `npm run release:mac` from Task 3, the verdict from Task 4.
- Produces: a `.dmg` under
  `src-tauri/target/universal-apple-darwin/release/bundle/dmg/` (the bundler
  picks the exact filename; the script resolves it with `ls -t`), proven
  openable from quarantine. Task 6 documents the output observed here.

- [ ] **Step 1: Run the full release**

```bash
npm run release:mac
```

This compiles both architectures, lipos them, signs, submits to Apple, waits,
and staples. Budget 20-40 minutes for a cold run. Expected final line:
`==> release OK: …/bundle/dmg/<name>.dmg`.

If it fails, work the error playbook in the spec. The single most useful
command when `notarytool` returns `Invalid` is:

```bash
( set -a; . ./.env.release; set +a
  xcrun notarytool log <submission-id> --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER" )
```

which names the offending path inside the bundle.

- [ ] **Step 2: Confirm the binary really is universal**

```bash
lipo -archs src-tauri/target/universal-apple-darwin/release/bundle/macos/Swarmterm.app/Contents/MacOS/Swarmterm
```

Expected: `x86_64 arm64`. Anything else means the universal target silently
fell back to one architecture and Intel Macs would reject the download.

- [ ] **Step 3: Reproduce what a downloader experiences**

The script's assertions prove the artifact is well-formed; only quarantine
proves Gatekeeper is satisfied.

```bash
DMG="$(ls -t src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg | head -1)"
cp "$DMG" ~/Desktop/
xattr -w com.apple.quarantine "0083;00000000;Safari;" ~/Desktop/"$(basename "$DMG")"
xattr -l ~/Desktop/"$(basename "$DMG")"   # confirm the flag is set
open ~/Desktop/"$(basename "$DMG")"
```

Expected: the disk image mounts with **no** warning dialog. Drag Swarmterm to
Applications, launch it from there, and confirm it opens with no "unidentified
developer" or "damaged" prompt. That is the acceptance criterion for this whole
plan.

- [ ] **Step 4: Clean up the test copy**

```bash
rm -f ~/Desktop/"$(basename "$DMG")"
```

- [ ] **Step 5: Record the observed output**

Copy the exact `spctl` line (it should read `source=Notarized Developer ID`)
and the total wall-clock time into the task log — Task 6 quotes both.

---

### Task 6: Documentation

**Files:**
- Create: `docs/release-macos.md`
- Modify: `docs/manual-smoke-tests.md` (append a section)
- Modify: `CLAUDE.md` (the "Docs map" section)

**Interfaces:**
- Consumes: the observed output from Task 5.
- Produces: the operator runbook. Nothing depends on it.

- [ ] **Step 1: Write `docs/release-macos.md`**

```markdown
# Releasing Swarmterm for macOS

Swarmterm ships as a universal `.dmg` signed with a Developer ID Application
certificate and notarized by Apple. Without both, macOS refuses to open a
downloaded build.

## One-time setup

You need an Apple Developer Program membership.

### 1. Developer ID Application certificate

1. Keychain Access → menu bar → **Keychain Access → Certificate Assistant →
   Request a Certificate From a Certificate Authority**. Enter your email and
   name, leave *CA Email Address* empty, choose **Saved to disk**.
2. https://developer.apple.com/account/resources/certificates/list → **+** →
   **Developer ID Application** → upload the request → download the `.cer`.
3. Double-click the `.cer` and add it to the **login** keychain — the same
   keychain that holds the private key created in step 1. A certificate in the
   iCloud keychain will never pair into a usable identity.
4. Verify: `security find-identity -v -p codesigning` must list
   `Developer ID Application: <name> (<team id>)`.

If that command reports `0 valid identities` while the certificate is clearly
installed, the machine is missing Apple's intermediate — common on machines
with only the Command Line Tools:

```bash
curl -fsSL -o /tmp/DeveloperIDG2CA.cer https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer
security import /tmp/DeveloperIDG2CA.cer -k ~/Library/Keychains/login.keychain-db
```

### 2. Notarization credentials

1. https://appstoreconnect.apple.com/access/integrations/api → **Request
   Access** if the page offers it, then the **Team Keys** tab.
2. Create a key (role **Developer**), note the **Issuer ID** and **Key ID**, and
   download the `.p8`. **It can only be downloaded once.**
3. Store it outside the repo: `~/Developer/apple-signing/`, mode `600`.

### 3. Build prerequisites

```bash
rustup target add x86_64-apple-darwin
```

### 4. Local configuration

```bash
cp .env.release.example .env.release   # gitignored
```

Fill in all four values, then confirm Apple accepts them:

```bash
( set -a; . ./.env.release; set +a
  xcrun notarytool history --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY" --issuer "$APPLE_API_ISSUER" )
```

| Variable | Where it comes from |
|---|---|
| `APPLE_SIGNING_IDENTITY` | the quoted string from `security find-identity -v -p codesigning` |
| `APPLE_API_ISSUER` | Issuer ID (UUID) in App Store Connect |
| `APPLE_API_KEY` | Key ID (10 characters) |
| `APPLE_API_KEY_PATH` | absolute path to `AuthKey_<KeyID>.p8` |

## Releasing

```bash
npm run release:mac -- --smoke   # arm64 .app, signed only — minutes
npm run release:mac              # universal .dmg, notarized + stapled
```

Run the smoke pass first after any change to the bundle configuration: it
proves the app still runs under hardened runtime without waiting on Apple's
notarization queue. The full pass takes 20-40 minutes cold.

The first `codesign` on a new machine raises a keychain prompt. Answer it with
**Always Allow** — plain "Allow" makes every later build hang waiting for a
click.

The script asserts the result rather than trusting exit codes:

| Check | Required output |
|---|---|
| `codesign --verify --deep --strict` on the `.app` | `valid on disk`, `satisfies its Designated Requirement` |
| `codesign -dv --verbose=4` | `flags=0x10000(runtime)`, `TeamIdentifier=462FZ9H8C7`, a `Timestamp=` line |
| `xcrun stapler validate` on `.app` and `.dmg` | `The validate action worked!` |
| `spctl -a -t open --context context:primary-signature` | `accepted`, `source=Notarized Developer ID` |

Before publishing, reproduce what a downloader sees:

```bash
DMG="$(ls -t src-tauri/target/universal-apple-darwin/release/bundle/dmg/*.dmg | head -1)"
cp "$DMG" ~/Desktop/ && xattr -w com.apple.quarantine "0083;00000000;Safari;" ~/Desktop/"$(basename "$DMG")"
open ~/Desktop/"$(basename "$DMG")"
```

No warning dialog means the release is good.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `0 valid identities found` though the cert is installed | missing `Developer ID CA (G2)` intermediate | import it (see setup step 1) |
| `errSecInternalComponent` from `codesign` | the private key has no tool ACL yet | answer the keychain prompt with **Always Allow** |
| `unable to build chain to self-signed root` | same missing intermediate | as above |
| `The signature does not include a secure timestamp` | `timestamp.apple.com` unreachable while signing | retry on an unfiltered network; never pass `--timestamp=none` |
| `notarytool` returns `Invalid` | a nested binary is unsigned or lacks hardened runtime | `xcrun notarytool log <id>` names the path |
| `notarytool` returns 401/403 | API key role too low | raise the key to **App Manager** |
| Users see "app is damaged" | the ticket was never stapled | re-run `npm run release:mac`; confirm with `stapler validate` |

## Not covered here

CI releases (GitHub Actions, Windows and Linux bundles) and in-app updates are
separate work. The four variables above are deliberately plain environment
variables so the future workflow can consume them as secrets unchanged, along
with a base64-encoded `.p12` export of the certificate.
```

- [ ] **Step 2: Append the release check to `docs/manual-smoke-tests.md`**

Match the file's existing heading level and checklist style, then add:

```markdown
## Signed release (macOS)

Run against the `.dmg` produced by `npm run release:mac`, on a Mac that has
never run Swarmterm from source.

- [ ] The disk image opens with no Gatekeeper warning after
      `xattr -w com.apple.quarantine "0083;00000000;Safari;" <dmg>`.
- [ ] Dragging to Applications and launching shows no "unidentified developer"
      or "damaged" dialog.
- [ ] A terminal pane spawns and runs `ls`; a split pane spawns a second shell.
- [ ] The web preview column loads `https://github.com`.
- [ ] `echo $SWARMTERM_MCP_URL` inside a pane prints a loopback URL.
- [ ] A War Room message reaches a second pane.
```

- [ ] **Step 3: Add the runbook to the CLAUDE.md docs map**

In `CLAUDE.md`, under `## Docs map`, add:

```markdown
- `docs/release-macos.md` — signing and notarizing a macOS release: one-time
  Apple setup, the four `.env.release` variables, `npm run release:mac`, and the
  Gatekeeper troubleshooting table.
```

- [ ] **Step 4: Verify the docs match reality**

Re-read `docs/release-macos.md` against the actual output recorded in Task 5,
Step 5. Every command in it must be one that was really run in Tasks 1-5 — no
invented flags, no untested paths.

- [ ] **Step 5: Commit**

```bash
git add docs/release-macos.md docs/manual-smoke-tests.md CLAUDE.md
git commit -m "docs: macOS release signing runbook"
```

---

## Done when

- `npm run release:mac` produces a universal, notarized, stapled `.dmg`.
- The quarantined `.dmg` opens on a clean Mac with no Gatekeeper dialog.
- `lipo -archs` on the app binary prints `x86_64 arm64`.
- `git status` is clean and no credential file is tracked.
