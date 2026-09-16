param(
  [string]$Python = "python",
  [switch]$Clean
)
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

Write-Host "[Pink Satellite] Python" -ForegroundColor Cyan
& $Python --version

if ($Clean) {
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue "$RepoRoot\build\PinkSatellite"
  Remove-Item -Force -ErrorAction SilentlyContinue "$RepoRoot\PinkSatellite.spec"
  Remove-Item -Force -ErrorAction SilentlyContinue "$RepoRoot\dist\PinkSatellite.exe"
}

Write-Host "[Pink Satellite] Installing pinned builder" -ForegroundColor Cyan
& $Python -m pip install --disable-pip-version-check --no-input "pyinstaller==6.22.3" "pyinstaller-hooks-contrib==2026.7"

Write-Host "[Pink Satellite] Self-test source" -ForegroundColor Cyan
& $Python "$RepoRoot\companion\satellite_service.py" --self-test

Write-Host "[Pink Satellite] Building one-file Windows executable" -ForegroundColor Cyan
& $Python -m PyInstaller `
  --noconfirm `
  --clean `
  --onefile `
  --console `
  --name PinkSatellite `
  --distpath "$RepoRoot\dist" `
  --workpath "$RepoRoot\build\PinkSatellite" `
  --specpath "$RepoRoot\build" `
  "$RepoRoot\companion\satellite_service.py"

$Exe = "$RepoRoot\dist\PinkSatellite.exe"
if (-not (Test-Path $Exe)) { throw "PinkSatellite.exe was not generated" }

Write-Host "[Pink Satellite] Self-test packaged executable" -ForegroundColor Cyan
& $Exe --self-test
if ($LASTEXITCODE -ne 0) { throw "Packaged PinkSatellite self-test failed" }

$Hash = (Get-FileHash -Algorithm SHA256 $Exe).Hash
Write-Host "PinkSatellite.exe: $Exe" -ForegroundColor Green
Write-Host "SHA256: $Hash" -ForegroundColor Green
