# Zap that Dupple - Windows Install Script
$ErrorActionPreference = "Stop"
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }

Write-Host "=== Zap that Dupple - Setup ===" -ForegroundColor Cyan
Write-Host "Working dir: $ScriptDir"

if ($ScriptDir -match "^\\\\") {
    Write-Host "WARNING: Network path detected! Copy to C:\ZapThatDupple first." -ForegroundColor Red
    $confirm = Read-Host "Continue anyway? (y/N)"
    if ($confirm -ne 'y') { exit 1 }
}

try { $pyVer = & python --version 2>&1; Write-Host "OK Python: $pyVer" -ForegroundColor Green }
catch { Write-Host "ERROR: Python not found." -ForegroundColor Red; exit 1 }

try { $nodeVer = & node --version 2>&1; Write-Host "OK Node: $nodeVer" -ForegroundColor Green }
catch { Write-Host "ERROR: Node.js not found." -ForegroundColor Red; exit 1 }

if (Get-Command ffmpeg -ErrorAction SilentlyContinue) {
    Write-Host "OK ffmpeg found" -ForegroundColor Green
} else {
    Write-Host "WARNING: ffmpeg not found. Run: winget install Gyan.FFmpeg" -ForegroundColor Yellow
}

# ARM64: install VC++ redistributable
$nodeArch = & node -e "process.stdout.write(process.arch)"
if ($nodeArch -eq "arm64") {
    Write-Host "ARM64 detected - checking VC++ ARM64 redistributable..." -ForegroundColor Yellow
    $vcKey = "HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\arm64"
    if (-not (Get-ItemProperty -Path $vcKey -ErrorAction SilentlyContinue)) {
        Write-Host "Installing VC++ ARM64 redistributable..." -ForegroundColor Yellow
        $vcUrl = "https://aka.ms/vs/17/release/vc_redist.arm64.exe"
        $vcExe = "$env:TEMP\vc_redist.arm64.exe"
        try {
            Invoke-WebRequest -Uri $vcUrl -OutFile $vcExe -UseBasicParsing
            Start-Process -FilePath $vcExe -ArgumentList "/quiet /norestart" -Wait
            Write-Host "OK VC++ ARM64 installed" -ForegroundColor Green
        } catch {
            Write-Host "ERROR: Download manually: $vcUrl" -ForegroundColor Red; exit 1
        }
    } else {
        Write-Host "OK VC++ ARM64 already installed" -ForegroundColor Green
    }
}

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

Write-Host ""
Write-Host "Installing Node dependencies..." -ForegroundColor Yellow
Set-Location "$ScriptDir\frontend"
if (Test-Path "node_modules") { Remove-Item -Recurse -Force node_modules }
& npm install
Write-Host "OK Node dependencies installed" -ForegroundColor Green

Write-Host ""
Write-Host "Building frontend..." -ForegroundColor Yellow
& node "$ScriptDir\frontend\node_modules\vite\bin\vite.js" build
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Frontend build failed" -ForegroundColor Red; exit 1 }
& node "$ScriptDir\frontend\node_modules\typescript\bin\tsc" -p tsconfig.electron.json
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Electron TS compile failed" -ForegroundColor Red; exit 1 }
Write-Host "OK Frontend built" -ForegroundColor Green

Set-Location $ScriptDir
Write-Host ""
Write-Host "=== Done! ===" -ForegroundColor Cyan
Write-Host "Launch: double-click ZapThatDupple.bat"
Write-Host "Build .exe: .\build.ps1"
