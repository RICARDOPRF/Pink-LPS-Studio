param(
  [string]$ExePath = "",
  [string]$AllowedRoot = "$env:USERPROFILE\Documents\LPS",
  [switch]$StartWithWindows,
  [switch]$Launch
)
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not $ExePath) { $ExePath = "$RepoRoot\dist\PinkSatellite.exe" }
$ExePath = [System.IO.Path]::GetFullPath($ExePath)
if (-not (Test-Path $ExePath)) { throw "PinkSatellite.exe not found: $ExePath. Run companion/build-pink-satellite.ps1 first." }

$InstallDir = Join-Path $env:LOCALAPPDATA "PinkLPS\Satellite"
$InstallExe = Join-Path $InstallDir "PinkSatellite.exe"
$StartMenuDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Pink LPS"
$StartMenuLink = Join-Path $StartMenuDir "Pink Satellite.lnk"
$StartupLink = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\Pink Satellite.lnk"

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $StartMenuDir | Out-Null
New-Item -ItemType Directory -Force -Path $AllowedRoot | Out-Null
Copy-Item -Force $ExePath $InstallExe

# User-scoped config only. No API/provider keys are written here.
[Environment]::SetEnvironmentVariable("PINK_SATELLITE_ROOTS", $AllowedRoot, "User")
[Environment]::SetEnvironmentVariable("PINK_SATELLITE_NAME", "Pink Satellite Windows", "User")
$env:PINK_SATELLITE_ROOTS = $AllowedRoot
$env:PINK_SATELLITE_NAME = "Pink Satellite Windows"

$Shell = New-Object -ComObject WScript.Shell
function New-PinkShortcut([string]$Path) {
  $Shortcut = $Shell.CreateShortcut($Path)
  $Shortcut.TargetPath = $InstallExe
  $Shortcut.WorkingDirectory = $InstallDir
  $Shortcut.Description = "Pink Satellite Windows - local device runtime for Pink LPS Studio"
  $Shortcut.Save()
}
New-PinkShortcut $StartMenuLink
if ($StartWithWindows) { New-PinkShortcut $StartupLink }
elseif (Test-Path $StartupLink) { Remove-Item -Force $StartupLink }

Write-Host "Pink Satellite installed." -ForegroundColor Green
Write-Host "Executable: $InstallExe"
Write-Host "Allowed root: $AllowedRoot"
Write-Host "Start Menu: $StartMenuLink"
Write-Host "Loopback only: 127.0.0.1:8777"
Write-Host "No Windows Firewall inbound rule was created."
Write-Host "Generic shell remains disabled."

if ($Launch) {
  Start-Process -FilePath $InstallExe -WorkingDirectory $InstallDir
  Write-Host "Pink Satellite launched. Use the 6-digit pairing code shown in its console." -ForegroundColor Cyan
}
