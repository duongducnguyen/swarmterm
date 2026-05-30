# Open a web preview for the current terminal session in Swarmterm.
# Usage: .\swarmterm-preview.ps1 <url>
param([Parameter(Mandatory=$true)][string]$Url)
if (-not $env:SWARMTERM_SESSION) {
  Write-Error "not inside a Swarmterm terminal"; exit 1
}
$enc = [uri]::EscapeDataString($Url)
$link = "swarmterm://preview?session=$($env:SWARMTERM_SESSION)&url=$enc"
Start-Process $link
