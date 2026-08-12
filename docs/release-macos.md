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
   keychain that holds the private key created in step 1. A certificate filed
   under the iCloud keychain never pairs into a usable identity.
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
3. Store it outside the repo — `~/Developer/apple-signing/`, mode `600`.

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

`No submission history` on a fresh account means success.

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
notarization queue.

Timings, measured on 2026-08-12 (M-series, warm cargo cache): the smoke pass
takes about a minute, the full pass about six — most of it Apple's queue, not
compilation. A cold checkout adds five to ten minutes of dependency
compilation per target triple.

Each full release makes **two** notarization submissions, so
`xcrun notarytool history` grows by two rows: the bundler notarizes and staples
the `.app`, then hands the sealed disk image back unnotarized, and the script
submits the `.dmg` itself. That second round is not redundant — a downloaded
`.dmg` is what Gatekeeper judges first, and without its own ticket it can only
be verified online.

The first `codesign` on a new machine raises a keychain prompt. Answer it with
**Always Allow** — plain "Allow" makes every later build hang waiting for a
click.

The script asserts the result rather than trusting exit codes:

| Check | Required output |
|---|---|
| `codesign --verify --deep --strict` on the `.app` | `valid on disk`, `satisfies its Designated Requirement` |
| `codesign -dv --verbose=4` | `flags=0x10000(runtime)`, a `Timestamp=` line, `TeamIdentifier=` matching the identity |
| `xcrun stapler validate` on `.app` and `.dmg` | `The validate action worked!` |
| `spctl -a -t open --context context:primary-signature` | `accepted`, `source=Notarized Developer ID` |

Before publishing, reproduce what a downloader sees — quarantine is the only
check that exercises Gatekeeper itself:

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
variables so a future workflow can consume them as secrets unchanged, alongside
a base64-encoded `.p12` export of the certificate.
