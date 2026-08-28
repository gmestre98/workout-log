# Compile the Workout Log watch app into a sideloadable .prg for the fenix 6 Pro,
# on Windows. This is the Windows counterpart of build.sh.
#
# Prerequisites (one-time — see INSTALL-Windows.md):
#   - JDK 17 installed and on PATH (monkeyc needs Java 17+)
#   - Connect IQ SDK installed via the SDK Manager, with the fenix 6 Pro device
#     downloaded
#   - a developer signing key generated (pass its path with -KeyPath)
#
# Usage:
#   .\build.ps1 -KeyPath "C:\Users\Goncalo\garmin\developer_key.der"

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$KeyPath,

    [string]$Device = "fenix6pro"
)

$ErrorActionPreference = "Stop"
$here = $PSScriptRoot

if (-not (Test-Path $KeyPath)) {
    Write-Error "Developer key not found at '$KeyPath'. Generate one first (see INSTALL-Windows.md, Route A step 3) and pass its path with -KeyPath."
}

# Locate the active Connect IQ SDK. The SDK Manager records the current SDK path
# in %APPDATA%\Garmin\ConnectIQ\current-sdk.cfg (its contents are that path).
$cfg = Join-Path $env:APPDATA "Garmin\ConnectIQ\current-sdk.cfg"
if (-not (Test-Path $cfg)) {
    Write-Error "No Connect IQ SDK found (missing $cfg). Open the SDK Manager once and download an SDK (INSTALL-Windows.md, Route A step 2)."
}

$sdkRoot = (Get-Content $cfg -Raw).Trim()
$sdkBin = Join-Path $sdkRoot "bin"
$monkeyc = Join-Path $sdkBin "monkeyc.bat"
if (-not (Test-Path $monkeyc)) {
    Write-Error "monkeyc not found at '$monkeyc'. The recorded SDK path may be stale - reopen the SDK Manager and reselect an SDK."
}

$binDir = Join-Path $here "bin"
if (-not (Test-Path $binDir)) { New-Item -ItemType Directory -Path $binDir | Out-Null }
$out = Join-Path $binDir "workout-log.prg"
$jungle = Join-Path $here "monkey.jungle"

Write-Host "Building for $Device with SDK at $sdkBin ..."
& $monkeyc -f $jungle -o $out -y $KeyPath -d $Device -w
if ($LASTEXITCODE -ne 0) { Write-Error "monkeyc failed with exit code $LASTEXITCODE." }

Write-Host ""
Write-Host "Built: $out"
Write-Host "Sideload: plug in the watch and copy it into GARMIN\APPS\ (see INSTALL-Windows.md)."
