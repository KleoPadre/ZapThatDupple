# Zap that Dupple - Windows Install Script
$ErrorActionPreference = "Stop"
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }

Write-Host "=== Zap that Dupple - Setup ===" -ForegroundColor Cyan
Write-Host "Working dir: $ScriptDir"

# Warn if on network drive
$drive = Split-Path -Qualifier $ScriptDir
$driveType = (Get-PSDrive ($drive.TrimEnd(':'))).Description
if ($ScriptDir -match "^\\\\") {
    Write-Host ""
    Write-Host "WARNING: You are running from a network path!" -ForegroundColor Red
    Write-Host "This causes npm and pip issues." -ForegroundColor Red
    Write-Host "Please copy the project to C:\ZapThatDupple and run from there." -ForegroundColor Red
    Write-Host ""
    $confirm = Read-Host "Continue anyway? (y/N)"
    if ($confirm -ne 'y') { exit 1 }
}

# Check Python
try {
    $pyVer = & python --version 2>&1
    Write-Host "OK Python: $pyVer" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Python not found. Install from https://python.org" -ForegroundColor Red; exit 1
}

# Check Node
try {
    $nodeVer = & node --version 2>&1
    Write-Host "OK Node: $nodeVer" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Node.js not found." -ForegroundColor Red; exit 1
}

# Check ffmpeg
if (Get-Command ffmpeg -ErrorAction SilentlyContinue) {
    Write-Host "OK ffmpeg found" -ForegroundColor Green
} else {
    Write-Host "WARNING: ffmpeg not found. Run: winget install Gyan.FFmpeg" -ForegroundColor Yellow
}

# Python venv
Write-Host ""
Write-Host "Setting up Python backend..." -ForegroundColor Yellow
Set-Location "$ScriptDir\backend"

if (Test-Path "venv") { Remove-Item -Recurse -Force venv }
python -m venv venv

$pip = "$ScriptDir\backend\venv\Scripts\pip.exe"
$python = "$ScriptDir\backend\venv\Scripts\python.exe"

& $python -m pip install --upgrade pip -q
& $pip install -r requirements.txt
Write-Host "OK Python backend ready" -ForegroundColor Green

# Node - delete old node_modules to avoid stale macOS symlinks
Write-Host ""
Write-Host "Installing Node dependencies..." -ForegroundColor Yellow
Set-Location "$ScriptDir\frontend"
if (Test-Path "node_modules") { Remove-Item -Recurse -Force node_modules }
& npm install --ignore-scripts
Write-Host "OK Node dependencies installed" -ForegroundColor Green

# Build frontend using local node_modules binaries directly
Write-Host ""
Write-Host "Building frontend..." -ForegroundColor Yellow
$vite = "$ScriptDir\frontend\node_modules\.bin\vite.cmd"
$tsc  = "$ScriptDir\frontend\node_modules\.bin\tsc.cmd"

if (-not (Test-Path $vite)) { $vite = "$ScriptDir\frontend\node_modules\vite\bin\vite.js" }

& node $ScriptDir\frontend\node_modules\vite\bin\vite.js build
& node $ScriptDir\frontend\node_modules\typescript\bin\tsc -p tsconfig.electron.json
Write-Host "OK Frontend built" -ForegroundColor Green

Set-Location $ScriptDir
Write-Host ""
Write-Host "=== Done! ===" -ForegroundColor Cyan
Write-Host "Launch: double-click ZapThatDupple.bat" -ForegroundColor Cyan
Write-Host "Build .exe: .\build.ps1" -ForegroundColor Cyan
