# Zap that Dupple - Windows Install Script
$ErrorActionPreference = "Stop"
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }

Write-Host "=== Zap that Dupple - Setup ===" -ForegroundColor Cyan
Write-Host "Working dir: $ScriptDir"

# Warn if on network drive
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

# FIX 1: ARM64 Windows needs VC++ ARM64 redistributable for rollup / electron native modules
$nodeArch = & node -e "process.stdout.write(process.arch)"
if ($nodeArch -eq "arm64") {
    Write-Host ""
    Write-Host "ARM64 Node detected - checking VC++ ARM64 redistributable..." -ForegroundColor Yellow
    $vcKey = "HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\arm64"
    $vcInstalled = (Get-ItemProperty -Path $vcKey -ErrorAction SilentlyContinue)
    if (-not $vcInstalled) {
        Write-Host "Installing VC++ ARM64 redistributable (required for native Node modules)..." -ForegroundColor Yellow
        $vcUrl = "https://aka.ms/vs/17/release/vc_redist.arm64.exe"
        $vcExe = "$env:TEMP\vc_redist.arm64.exe"
        try {
            Invoke-WebRequest -Uri $vcUrl -OutFile $vcExe -UseBasicParsing
            Start-Process -FilePath $vcExe -ArgumentList "/quiet /norestart" -Wait
            Write-Host "OK VC++ ARM64 redistributable installed" -ForegroundColor Green
        } catch {
            Write-Host "ERROR: Could not auto-install VC++ ARM64 redistributable." -ForegroundColor Red
            Write-Host "  Download manually from: $vcUrl" -ForegroundColor Red
            Write-Host "  Install it, then re-run install.ps1" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "OK VC++ ARM64 redistributable already installed" -ForegroundColor Green
    }
}

# FIX 2: Python venv — pydantic pinned to >=2.10.0 which has Python 3.14 prebuilt wheels
Write-Host ""
Write-Host "Setting up Python backend..." -ForegroundColor Yellow
Set-Location "$ScriptDir\backend"

if (Test-Path "venv") { Remove-Item -Recurse -Force venv }
python -m venv venv

$pip    = "$ScriptDir\backend\venv\Scripts\pip.exe"
$python = "$ScriptDir\backend\venv\Scripts\python.exe"

& $python -m pip install --upgrade pip -q
& $pip install -r requirements.txt
Write-Host "OK Python backend ready" -ForegroundColor Green

# FIX 3: Node install WITHOUT --ignore-scripts so electron/rollup postinstall hooks run
Write-Host ""
Write-Host "Installing Node dependencies..." -ForegroundColor Yellow
Set-Location "$ScriptDir\frontend"
if (Test-Path "node_modules") { Remove-Item -Recurse -Force node_modules }
& npm install
Write-Host "OK Node dependencies installed" -ForegroundColor Green

# Build frontend
Write-Host ""
Write-Host "Building frontend..." -ForegroundColor Yellow
& node "$ScriptDir\frontend\node_modules\vite\bin\vite.js" build
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Frontend build failed" -ForegroundColor Red; exit 1 }
& node "$ScriptDir\frontend\node_modules\typescript\bin\tsc" -p tsconfig.electron.json
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Electron TypeScript compile failed" -ForegroundColor Red; exit 1 }
Write-Host "OK Frontend built" -ForegroundColor Green

Set-Location $ScriptDir
Write-Host ""
Write-Host "=== Done! ===" -ForegroundColor Cyan
Write-Host "Launch: double-click ZapThatDupple.bat" -ForegroundColor Cyan
Write-Host "Build .exe: .\build.ps1" -ForegroundColor Cyan
