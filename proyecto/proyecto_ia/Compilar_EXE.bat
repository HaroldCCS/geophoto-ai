@echo off
setlocal
chcp 65001 >nul
echo ========================================================
echo   Compilando GeoPhotoAI.exe para Windows
echo ========================================================

set "CSC=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"

if not exist "%CSC%" (
    echo [ERROR] No se encontro el compilador de .NET Framework ^(csc.exe^).
    pause
    exit /b 1
)

echo Usando compilador: %CSC%

set "ICON_FLAG="
if exist "app.ico" set "ICON_FLAG=/win32icon:app.ico"

"%CSC%" /nologo /target:winexe /optimize+ /r:System.Windows.Forms.dll /r:System.Drawing.dll %ICON_FLAG% /out:GeoPhotoAI.exe Launcher.cs

if exist "GeoPhotoAI.exe" (
    echo.
    echo ========================================================
    echo   [EXITO] GeoPhotoAI.exe generado correctamente!
    echo ========================================================
    echo.
) else (
    echo.
    echo [ERROR] No se pudo generar GeoPhotoAI.exe
    pause
    exit /b 1
)
