---
tipo: plan
actualizado: 2026-11-23
---

# Plan de trabajo

Orden pensado para que cada fase deje la app usable y para que lo más valioso de la tesis (la IA de extracción) quede pronto. Cada fase termina en un commit y una entrada en la [[04 Bitacora/2026-11-23|bitácora]].

## Decisiones de diseño
- **Sin framework ni build.** Se respeta la arquitectura existente (JS plano + librerías en `app/lib`). El código nuevo va en **módulos aparte** (`app/modules/*.js`) para no engordar `app.js`.
- **100 % offline primero.** Todo se guarda en IndexedDB; la nube es una capa que sincroniza cuando hay red.
- **IA en el dispositivo.** OCR con **Tesseract.js** (WASM, modelo `eng` local en `app/lib/tesseract/`; en las pruebas leyó mejor coordenadas que `spa`): funciona sin internet y sin costo por foto. Google Cloud Vision queda como mejora opcional.
- **Google directo desde el navegador** con Google Identity Services (token OAuth) + REST de Drive y Sheets. No hace falta backend.

## Fases

### F1 · Proyectos y cámara real ✅
- Almacén `projects` en IndexedDB (DB v2) con migración del estado anterior a un primer proyecto.
- Metadatos RQ-06: `id` (`PRJ-AAAAMMDD-xxxx`), nombre, código, cliente, usuario, estado, `createdAt`, `updatedAt`, `lastReportAt`, carpeta y rutas de Drive.
- Selector de proyectos en el encabezado: crear, cambiar, editar estado.
- `takePhoto()` captura de verdad el cuadro del `<video>` (si no hay cámara, avisa en lugar de inventar foto).
- Arranque sin fotos demo de internet.
- **Hecho cuando:** dos proyectos con fotos distintas sobreviven a recargar la página.

### F2 · Mesa de ajuste completa ✅
- Modal de ajuste: rotación libre (−180…180°), botones 90/180/270, espejo horizontal/vertical, cuadrícula conmutable, auto-ajuste, bloqueo de proporciones, límites de tamaño mín./máx. configurables.
- El render de exportación (`prepareStampedImageBytes`) aplica espejo y rotación libre.
- Selección múltiple: **Retirar seleccionadas** (con confirmación, aclara que no se borra del dispositivo) y **Mover a página**.
- **Hecho cuando:** una foto girada 17° y en espejo sale igual en el .docx/.xlsx.

### F3 · IA: extracción de metadatos de fotos ✅
- Lector EXIF propio (fecha, GPS, cámara, orientación), sin dependencias.
- OCR del sello (recorte de la zona inferior derecha y binarización por umbral, con reintentos a 245/230/200) con Tesseract.js y el modelo `eng` (lee mejor el símbolo ° que `spa`).
- Parser del texto: fecha (`26 feb 2025 10:57:01 a.m.`), coordenadas DMS, vía, municipio, departamento.
- Fusión EXIF + OCR con **confianza por campo** (concordancia GPS < 30 m sube la confianza).
- Panel de metadatos por foto (editable) y pie de foto automático.
- **Hecho cuando:** las fotos de `BUPA-4-0324` muestran fecha, coordenadas y municipio sin teclear nada.

### F4 · Versionado de informes ✅
- Cada generación guarda el informe en IndexedDB con versión semántica: **mayor** si cambió el conjunto de fotos o la plantilla; **menor** si solo cambiaron ajustes o textos.
- Historial en la vista Descargar: volver a descargar cualquier versión.
- **Hecho cuando:** generar tres veces deja v1.0, v1.1 y v2.0 en el historial.

### F5 · Google Drive + Sheets y sincronización diferida ✅ (falta prueba con cuenta real)
- Conexión: Client ID configurable, botón "Conectar con Google".
- Por proyecto: carpeta `GeoPhoto AI/<ID> - <Nombre>/` con subcarpetas `Fotos/` e `Informes/`; el usuario elige crear nueva o usar una existente (pegando enlace o ID).
- Hoja `GeoPhoto AI - Registro` con pestañas **Proyectos** (RQ-06), **Versiones** (RQ-05) y **Fotos** (metadatos extraídos + ruta).
- Cola `sync_queue` persistente en IndexedDB; se procesa al conectar o al recuperar internet (RQ-07).
- Opcional por exportación: "Guardar también en Drive" (RQ-04).
- **Hecho cuando:** con un Client ID válido, generar un informe crea carpeta, sube fotos e informe y agrega filas a la hoja; sin internet queda en cola y se sube al volver.

### F6 · Validación y cierre ✅ (primera ronda)
- Script `scripts/eval_extraccion.js`: compara OCR vs. EXIF en las fotos BUPA y reporta precisión por campo y tiempo medio (insumo para el OE3).
- Pruebas de regresión de los módulos nuevos.
- Actualizar [[Estado actual]] y la documentación heredada.

## Conexión con Google (paso a paso para el usuario)
1. <https://console.cloud.google.com> → crear proyecto.
2. *APIs y servicios → Biblioteca*: habilitar **Google Drive API** y **Google Sheets API**.
3. *Pantalla de consentimiento OAuth*: tipo Externo, agregar tu correo como usuario de prueba.
4. *Credenciales → Crear ID de cliente OAuth → Aplicación web*; en "Orígenes autorizados" poner `http://localhost:8080` (y el dominio donde se publique).
5. Copiar el Client ID y pegarlo en la app: **Descargar → Nube (Google Drive)**.

La app usa el permiso `drive.file` (solo ve los archivos que ella misma crea o que el usuario abre con ella) y `spreadsheets`.

## Fuera de alcance por ahora
Exportar PDF, compartir por WhatsApp/correo, OneDrive/SharePoint, clasificación de escena con modelo de visión, y migrar fotos de dataURL a Blob.

## Próxima iteración (propuesta)
1. **Probar Drive/Sheets con una cuenta real** (crear Client ID, ver [[Como ejecutar]]).
2. **Probar en teléfono** Android/iPhone: cámara, GPS, instalación PWA, rendimiento del OCR.
3. Guardar fotos como `Blob` en IndexedDB (menos espacio, más fotos por proyecto).
4. Pie de foto en plantillas Word (detectar la celda de texto bajo cada foto).
5. Mejorar OCR en fondos claros: binarización adaptativa por contraste local.
6. Medir el **tiempo manual vs. automático** con un usuario real (segunda mitad del OE3).
7. Exportar PDF y compartir (WhatsApp/correo vía Web Share API).
8. Alinear `proyecto_ia/docs` con lo implementado (quitar YOLO/FastAPI o marcarlos como trabajo futuro).
