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
  BUNDLES=dmg
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
