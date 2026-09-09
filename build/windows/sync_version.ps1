# sync_version.ps1 - Read version from build/config.yml (info.version) and sync it
# into the Windows packaging files:
#   - build/windows/info.json              (consumed by `wails3 generate syso -info`, sets exe file version)
#   - build/windows/wails.exe.manifest     (assemblyIdentity version, syso metadata)
#   - build/windows/nsis/wails_tools.nsh   (NSIS installer INFO_PRODUCTVERSION default)
#   - config.yaml                          (root, app.version - embedded at build time,
#                                           drives auto-update comparison and User-Agent)
#
# Single source of truth: build/config.yml. When releasing a new version, only
# edit config.yml; the build (generate:syso) runs this script automatically.
#
# Usage: run from build/  ->  powershell -NoProfile -ExecutionPolicy Bypass -File windows/sync_version.ps1
# NOTE: keep this file pure ASCII (English messages) so Windows PowerShell 5.1
# parses it correctly without a UTF-8 BOM.

$ErrorActionPreference = "Stop"

# Script lives in build/windows/, repo root is two levels up
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$configPath = Join-Path $root "config.yml"
$infoJsonPath = Join-Path $root "windows\info.json"
$manifestPath = Join-Path $root "windows\wails.exe.manifest"
$nsisToolsPath = Join-Path $root "windows\nsis\wails_tools.nsh"
$runtimeConfigPath = Join-Path $root "..\config.yaml"

# Extract info.version from config.yml (format: version: "1.3.1" or "1.3.2-beta").
# The top-level `version: '3'` uses single quotes and will not match.
$configText = [System.IO.File]::ReadAllText($configPath)
$m = [regex]::Match($configText, '(?m)^\s*version:\s*"([^"]+)"')
if (-not $m.Success) {
    throw "Cannot parse info.version from $configPath. Make sure `version: `"x.y.z`"` exists under info."
}
$version = $m.Groups[1].Value.Trim()
if ($version -notmatch '^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$') {
    throw "Invalid version format in config.yml: '$version' (expected x.y.z or x.y.z-prerelease)"
}
Write-Host "sync_version: read version $version from config.yml"

# nsisVersion strips any prerelease suffix (e.g. 1.3.2-beta -> 1.3.2).
# Windows file version (VIProductVersion/VIFileVersion) only accepts four
# dot-separated numeric segments, so NSIS gets the numeric core and project.nsi
# appends ".0" to form X.X.X.X.
$nsisVersion = $version
$prereleaseMatch = [regex]::Match($nsisVersion, '^(?<core>\d+\.\d+\.\d+)-')
if ($prereleaseMatch.Success) {
    $nsisVersion = $prereleaseMatch.Groups['core'].Value
}
Write-Host "sync_version: NSIS numeric version $nsisVersion"

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# 1) info.json: update fixed.file_version and info.0000.ProductVersion
$infoJson = [System.IO.File]::ReadAllText($infoJsonPath)
$infoJson = [regex]::Replace($infoJson, '("file_version"\s*:\s*")[^"]*(")', "`${1}$version`${2}")
$infoJson = [regex]::Replace($infoJson, '("ProductVersion"\s*:\s*")[^"]*(")', "`${1}$version`${2}")
[System.IO.File]::WriteAllText($infoJsonPath, $infoJson, $utf8NoBom)
Write-Host "sync_version: updated $infoJsonPath"

# 2) wails.exe.manifest: update version attribute on the app's assemblyIdentity line only.
# Match the top-level assembly (name="com.muyu.gosume") so the Common-Controls
# dependency (fixed 6.0.0.0) is never touched.
$manifest = [System.IO.File]::ReadAllText($manifestPath)
$manifest = [regex]::Replace($manifest, '(assemblyIdentity type="win32" name="com\.muyu\.gosume" version=")[^"]*(")', "`${1}$version`${2}")
[System.IO.File]::WriteAllText($manifestPath, $manifest, $utf8NoBom)
Write-Host "sync_version: updated $manifestPath"

# 3) wails_tools.nsh: update default value after !ifndef INFO_PRODUCTVERSION.
# Uses the prerelease-stripped numeric version so the NSIS installer's
# VIProductVersion/VIFileVersion (X.X.X.X) stays valid.
if (Test-Path $nsisToolsPath) {
    $nsis = [System.IO.File]::ReadAllText($nsisToolsPath)
    $nsis = [regex]::Replace($nsis, '(!ifndef INFO_PRODUCTVERSION\r?\n\s*!define INFO_PRODUCTVERSION ")[^"]*(")', "`${1}$nsisVersion`${2}")
    [System.IO.File]::WriteAllText($nsisToolsPath, $nsis, $utf8NoBom)
    Write-Host "sync_version: updated $nsisToolsPath"
} else {
    Write-Warning "sync_version: $nsisToolsPath not found, skipped (NSIS installer version may stay stale)"
}

# 4) config.yaml (root): update app.version, the runtime version embedded at build
# time. It drives the auto-update comparison and HTTP User-Agent.
if (Test-Path $runtimeConfigPath) {
    $runtime = [System.IO.File]::ReadAllText($runtimeConfigPath)
    $runtime = [regex]::Replace($runtime, '(?m)^(\s*version:\s*)["'']?[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?["'']?\s*$', "`${1}$version")
    [System.IO.File]::WriteAllText($runtimeConfigPath, $runtime, $utf8NoBom)
    Write-Host "sync_version: updated $runtimeConfigPath"
} else {
    Write-Warning "sync_version: $runtimeConfigPath not found, skipped (runtime version may stay stale)"
}

Write-Host "sync_version: done, all version files synced to $version"
