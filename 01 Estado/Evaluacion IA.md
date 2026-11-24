---
tipo: resultados
fecha: 2026-11-23
fuente: proyecto/proyecto_ia/eval/resumen_extraccion.json
---

# Evaluación de la extracción de metadatos con IA (OE3, primera medición)

**Conjunto:** 303 fotos TimeMark de 19 puntos de inspección (`proyecto/BUPA-*`, vía Berlín–Pamplona, feb. 2025).
**Referencia (ground truth):** el EXIF de cada foto (fecha: 303 fotos; GPS: 295 fotos).
**Método:** el mismo pipeline de la app (`metadata-core.js` + Tesseract.js, modelo `eng`), con el OCR **sin pistas del EXIF**. Así se mide qué tan bien lee el sello por sí solo.
**Reproducir:** `npm run eval` en `proyecto/proyecto_ia`. El detalle foto por foto queda en `eval/resultados_extraccion.csv`.

## Resultados

| Campo | Lectura del sello por OCR (sin EXIF) | Con fusión EXIF + OCR (lo que usa la app) |
|---|---|---|
| Fecha y hora (±2 min) | **73,3 %** (222/303) | **100 %** (303/303) |
| Coordenadas (≤30 m) | **69,5 %** (205/295) | **97,7 %** (296/303; 1 foto sin EXIF GPS se recuperó por OCR) |
| Lugar (municipio o vía) | **90,8 %** (275/303) | igual (solo lo trae el sello) |
| Departamento (validado contra el catálogo) | **76,2 %** (231/303) | igual |
| Tiempo por foto | mediana **0,68 s**, media 2,3 s, p90 7,2 s | — |

## Lectura de los números
- **El EXIF y el sello se complementan.** El EXIF da fecha y GPS fiables. El sello agrega lo que el EXIF no tiene: la vía, el municipio y el departamento. Cuando ambos coinciden, el campo queda marcado como *verificado* (confianza 0,99).
- **Errores del OCR:** 16 fechas y 25 coordenadas leídas mal (por ejemplo `2025-02-20` en lugar de `2025-02-26`). En la app no llegan al informe cuando hay EXIF, porque la discrepancia baja la confianza y se usa el EXIF. **Sin EXIF** (capturas de pantalla, fotos reenviadas por WhatsApp) el riesgo es real, y por eso el panel permite corregir a mano.
- **Puntos difíciles:** `BUPA-4-0361` (capturas de video, solo fecha), `0349`, `0354` y `0368` (sello sobre cielo o carretera clara). Coincide con la limitación que declara la propuesta: luz y fondo.
- **Tiempo:** la mayoría de fotos se procesan en menos de 1 s. Las lentas son las que necesitan los tres reintentos de umbral.

## Para el documento de grado
- Estos resultados sirven para la parte de **precisión** del OE3. Falta la parte de **tiempo**: cronometrar a un profesional llenando un informe a mano y con la app (mismo set de fotos).
- Mejoras con impacto medible: binarización adaptativa (contraste local) para fondos claros y usar el EXIF como pista también en la lectura (hoy se usa solo para desempatar).

Relacionado: [[Propuesta academica]] · [[Estado actual]] · [[2026-11-23]]
