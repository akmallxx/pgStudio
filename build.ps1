<#
.SYNOPSIS
    Build script pgStudio untuk Windows PowerShell.
    Menghasilkan frontend bundle dan binary mandiri pgstudio.exe.
#>

$ErrorActionPreference = "Stop"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  pgStudio - Windows PowerShell Build Script" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Validasi Tools
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js / npm tidak ditemukan di PATH!" -ForegroundColor Red
    Exit 1
}

if (-not (Get-Command go -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Go compiler tidak ditemukan di PATH!" -ForegroundColor Red
    Exit 1
}

# 2. Build Frontend
Write-Host "[1/3] Membangun Frontend (React 19 + PWA Assets)..." -ForegroundColor Yellow
npm run build

# 3. Sinkronisasi aset ke folder embed
Write-Host "[2/3] Menyalin aset ke direktori embed Go..." -ForegroundColor Yellow
if (-not (Test-Path "backend-go\dist")) {
    New-Item -ItemType Directory -Path "backend-go\dist" | Out-Null
}
Copy-Item -Path "dist\*" -Destination "backend-go\dist\" -Recurse -Force

# 4. Compile Go Binary
Write-Host "[3/3] Mengompilasi executable pgstudio.exe..." -ForegroundColor Yellow
Push-Location "backend-go"
$env:CGO_ENABLED = "0"
go build -ldflags="-s -w" -o "..\pgstudio.exe" .
Pop-Location

Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host " [SUKSES] pgstudio.exe berhasil dibuat!" -ForegroundColor Green
Write-Host " Jalankan .\start.bat untuk memulai aplikasi." -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
