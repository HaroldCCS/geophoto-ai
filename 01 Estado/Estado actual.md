---
tipo: estado
fecha_revision: 2026-11-23
commit_base: 5f8cdd4
---

# Estado actual del proyecto (revisión 23-nov-2026)

Revisión hecha leyendo `app.js` (6.038 líneas), `index.html`, `sw.js` y abriendo la app en el navegador. **Conclusión corta:** la interfaz está muy avanzada y el motor que inyecta fotos en Word/Excel es real, pero **varios módulos que la documentación da por hechos estaban simulados**: la IA, la nube, la cámara y la gestión de proyectos.

## Inventario por módulo

| Módulo | Estado | Detalle |
|---|---|---|
| PWA (manifest, service worker, instalable) | #estado/hecho | `sw.js` precachea la app y las librerías locales. |
| Persistencia offline (IndexedDB) | #estado/hecho | `OfflineStore` guarda config, fotos (dataURL), plantilla y su binario. **Un solo proyecto**: no hay separación por proyecto. |
| Cámara en vivo | #estado/simulado | Abre `getUserMedia`, pero `takePhoto()` **no captura el video**: guarda una foto aleatoria de Unsplash. |
| Estampado tipo TimeMark (fecha, GPS, CTM12, mini-mapa, logo) | #estado/parcial | El motor de dibujo existe y es completo, pero solo se aplica a fotos con `source === 'camera'` (que eran falsas). |
| Importar desde galería | #estado/hecho | Guarda el archivo original intacto. **No lee EXIF.** |
| Carga de plantillas .docx/.xlsx | #estado/hecho | Parser OpenXML real con JSZip: detecta tablas, celdas para fotos, logos protegidos y fotos preexistentes. |
| "IA" de reconocimiento de plantillas | #estado/simulado | `simulateAiScanning()` es una barra de progreso con textos. La detección real es **heurística** (OpenXML), no hay modelo (YOLO/LayoutLM no existen en el código). |
| Extracción de metadatos de fotos (núcleo académico) | #estado/falta | No hay OCR ni lectura EXIF. Es lo que exige el OE1 de la [[Propuesta academica]]. |
| Inyección en Word / Excel y paginación | #estado/hecho | `injectPhotosIntoUserDocx` / `injectPhotosIntoUserXlsx`: clona páginas, respeta logos, tamaño uniforme (lienzo 1600×1200 al editar). |
| Exportación PDF | #estado/falta | Aparece en la documentación y en regex de nombres, pero no hay generador PDF. |
| Mesa: arrastrar y soltar, páginas P1/P2, mover a página | #estado/hecho | |
| Mesa: ajuste (zoom, paneo, ±90°, ajustar/llenar, restablecer, guardar) | #estado/parcial | Faltan rotación libre, 180° directo, espejo, cuadrícula conmutable, bloqueo de proporciones, tamaño mín./máx. |
| Mesa: selección múltiple | #estado/parcial | Se pueden marcar fotos pero **no hay acción** (ni retirar ni mover en bloque). |
| Gestión de proyectos (RF-01) | #estado/falta | Proyecto fijo en código (`PRJ-2026-001 Obra Subestación Sur`). Sin estado, usuario, fechas ni lista. |
| Versionado de informes | #estado/falta | |
| Google Drive / Sheets | #estado/simulado | `processSyncQueue()` solo muestra un aviso "subido". La UI de Drive fue retirada. No hay OAuth ni llamadas a APIs. |
| Cola de sincronización offline | #estado/simulado | `state.syncQueue` vive en memoria, no se persiste y nunca se llena. |
| Compartir (WhatsApp/Telegram/correo) | #estado/falta | Documentado, no implementado. |
| Fotos demo | ⚠️ | Vienen de Unsplash: sin internet salen rotas (se ve en la mesa). |

## Pruebas existentes
`proyecto/proyecto_ia/scripts/test_*.js`: pruebas en Node que cargan `app.js` con un DOM falso y verifican la inyección Excel/Word, la rotación y el encuadre. No hay `package.json`; se ejecutan con `node scripts/test_x.js`.

## Riesgos detectados
- `app.js` es un único archivo de 6.000 líneas con todo en `window.*`: cualquier cambio requiere cuidado.
- Fotos guardadas como dataURL en IndexedDB: con muchas fotos de 3–5 MB el almacenamiento crece rápido (≈1,33× por base64).
- La documentación de `proyecto_ia/docs` sobrevende el estado (habla de YOLOv8, FastAPI, OneDrive). Para la sustentación conviene alinearla con lo real.

Siguiente: [[Brechas]] · [[Plan de trabajo]]
