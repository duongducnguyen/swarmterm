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
