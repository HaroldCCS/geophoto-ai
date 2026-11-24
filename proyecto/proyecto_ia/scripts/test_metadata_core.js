/**
 * Pruebas del núcleo de extracción de metadatos con textos OCR reales
 * (salidas de Tesseract sobre fotos TimeMark de la carpeta BUPA, con sus errores típicos).
 * Ejecutar desde proyecto_ia/:  node scripts/test_metadata_core.js
 */
const assert = require('assert');
const MC = require('../app/modules/metadata-core.js');

const near = (a, b, tol = 1e-4) => Math.abs(a - b) <= tol;
const dms = (d, m, s) => d + m / 60 + s / 3600;

// 1. Lectura limpia
let r = MC.parseStampText('26 feb 2025 10:57:01 a.m.\n7°22\'24.708"N 72°41\'25.302"W\nBerlin-Pamplona\nPamplona\nNorte de Santander');
assert.strictEqual(r.date, '2025-02-26T10:57:01');
assert(near(r.coords.lat, dms(7, 22, 24.708)) && near(r.coords.lon, -dms(72, 41, 25.302)));
assert.strictEqual(r.place.departamento, 'Norte de Santander');
assert.strictEqual(r.place.municipio, 'Pamplona');
assert.strictEqual(r.place.via, 'Berlin-Pamplona');
console.log('[OK] Sello limpio: fecha, coordenadas, vía, municipio y departamento');

// 2. Símbolo de grados leído como dígito ("7522") y como "%"
r = MC.parseStampText('26 feb 2025 10:57:01 a.m.\n7522 24.708 N 72%41 25.302 W\nBerlin-Pamplona\n—— Pamplona\n—— Norte de Santander');
assert(near(r.coords.lat, dms(7, 22, 24.708)), `lat ${r.coords.lat}`);
assert(near(r.coords.lon, -dms(72, 41, 25.302)), `lon ${r.coords.lon}`);
assert.strictEqual(r.place.municipio, 'Pamplona');
console.log('[OK] Grados mal leídos (5 y %) se corrigen');

// 3. Fecha y hora pegadas, p.m.
r = MC.parseStampText('~~ 19feb20252:37:09 p.m.\nCo -7°22\'59.31°N 72°39\'28.956\'W');
assert.strictEqual(r.date, '2025-02-19T14:37:09');
assert(near(r.coords.lat, dms(7, 22, 59.31)) && near(r.coords.lon, -dms(72, 39, 28.956)));
console.log('[OK] Fecha pegada a la hora y p.m. → 24 h');

// 4. Minutos pegados a los segundos con pista EXIF ("72*407.482" = 72°40'7.482")
const exifLon = -dms(72, 40, 7.482);
r = MC.parseStampText('26 feb-2025 11:20:33 a.m.\n7°22"10.296\'N,72*407.482"W', { lat: dms(7, 22, 10.296), lon: exifLon });
assert(near(r.coords.lon, exifLon), `lon ${r.coords.lon}`);
console.log('[OK] Ambigüedad resuelta con la pista del EXIF');

// 5. Formato numérico del estampado propio de la app
r = MC.parseStampText('OBRA X\nFECHA: 23/11/2026 19:14:05\n6.24420, -75.58120');
assert.strictEqual(r.date, '2026-11-23T19:14:05');
assert(near(r.coords.lat, 6.2442) && near(r.coords.lon, -75.5812));
console.log('[OK] Formato numérico dd/mm/aaaa y coordenadas decimales');

// 6. Departamento con error de OCR
assert.strictEqual(MC.matchDepartamento('Norte de Santandcr').name, 'Norte de Santander');
assert.strictEqual(MC.matchDepartamento('Boyaca').name, 'Boyacá');
assert.strictEqual(MC.matchDepartamento('Pamplona'), null);
console.log('[OK] Coincidencia difusa de departamentos');

// 7. Fusión EXIF + OCR
const exif = { dateTimeOriginal: '2025-02-26T10:57:01', lat: 7.37353, lon: -72.69036, make: 'HUAWEI', model: 'X' };
const ocr = MC.parseStampText('26 feb 2025 10:57:01 a.m.\n7°22\'24.708"N 72°41\'25.302"W\nBerlin-Pamplona\nPamplona\nNorte de Santander');
const meta = MC.fuseMetadata(exif, ocr, 80);
assert.strictEqual(meta.sources.date, 'exif+ocr');
assert.strictEqual(meta.sources.gps, 'exif+ocr');
assert(meta.checks.gpsDiffMeters < 30, `diff ${meta.checks.gpsDiffMeters}`);
assert(meta.confidence.overall > 0.8);
assert.strictEqual(meta.municipio, 'Pamplona');
console.log(`[OK] Fusión verificada (GPS EXIF vs OCR: ${meta.checks.gpsDiffMeters} m)`);

// 8. Solo OCR (foto sin EXIF, p. ej. captura de video)
const onlyOcr = MC.fuseMetadata(null, MC.parseStampText('19 feb 2025 4:34:17 p.m.'), 60);
assert.strictEqual(onlyOcr.capturedAt, '2025-02-19T16:34:17');
assert.strictEqual(onlyOcr.sources.date, 'ocr');
console.log('[OK] Sin EXIF: la fecha sale solo del OCR');

// 9. Pie de foto
assert.strictEqual(MC.buildCaption(meta), '26/02/2025 10:57 · Berlin-Pamplona, Pamplona, Norte de Santander · 7.37353, -72.69036');
console.log('[OK] Pie de foto automático');

console.log('--- NÚCLEO DE METADATOS: TODAS LAS PRUEBAS PASARON ---');
