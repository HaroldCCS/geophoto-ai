/**
 * Evaluación del componente de IA de extracción de metadatos (OE3 de la propuesta).
 *
 * Recorre las fotos de campo (carpetas BUPA-*), aplica EXACTAMENTE el mismo pipeline que la
 * app (app/modules/metadata-core.js + Tesseract.js con el modelo local de app/lib/tesseract)
 * y compara lo leído por OCR en el sello contra el EXIF de la foto, que actúa como referencia
 * independiente (ground truth) para fecha y coordenadas.
 *
 * Uso (desde proyecto_ia/):
 *   npm install
 *   node scripts/eval_extraccion.js [carpeta_fotos] [--limit N]
 * Por defecto lee ../ (carpeta "proyecto", donde están las BUPA-*).
 * Escribe: eval/resultados_extraccion.csv y eval/resumen_extraccion.json
 */
const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');
const { createWorker } = require('tesseract.js');
const MC = require('../app/modules/metadata-core.js');

const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
const ROOT = path.resolve(args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--limit') || path.join(__dirname, '..', '..'));
const OUT_DIR = path.join(__dirname, '..', 'eval');
const THRESHOLDS = [245, 230, 200];
const DATE_TOL_S = 120;   // tolerancia para considerar correcta la fecha leída
const GPS_TOL_M = 30;     // tolerancia para considerar correctas las coordenadas leídas

function listPhotos(root) {
  const out = [];
  for (const dir of fs.readdirSync(root).filter(d => /^BUPA-/i.test(d)).sort()) {
    const walk = (p) => {
      for (const f of fs.readdirSync(p)) {
        const full = path.join(p, f);
        if (fs.statSync(full).isDirectory()) walk(full);
        else if (/\.jpe?g$/i.test(f)) out.push({ point: dir, file: full });
      }
    };
    walk(path.join(root, dir));
  }
  return out;
}

function csvCell(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

(async () => {
  const photos = listPhotos(ROOT).slice(0, LIMIT);
  if (!photos.length) { console.error(`No se encontraron fotos BUPA-* en ${ROOT}`); process.exit(1); }
  console.log(`Evaluando ${photos.length} fotos de ${ROOT}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const worker = await createWorker('eng', 1, {
    langPath: path.join(__dirname, '..', 'app', 'lib', 'tesseract', 'lang'),
    cachePath: path.join(OUT_DIR, '.cache'),
    gzip: true
  });

  const rows = [];
  const tStart = Date.now();
  for (let i = 0; i < photos.length; i++) {
    const { point, file } = photos[i];
    const t0 = Date.now();
    const buf = fs.readFileSync(file);
    const exif = MC.parseExif(buf);
    let img;
    try { img = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 2048 }); } catch (e) { console.warn('No se pudo decodificar', file); continue; }

    // OCR SIN pistas del EXIF: mide la capacidad real de lectura del sello
    let best = null;
    for (const threshold of THRESHOLDS) {
      const bin = MC.binarizeStampRegion(img, { threshold });
      const enc = jpeg.encode({ data: Buffer.from(bin.data.buffer), width: bin.width, height: bin.height }, 92).data;
      const { data } = await worker.recognize(enc);
      const parsed = MC.parseStampText(data.text);
      if (!best || parsed.fields > best.parsed.fields || (parsed.fields === best.parsed.fields && data.confidence > best.conf)) {
        best = { parsed, conf: data.confidence, threshold, text: data.text };
      }
      if (parsed.complete) break;
    }
    const ms = Date.now() - t0;
    const fused = MC.fuseMetadata(exif, best.parsed, best.conf);
    const o = best.parsed;

    const dateDiff = exif && exif.dateTimeOriginal && o.date ? Math.abs(new Date(exif.dateTimeOriginal) - new Date(o.date)) / 1000 : null;
    const gpsDiff = exif && exif.lat != null && o.coords ? MC.distanceMeters(exif.lat, exif.lon, o.coords.lat, o.coords.lon) : null;
    rows.push({
      punto: point,
      archivo: path.basename(file),
      exif_fecha: exif && exif.dateTimeOriginal,
      exif_lat: exif && exif.lat, exif_lon: exif && exif.lon,
      ocr_fecha: o.date,
      ocr_lat: o.coords && o.coords.lat, ocr_lon: o.coords && o.coords.lon,
      ocr_via: o.place && o.place.via, ocr_municipio: o.place && o.place.municipio, ocr_departamento: o.place && o.place.departamento,
      dif_fecha_s: dateDiff, dif_gps_m: gpsDiff != null ? Math.round(gpsDiff * 10) / 10 : null,
      fecha_ok: dateDiff != null ? dateDiff <= DATE_TOL_S : null,
      gps_ok: gpsDiff != null ? gpsDiff <= GPS_TOL_M : null,
      lugar_detectado: !!(o.place && (o.place.municipio || o.place.departamento)),
      depto_detectado: !!(o.place && o.place.departamento),
      ocr_confianza: Math.round(best.conf), umbral: best.threshold,
      confianza_fusion: fused.confidence.overall,
      ms
    });
    const r = rows[rows.length - 1];
    process.stdout.write(`\r[${i + 1}/${photos.length}] ${point}/${r.archivo}  fecha:${r.fecha_ok ? 'OK' : '--'} gps:${r.gps_ok ? 'OK' : '--'} lugar:${r.lugar_detectado ? 'OK' : '--'} ${ms}ms      `);
  }
  await worker.terminate();
  console.log('');

  const cols = Object.keys(rows[0]);
  fs.writeFileSync(path.join(OUT_DIR, 'resultados_extraccion.csv'), [cols.join(','), ...rows.map(r => cols.map(c => csvCell(r[c])).join(','))].join('\n'));

  const rate = (pred, base) => { const b = rows.filter(base); return { n: b.length, aciertos: b.filter(pred).length, tasa: b.length ? Math.round((b.filter(pred).length / b.length) * 1000) / 10 : null }; };
  const median = arr => { const s = arr.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const summary = {
    fecha_evaluacion: new Date().toISOString(),
    fotos: rows.length,
    puntos: new Set(rows.map(r => r.punto)).size,
    con_exif_fecha: rows.filter(r => r.exif_fecha).length,
    con_exif_gps: rows.filter(r => r.exif_lat != null).length,
    precision_fecha_ocr: rate(r => r.fecha_ok, r => r.exif_fecha),
    precision_gps_ocr: rate(r => r.gps_ok, r => r.exif_lat != null),
    lectura_lugar: rate(r => r.lugar_detectado, () => true),
    lectura_departamento: rate(r => r.depto_detectado, () => true),
    tiempo_medio_ms: Math.round(rows.reduce((a, r) => a + r.ms, 0) / rows.length),
    tiempo_mediana_ms: median(rows.map(r => r.ms)),
    tiempo_total_s: Math.round((Date.now() - tStart) / 1000),
    tolerancias: { fecha_s: DATE_TOL_S, gps_m: GPS_TOL_M },
    motor: 'tesseract.js 5 (eng LSTM best_int) + binarización por umbral + parser propio'
  };
  fs.writeFileSync(path.join(OUT_DIR, 'resumen_extraccion.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
