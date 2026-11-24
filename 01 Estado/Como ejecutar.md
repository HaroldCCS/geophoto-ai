---
tipo: guia
actualizado: 2026-11-23
---

# Cómo ejecutar, probar y empaquetar

Los comandos `npm` se corren dentro de `proyecto/proyecto_ia/`.

## Arrancar la app
```bash
cd proyecto/proyecto_ia
```
```bash
npm start
```
Abrir `http://localhost:8080`. Hay que servirla por HTTP (no abrir el `index.html` con doble clic) para que funcionen el service worker, la cámara, el OCR y el inicio de sesión con Google.

En Windows también sirven `iniciar_demo.bat` o `GeoPhotoAI.exe` (lanzador C# en `Launcher.cs`).

## Pruebas
```bash
npm install
```
```bash
npm test
```
Corre las 16 pruebas de `scripts/test_*.js`, incluidas las nuevas `test_layout_model.js` (ajustes de foto) y `test_metadata_core.js` (parser de la IA).

### Probar Drive/Sheets sin credenciales
`scripts/browser/fake_google.js` simula Drive y Sheets en el navegador. En la consola de la app:
```js
eval(await (await fetch('/__test__/fake_google.js')).text()) // copiar antes el archivo a app/__test__/
const fake = createFakeGoogle(); Cloud._http = fake.http;
Cloud.settings.clientId = 'x.apps.googleusercontent.com';
Cloud._setTokenForTests({ access_token: 'x', expiresAt: Date.now() + 3600e3 });
```
Después genera un informe y revisa `fake.files` y `fake.sheets`.

## Evaluación de la IA (OE3)
```bash
npm run eval
```
Lee todas las fotos `proyecto/BUPA-*` y compara lo que el OCR lee en el sello contra el EXIF. Deja `eval/resultados_extraccion.csv` y `eval/resumen_extraccion.json`. Resultados en [[Evaluacion IA]].

## Google Drive y Sheets (configuración única)
1. <https://console.cloud.google.com> → crear proyecto.
2. *APIs y servicios → Biblioteca*: habilitar **Google Drive API** y **Google Sheets API**.
3. *Pantalla de consentimiento OAuth*: tipo Externo; agregar tu correo como usuario de prueba.
4. *Credenciales → Crear ID de cliente OAuth → Aplicación web*. En "Orígenes de JavaScript autorizados" poner `http://localhost:8080` y `http://127.0.0.1:8080` (este último lo usa `GeoPhotoAI.exe`), más el dominio donde se publique.
5. En la app: **Descargar → Nube** → pegar el Client ID → **Conectar con Google**.

> [!warning] Permiso `drive` completo
> La app pide el permiso `drive` completo para poder escribir en carpetas existentes que elija el usuario. Sirve para el prototipo en modo "prueba" (hasta 100 usuarios). Para publicar la app habría que pasar a `drive.file` + Google Picker o pasar la verificación de Google.

## Empaquetado portable (Windows)
`scripts/package_portable.ps1` genera `GeoPhotoAI_Portable/` y el `.zip`. Ambos están en `.gitignore`: se regeneran, no se versionan. **Están desactualizados** respecto al código actual: hay que regenerarlos en Windows.
