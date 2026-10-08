@echo off
setlocal

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

if not exist "%SCRIPT_DIR%pgstudio.exe" (
    echo [ERROR] File pgstudio.exe tidak ditemukan di direktori ini!
    echo Jika Anda mendownload source code, jalankan build.bat terlebih dahulu.
    echo Jika Anda mendownload file release, pastikan file pgstudio.exe berada satu folder dengan script ini.
    echo.
    pause
    exit /b 1
)

echo ========================================================
echo   Memulai pgStudio (PostgreSQL Studio & NexusSH DevOps)
echo   Alamat Web : http://localhost:28432
echo ========================================================
echo.
echo Menjalankan server...
echo Tekan Ctrl+C untuk menghentikan server.
echo.

REM Buka browser otomatis setelah delay 1.5 detik
start "" powershell -Command "Start-Sleep -Milliseconds 1500; Start-Process 'http://localhost:28432'"

REM Jalankan binary server
"%SCRIPT_DIR%pgstudio.exe"

pause
