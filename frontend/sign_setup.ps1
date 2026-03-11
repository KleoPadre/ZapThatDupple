# Подписывает exe самоподписанным сертификатом KleoPadre
# Запускать от имени администратора ПОСЛЕ build.ps1
# из папки C:\ZapThatDupple\frontend\

$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path }

$CertName = "KleoPadre"
$CertFile = "$ScriptDir\KleoPadre.pfx"
$CertPass = "ZapThatDupple2024"

Write-Host "=== Code Signing ===" -ForegroundColor Cyan

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

    $pw = ConvertTo-SecureString -String $CertPass -Force -AsPlainText
    Export-PfxCertificate -Cert $cert -FilePath $CertFile -Password $pw | Out-Null

    try {
        $store = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root","LocalMachine")
        $store.Open("ReadWrite")
        $store.Add($cert)
        $store.Close()
        Write-Host "OK Added to Trusted Root" -ForegroundColor Green
    } catch {
        Write-Host "WARNING: Run as admin to add to Trusted Root" -ForegroundColor Yellow
    }
    Write-Host "OK Certificate created" -ForegroundColor Green
} else {
    Write-Host "OK Certificate exists" -ForegroundColor Green
}

Write-Host "Signing executables..." -ForegroundColor Yellow
$pw   = ConvertTo-SecureString -String $CertPass -Force -AsPlainText
$cert = Get-PfxCertificate -FilePath $CertFile -Password $pw

Get-ChildItem "$ScriptDir\release" -Recurse -Filter "*.exe" | ForEach-Object {
    try {
        Set-AuthenticodeSignature -FilePath $_.FullName -Certificate $cert `
            -TimestampServer "http://timestamp.digicert.com" | Out-Null
        Write-Host "  Signed: $($_.Name)" -ForegroundColor Green
    } catch {
        Write-Host "  WARN: Could not sign $($_.Name)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Done! Publisher: $CertName" -ForegroundColor Cyan
