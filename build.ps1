# Zap that Dupple - Windows Build Script
$ErrorActionPreference = "Stop"
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }

Write-Host "=== Zap that Dupple - Build .exe ===" -ForegroundColor Cyan

if (-not (Test-Path "$ScriptDir\backend\venv")) {
    Write-Host "ERROR: Run install.ps1 first!" -ForegroundColor Red; exit 1
}

# 1. PyInstaller
Write-Host "[1/4] Building Python backend..." -ForegroundColor Yellow
Set-Location "$ScriptDir\backend"
$pip         = "$ScriptDir\backend\venv\Scripts\pip.exe"
$pyinstaller = "$ScriptDir\backend\venv\Scripts\pyinstaller.exe"

& $pip install pyinstaller -q
if (Test-Path build) { Remove-Item -Recurse -Force build }
if (Test-Path dist)  { Remove-Item -Recurse -Force dist  }

& $pyinstaller `
  --onedir --name backend_app `
  --add-data "db;db" `
  --add-data "processors;processors" `
  --add-data "ai;ai" `
  --add-data "heif_support.py;." `
  --hidden-import=uvicorn.logging `
  --hidden-import=uvicorn.loops.auto `
  --hidden-import=uvicorn.protocols.http.auto `
  --hidden-import=uvicorn.protocols.websockets.auto `
  --hidden-import=uvicorn.lifespan.on `
  --hidden-import=aiosqlite `
  --hidden-import=greenlet `
  --hidden-import=sqlalchemy.dialects.sqlite `
  --hidden-import=sqlalchemy.ext.asyncio `
  --hidden-import=pillow_heif `
  --collect-all=open_clip `
  --collect-all=sentence_transformers `
  --noconfirm --log-level WARN `
  main.py

if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: PyInstaller failed" -ForegroundColor Red; exit 1 }
Write-Host "[1/4] Backend done" -ForegroundColor Green

# 2. Frontend (React + Vite)
Write-Host "[2/4] Building React frontend..." -ForegroundColor Yellow
Set-Location "$ScriptDir\frontend"
& node "$ScriptDir\frontend\node_modules\vite\bin\vite.js" build
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Vite build failed" -ForegroundColor Red; exit 1 }
Write-Host "[2/4] Frontend done" -ForegroundColor Green

# 3. Electron TypeScript
Write-Host "[3/4] Compiling Electron..." -ForegroundColor Yellow
& node "$ScriptDir\frontend\node_modules\typescript\bin\tsc" -p tsconfig.electron.json
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Electron TS compile failed" -ForegroundColor Red; exit 1 }
Write-Host "[3/4] Electron done" -ForegroundColor Green

# 4. Package with electron-builder
# FIX: call electron-builder.cmd directly, NOT via `node` (it's a batch file, not JS)
Write-Host "[4/4] Packaging NSIS installer..." -ForegroundColor Yellow
$arch = if ([System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture -eq "Arm64") { "arm64" } else { "x64" }
Write-Host "Detected architecture: $arch" -ForegroundColor Cyan

Set-Location "$ScriptDir\frontend"
$eb = "$ScriptDir\frontend\node_modules\.bin\electron-builder.cmd"
& $eb --win --$arch
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: electron-builder failed" -ForegroundColor Red; exit 1 }
Write-Host "[4/4] Done!" -ForegroundColor Green

Write-Host ""
Write-Host "Installer: $ScriptDir\frontend\release\" -ForegroundColor Cyan
