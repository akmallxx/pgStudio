@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo   pgStudio - Windows Build Script (PWA + Single Binary)
echo ========================================================
echo.

REM 1. Verifikasi instalasi Node.js dan Go
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm / Node.js tidak ditemukan! Mohon install Node.js terlebih dahulu.
    pause
    exit /b 1
)

where go >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Golang tidak ditemukan! Mohon install Go 1.22+ terlebih dahulu.
    pause
    exit /b 1
)

echo [1/3] Membangun Frontend (React 19 + PWA Assets)...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Gagal mem-bundle frontend Vite.
    pause
    exit /b 1
)

echo.
echo [2/3] Menyalin aset ke direktori embed Go...
if not exist "backend-go\dist" mkdir "backend-go\dist"
xcopy /E /I /Y "dist\*" "backend-go\dist\" >nul

echo.
echo [3/3] Mengompilasi binary executable pgstudio.exe...
cd backend-go
set CGO_ENABLED=0
go build -ldflags="-s -w" -o ..\pgstudio.exe .
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Gagal mengompilasi binary Go.
    cd ..
    pause
    exit /b 1
)
cd ..

echo.
echo ========================================================
echo  [SUKSES] pgstudio.exe berhasil dibuat!
echo  Ukuran file: Single binary standalone dengan UI ter-embed.
echo.
echo  Untuk menjalankan, silakan klik ganda start.bat
echo ========================================================
echo.
pause
