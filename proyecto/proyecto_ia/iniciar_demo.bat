@echo off
title GeoPhoto Report AI - PWA Multiplataforma
echo ========================================================
echo    GeoPhoto Report AI - Prototipo PWA e Instalable
echo    Compatible con Web, Escritorio (Windows/Mac) y Movil
echo ========================================================
echo.

set SERVER_URL=http://localhost:8080

rem Verificar si Node.js esta instalado
where node >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo Iniciando servidor local PWA con Node.js en %SERVER_URL%...
    start /b "" node "%~dp0scripts\serve.js" >nul 2>nul
    timeout /t 1 >nul
    start "" "%SERVER_URL%"
    goto :fin
)

rem Si no hay Node.js, verificar Python
where python >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo Iniciando servidor local PWA con Python en %SERVER_URL%...
    start /b "" python -m http.server 8080 --directory "%~dp0app" >nul 2>nul
    timeout /t 1 >nul
    start "" "%SERVER_URL%"
    goto :fin
)

rem Fallback si no hay runtime de servidor: abrir directamente como archivo
echo No se detecto servidor HTTP local. Abriendo en modo navegador local...
start "" "%~dp0app\index.html"

:fin
echo.
echo GeoPhoto Report AI iniciado correctamente.
echo.
echo Para instalar como Aplicacion de Escritorio:
echo  1. En Google Chrome o Microsoft Edge, haz clic en el boton "Instalar"
echo     ubicado en el encabezado de la aplicacion o en la barra de direcciones.
echo.
timeout /t 3 >nul
exit
