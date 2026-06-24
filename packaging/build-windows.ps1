# Builds the NGC7023 Windows installer end to end.
# Run from anywhere:  .\packaging\build-windows.ps1
#
# Steps: frontend build -> PyInstaller (dist\ngc7023) -> Inno Setup installer
# (dist\installer\NGC7023-Setup-<version>.exe). Requires the venv and Node; the
# last step also needs Inno Setup 6 (winget install JRSoftware.InnoSetup).

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# A previous test run can leave the app (and its WebView2 children) holding the
# dist folder, which makes PyInstaller's clean fail. Close them first.
Get-Process ngc7023, msedgewebview2 -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "==> building frontend (npm run build)" -ForegroundColor Cyan
Push-Location frontend
npm run build
Pop-Location

Write-Host "==> building exe (PyInstaller)" -ForegroundColor Cyan
& .\.venv\Scripts\pyinstaller.exe ngc7023.spec --noconfirm

# ffprobe is not required (the engine probes duration via 'ffmpeg -i').
foreach ($b in @("ffmpeg.exe", "yt-dlp.exe")) {
    if (-not (Test-Path ".\binaries\$b")) {
        Write-Warning ("missing binaries\{0} - the installer will not include it" -f $b)
    }
}

# Locate the Inno Setup compiler (winget may install per-user to LocalAppData).
$iscc = $null
$cmd = Get-Command ISCC.exe -ErrorAction SilentlyContinue
if ($cmd) { $iscc = $cmd.Source }
if (-not $iscc) {
    foreach ($p in @(
            "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
            "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
            "$env:ProgramFiles\Inno Setup 6\ISCC.exe")) {
        if (Test-Path $p) { $iscc = $p; break }
    }
}
if ($iscc) {
    Write-Host "==> compiling installer (Inno Setup)" -ForegroundColor Cyan
    & $iscc "packaging\ngc7023.iss"
    Write-Host "==> done -> dist\installer\" -ForegroundColor Green
} else {
    Write-Warning "Inno Setup not found. Install it:  winget install JRSoftware.InnoSetup"
    Write-Warning "Then compile manually:  ISCC.exe packaging\ngc7023.iss"
}
