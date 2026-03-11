# Создаём самоподписанный сертификат KleoPadre и подписываем exe
# Запускать ПОСЛЕ build.ps1, из папки C:\ZapThatDupple\frontend

param(
    [string]$ExePath = "release\win-unpacked\Zap that Dupple.exe"
)

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }

$CertName   = "KleoPadre"
$CertFile   = "$ScriptDir\KleoPadre.pfx"
$CertPass   = "ZapThatDupple2024"

Write-Host "=== Code Signing Setup ===" -ForegroundColor Cyan

# 1. Создать самоподписанный сертификат если ещё нет
if (-not (Test-Path $CertFile)) {
    Write-Host "Creating self-signed certificate..." -ForegroundColor Yellow

    $cert = New-SelfSignedCertificate `
        -Subject "CN=$CertName" `
        -Type CodeSigningCert `
        -CertStoreLocation "Cert:\CurrentUser\My" `
        -KeyExportPolicy Exportable `
        -KeySpec Signature `
        -HashAlgorithm SHA256 `
        -NotAfter (Get-Date).AddYears(10)

    # Экспортируем в pfx
    $pw = ConvertTo-SecureString -String $CertPass -Force -AsPlainText
    Export-PfxCertificate -Cert $cert -FilePath $CertFile -Password $pw | Out-Null

    # Добавляем в доверенные корневые (нужен admin — пропускаем если нет прав)
    try {
        $store = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root","LocalMachine")
        $store.Open("ReadWrite")
        $store.Add($cert)
        $store.Close()
        Write-Host "OK Certificate added to Trusted Root" -ForegroundColor Green
    } catch {
        Write-Host "WARNING: Could not add to Trusted Root (run as admin to fix)" -ForegroundColor Yellow
    }

    Write-Host "OK Certificate created: $CertFile" -ForegroundColor Green
} else {
    Write-Host "OK Certificate already exists: $CertFile" -ForegroundColor Green
}

# 2. Подписать все exe в release
Write-Host "Signing executables..." -ForegroundColor Yellow
$pw = ConvertTo-SecureString -String $CertPass -Force -AsPlainText
$cert = Get-PfxCertificate -FilePath $CertFile -Password $pw

$exeFiles = Get-ChildItem "$ScriptDir\release" -Recurse -Filter "*.exe" | Select-Object -ExpandProperty FullName

foreach ($exe in $exeFiles) {
    try {
        Set-AuthenticodeSignature -FilePath $exe -Certificate $cert -TimestampServer "http://timestamp.digicert.com" | Out-Null
        Write-Host "  Signed: $(Split-Path $exe -Leaf)" -ForegroundColor Green
    } catch {
        Write-Host "  WARN: Could not sign $exe" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Done! Publisher will show as: $CertName" -ForegroundColor Cyan
Write-Host "NOTE: SmartScreen warning will still appear on other PCs" -ForegroundColor Yellow
Write-Host "      unless they install KleoPadre.pfx in Trusted Root." -ForegroundColor Yellow
