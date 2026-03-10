# Zap that Dupple — Windows Build Script
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Zap that Dupple — Build .exe       ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Cyan

# 1. PyInstaller
Write-Host "`n🐍 [1/4] Building Python backend..." -ForegroundColor Yellow
Set-Location "$ScriptDir\backend"
.\venv\Scripts\Activate.ps1
pip install pyinstaller -q
Remove-Item -Recurse -Force build, dist -ErrorAction SilentlyContinue

pyinstaller `
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

deactivate
Write-Host "✅ Backend built" -ForegroundColor Green

# 2. Frontend
Write-Host "`n⚛️  [2/4] Building React frontend..." -ForegroundColor Yellow
Set-Location "$ScriptDir\frontend"
npm run build:frontend
Write-Host "✅ Frontend built" -ForegroundColor Green

# 3. Electron compile
Write-Host "`n⚡ [3/4] Compiling Electron..." -ForegroundColor Yellow
npx tsc -p tsconfig.electron.json
Write-Host "✅ Electron compiled" -ForegroundColor Green

# 4. Package
Write-Host "`n📦 [4/4] Packaging installer..." -ForegroundColor Yellow
npx electron-builder --win --x64
Write-Host "✅ Done!" -ForegroundColor Green

Write-Host "`n╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Output: frontend\release\*.exe      ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Cyan

Start-Process "explorer.exe" "$ScriptDir\frontend\release"
