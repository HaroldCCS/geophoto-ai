---
tipo: analisis
actualizado: 2026-11-23
---

# Brechas: lo pedido vs. lo que hay

Cruce de [[Requisitos del cliente]] y [[Propuesta academica]] contra [[Estado actual]].

| Requisito | Hay hoy | Falta | Fase |
|---|---|---|---|
| RF-01 Gestión de proyectos | Proyecto fijo en código | Crear, listar, abrir y cambiar proyectos; fotos y plantilla por proyecto | F1 |
| RQ-06 Metadatos del proyecto | — | ID único, usuario, estado, fechas de creación, modificación e informe, rutas | F1 |
| Cámara real | Simulada (Unsplash) | Capturar el cuadro del video y estampar | F1 |
| OE1/OE2 Extracción de metadatos con IA | — | EXIF + OCR del sello → campos estructurados con confianza | F3 |
| Pies de foto automáticos | Nota manual | Llenar desde metadatos extraídos | F3 |
| RQ-08…16 Ajustes de imagen | Zoom, ±90°, ajustar/llenar | Rotación libre, 180°, espejo H/V, cuadrícula, bloqueo de proporciones, tamaño mín./máx. | F2 |
| RQ-20/22 Persistir ajustes al exportar | Sí para rotación/zoom | Que espejo y rotación libre también lleguen al Word/Excel | F2 |
| RQ-23 Retirar en bloque | Selección sin acción | Retirar seleccionadas (solo de la app), mover en bloque | F2 |
| RQ-17 Organizar entre hojas | Hecho | — | ✔ |
| RQ-19 Tamaño uniforme | Hecho en fotos editadas | Aplicarlo a todas las fotos | F2 |
| RQ-05 Versionado de informes | — | v1.0 / 1.1 / 2.0 automático, historial local, descarga de versiones previas | F4 |
| RQ-01…04 Drive + Sheets | Simulado | OAuth, carpeta por proyecto (nueva o existente), subir fotos e informes, hoja con Proyectos / Versiones / Fotos | F5 |
| RQ-07 Subida diferida offline | Simulado en memoria | Cola persistente en IndexedDB que se procesa al reconectar | F5 |
| OE3 Validación (precisión y tiempo) | — | Script de evaluación de la extracción contra las fotos BUPA | F6 |
| Exportar PDF, compartir | — | Fuera del alcance de esta iteración | Futuro |
| Clasificación de escena (vivienda, cerca, vía…) | — | Modelo de visión (p. ej. MobileNet/ONNX); trabajo futuro | Futuro |

Plan detallado: [[Plan de trabajo]]
