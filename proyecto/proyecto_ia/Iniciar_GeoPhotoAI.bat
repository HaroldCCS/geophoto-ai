@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

title GeoPhoto AI - Iniciador

if exist "GeoPhotoAI.exe" (
    start "" "GeoPhotoAI.exe"
    exit /b 0
)

if exist "Compilar_EXE.bat" (
    echo Compilando GeoPhotoAI.exe...
    call Compilar_EXE.bat
    if exist "GeoPhotoAI.exe" (
        start "" "GeoPhotoAI.exe"
        exit /b 0
    )
)

where node >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo Iniciando con Node.js...
    start http://localhost:8080/
    node scripts/serve.js
    exit /b 0
)

echo [ERROR] No se pudo iniciar GeoPhoto AI.
pause
