---
tipo: guia
actualizado: 2026-11-23
---

# Cómo ejecutar, probar y empaquetar

Todo desde la raíz del repo (`omar_especializacion/`).

## Arrancar la app
```bash
node proyecto/proyecto_ia/scripts/serve.js
```
Abrir `http://localhost:8080`. Hace falta servirla por HTTP (no con doble clic al `index.html`) para que funcionen el service worker, la cámara y el inicio de sesión de Google.

En Windows también sirven `iniciar_demo.bat` o `GeoPhotoAI.exe` (lanzador C# en `Launcher.cs`).

## Pruebas
```bash
node proyecto/proyecto_ia/scripts/test_excel_e2e.js
```
Cada `scripts/test_*.js` es independiente. Las nuevas pruebas de esta iteración están listadas en [[2026-11-23]].

## Google Drive y Sheets (configuración única)
Ver la sección "Conexión con Google" en [[Plan de trabajo]]. Resumen: crear un *OAuth Client ID* tipo "Aplicación web" en Google Cloud Console, habilitar **Google Drive API** y **Google Sheets API**, agregar `http://localhost:8080` como origen autorizado y pegar el Client ID en **Descargar → Nube**.

## Empaquetado portable (Windows)
`scripts/package_portable.ps1` genera `GeoPhotoAI_Portable/` y el `.zip`. Ambos están en `.gitignore`: se regeneran, no se versionan.
