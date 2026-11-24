---
tipo: estado
actualizado: 2026-11-23
version_app: 2.0
---

# Estado actual del proyecto

> [!success] Resumen
> Hay una **versión funcional** del prototipo: proyectos múltiples, IA real que lee las fotos, mesa de ajuste completa, versiones de informe y conexión con Google Drive y Sheets con trabajo offline. 16/16 pruebas automáticas pasan. Lo que falta está en [[Brechas]].

## Inventario por módulo (después de la iteración 1)

| Módulo | Estado | Detalle |
|---|---|---|
| PWA instalable y offline | #estado/hecho | Service worker *network-first* (antes servía código viejo tras actualizar). Precachea también la IA. |
| Proyectos (RF-01, RQ-06) | #estado/hecho | Crear, abrir, editar, eliminar. ID `PRJ-AAAAMMDD-XXXX`, usuario, estado (Borrador / En proceso / Finalizado), fechas, rutas de Drive. Migra los datos de la versión anterior. |
| Cámara en vivo | #estado/hecho | Ahora captura el cuadro real del video; los metadatos salen de los sensores. *No verificado en un teléfono físico.* |
| Estampado tipo TimeMark | #estado/hecho | Sin cambios; se aplica a fotos tomadas con la cámara de la app. |
| Importar desde galería | #estado/hecho | Guarda el nombre de archivo y lanza la extracción con IA. |
| **IA: extracción de metadatos (OE1/OE2)** | #estado/hecho | EXIF + OCR del sello (Tesseract.js local) → fecha, coordenadas, vía, municipio y departamento. Sobre 303 fotos: OCR solo 73 % fecha, 70 % GPS, 91 % lugar; con fusión EXIF 100 % fecha y 98 % GPS. Ver [[Evaluacion IA]]. |
| Pies de foto automáticos | #estado/parcial | Descripción y coordenadas se llenan solas; el Excel usa la fecha real de captura. La plantilla Word no tiene celdas de pie de foto: allí solo van las imágenes. |
| Plantillas .docx/.xlsx | #estado/hecho | Heurística OpenXML (sin modelo entrenado; la animación "IA" de plantillas sigue siendo cosmética). |
| Mesa: ajuste (RQ-08…16, RQ-22) | #estado/hecho | Zoom, rotación libre, 90/180/270, espejo H/V, cuadrícula, auto-ajuste, llenar, bloqueo de proporciones, tamaño mín./máx., restablecer, guardar, aplicar a la página. Vista previa = exportación. |
| Tamaño uniforme (RQ-19) | #estado/hecho | Todas las fotos se exportan a 1600×1200 (desactivable). |
| Selección múltiple (RQ-23) | #estado/hecho | Retirar (solo de la app) y mover a otra página. |
| Versionado de informes (RQ-05) | #estado/hecho | 1.0 → 1.1 (ajustes) → 2.0 (cambian fotos o plantilla); historial con re-descarga. |
| Google Drive + Sheets (RQ-01…04) | #estado/parcial | Implementado y probado contra una API simulada. **Falta probar con una cuenta real** (requiere Client ID). |
| Cola offline (RQ-07) | #estado/hecho | Persistente en IndexedDB; se procesa al reconectar o al conectar la cuenta. |
| Exportar PDF / compartir | #estado/falta | |
| Paquete portable `.exe` | #estado/parcial | El script existe pero el paquete actual está desactualizado: regenerarlo en Windows. |

## Errores corregidos en el código heredado
- Exportar a Word **sin plantilla propia** (el caso por defecto) fallaba siempre con `triggerDownload is not defined`.
- La cámara guardaba fotos aleatorias de Unsplash en lugar de capturar.
- El servidor local enviaba los archivos con 1 h de caché y el service worker servía primero la caché: tras editar el código se veía la versión vieja.
- La "sincronización" con la nube era solo un aviso en pantalla.

## Riesgos que siguen abiertos
- Las fotos se guardan como dataURL en IndexedDB: con cientos de fotos de 2–5 MB el almacenamiento del navegador puede llenarse. Siguiente mejora: guardarlas como `Blob`.
- El OCR depende de que el sello sea legible: sobre fondos claros (cielo, carretera iluminada) falla más. La fusión con EXIF compensa fecha y GPS, pero no el lugar.
- El permiso `drive` completo sirve para el prototipo. Para producción: `drive.file` + Google Picker.
- La documentación de `proyecto_ia/docs` todavía describe YOLO/LayoutLM/FastAPI como si existieran.

## Pruebas
`npm test` en `proyecto/proyecto_ia` → 16/16. Detalle en [[Como ejecutar]].

Ver también: [[Mapa del codigo]] · [[Plan de trabajo]] · [[2026-11-23]]
