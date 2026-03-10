# Zap that Dupple — Windows Install Script
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Zap that Dupple — Setup Script     ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check Python
try { $pyVer = python --version 2>&1; Write-Host "✅ $pyVer" -ForegroundColor Green }
catch { Write-Host "❌ Python not found. Install from https://python.org" -ForegroundColor Red; exit 1 }

# Check Node
try { $nodeVer = node --version 2>&1; Write-Host "✅ Node $nodeVer" -ForegroundColor Green }
catch { Write-Host "❌ Node.js not found. Install from https://nodejs.org" -ForegroundColor Red; exit 1 }

# Check ffmpeg
try { ffmpeg -version 2>&1 | Out-Null; Write-Host "✅ ffmpeg found" -ForegroundColor Green }
catch { Write-Host "⚠️  ffmpeg not found. Install from https://ffmpeg.org and add to PATH" -ForegroundColor Yellow }

Write-Host ""
Write-Host "🐍 Setting up Python backend..." -ForegroundColor Yellow
Set-Location "$ScriptDir\backend"
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install --upgrade pip -q
pip install -r requirements.txt -q
deactivate
Write-Host "✅ Python backend ready" -ForegroundColor Green

Write-Host ""
Write-Host "📦 Installing Node dependencies..." -ForegroundColor Yellow
Set-Location "$ScriptDir\frontend"
npm install --silent
Write-Host "✅ Node dependencies installed" -ForegroundColor Green

Write-Host ""
Write-Host "⚛️  Building frontend..." -ForegroundColor Yellow
npm run build:frontend
npx tsc -p tsconfig.electron.json
Write-Host "✅ Frontend built" -ForegroundColor Green

Set-Location $ScriptDir
Write-Host ""
Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║          Done! 🎉                    ║" -ForegroundColor Cyan
Write-Host "╠══════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "║  Launch: double-click                ║" -ForegroundColor Cyan
Write-Host "║          ZapThatDupple.bat           ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Cyan
