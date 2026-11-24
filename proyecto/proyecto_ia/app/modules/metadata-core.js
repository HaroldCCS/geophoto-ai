/**
 * GeoPhoto AI - Núcleo de extracción de metadatos (OE1 / OE2)
 *
 * Funciones puras, sin DOM, usadas igual en el navegador y en Node (scripts/eval_extraccion.js):
 *  - parseExif(arrayBuffer)            → fecha original, GPS, cámara y orientación del JPEG
 *  - binarizeStampRegion(img, opts)     → recorte del sello y binarización (texto blanco → negro)
 *  - parseStampText(text, hints)        → fecha, coordenadas DMS y lugar desde el texto OCR
 *  - fuseMetadata(exif, ocr)            → combina ambas fuentes con confianza por campo
 *  - buildCaption(meta)                 → pie de foto automático para el informe
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MetadataCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ==========================================
  // 1. EXIF (JPEG APP1)
  // ==========================================
  const TYPE_SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

  function parseExif(buffer) {
    try {
      const view = new DataView(buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
      if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) return null;
      let offset = 2;
      while (offset + 4 <= view.byteLength) {
        const marker = view.getUint16(offset);
        const size = view.getUint16(offset + 2);
        if (marker === 0xFFE1 && view.getUint32(offset + 4) === 0x45786966) { // "Exif"
          return readTiff(view, offset + 10);
        }
        if ((marker & 0xFF00) !== 0xFF00 || marker === 0xFFDA) break;
        offset += 2 + size;
      }
    } catch (e) { /* EXIF corrupto: se ignora */ }
    return null;
  }

  function readTiff(view, start) {
    const little = view.getUint16(start) === 0x4949;
    const u16 = o => view.getUint16(o, little);
    const u32 = o => view.getUint32(o, little);
    const readIfd = (ifdOffset) => {
      const tags = {};
      const base = start + ifdOffset;
      if (base + 2 > view.byteLength) return tags;
      const count = u16(base);
      for (let i = 0; i < count; i++) {
        const e = base + 2 + i * 12;
        if (e + 12 > view.byteLength) break;
        const tag = u16(e), type = u16(e + 2), n = u32(e + 4);
        const bytes = (TYPE_SIZES[type] || 1) * n;
        const valOff = bytes > 4 ? start + u32(e + 8) : e + 8;
        tags[tag] = readValue(view, type, n, valOff, little);
      }
      return tags;
    };
    const ifd0 = readIfd(u32(start + 4));
    const exif = ifd0[0x8769] ? readIfd(ifd0[0x8769]) : {};
    const gps = ifd0[0x8825] ? readIfd(ifd0[0x8825]) : {};

    const out = {
      make: clean(ifd0[0x010F]),
      model: clean(ifd0[0x0110]),
      orientation: ifd0[0x0112] || 1,
      software: clean(ifd0[0x0131]),
      dateTimeOriginal: null,
      lat: null,
      lon: null,
      altitude: null
    };
    const dt = clean(exif[0x9003] || exif[0x9004] || ifd0[0x0132]);
    if (dt) {
      const m = dt.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
      if (m) out.dateTimeOriginal = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
    }
    const toDeg = (arr, ref) => {
      if (!Array.isArray(arr) || arr.length < 3) return null;
      let v = arr[0] + arr[1] / 60 + arr[2] / 3600;
      if (ref === 'S' || ref === 'W') v = -v;
      return Number.isFinite(v) ? v : null;
    };
    out.lat = toDeg(gps[2], clean(gps[1]));
    out.lon = toDeg(gps[4], clean(gps[3]));
    if (out.lat === 0 && out.lon === 0) { out.lat = null; out.lon = null; }
    if (typeof gps[6] === 'number') out.altitude = gps[5] === 1 ? -gps[6] : gps[6];
    return out;
  }

  function readValue(view, type, n, off, little) {
    if (off + (TYPE_SIZES[type] || 1) * n > view.byteLength) return null;
    if (type === 2) {
      let s = '';
      for (let i = 0; i < n; i++) { const c = view.getUint8(off + i); if (!c) break; s += String.fromCharCode(c); }
      return s;
    }
    const vals = [];
    for (let i = 0; i < n; i++) {
      if (type === 3) vals.push(view.getUint16(off + i * 2, little));
      else if (type === 4) vals.push(view.getUint32(off + i * 4, little));
      else if (type === 9) vals.push(view.getInt32(off + i * 4, little));
      else if (type === 5 || type === 10) {
        const a = type === 5 ? view.getUint32(off + i * 8, little) : view.getInt32(off + i * 8, little);
        const b = type === 5 ? view.getUint32(off + i * 8 + 4, little) : view.getInt32(off + i * 8 + 4, little);
        vals.push(b ? a / b : 0);
      } else vals.push(view.getUint8(off + i));
    }
    return n === 1 ? vals[0] : vals;
  }

  function clean(s) { return typeof s === 'string' ? s.replace(/\0/g, '').trim() || null : null; }

  // ==========================================
  // 2. PREPROCESAMIENTO DEL SELLO
  // ==========================================
  // img: { data (RGBA), width, height }. Recorta la zona inferior derecha donde las apps tipo
  // TimeMark escriben el sello y deja el texto blanco en negro sobre fondo blanco.
  const DEFAULT_REGION = { x: 0.40, y: 0.70, w: 0.60, h: 0.30 };

  function binarizeStampRegion(img, opts = {}) {
    const region = opts.region || DEFAULT_REGION;
    const threshold = opts.threshold || 245;
    const W = img.width, H = img.height, src = img.data;
    const x0 = Math.floor(W * region.x), y0 = Math.floor(H * region.y);
    const cw = Math.min(W - x0, Math.floor(W * region.w)), ch = Math.min(H - y0, Math.floor(H * region.h));
    const out = new Uint8ClampedArray(cw * ch * 4);
    for (let y = 0; y < ch; y++) {
      let i = ((y0 + y) * W + x0) * 4;
      let o = y * cw * 4;
      for (let x = 0; x < cw; x++, i += 4, o += 4) {
        const mn = Math.min(src[i], src[i + 1], src[i + 2]);
        const v = mn > threshold ? 0 : 255;
        out[o] = out[o + 1] = out[o + 2] = v;
        out[o + 3] = 255;
      }
    }
    return { data: out, width: cw, height: ch };
  }

  // ==========================================
  // 3. INTERPRETACIÓN DEL TEXTO OCR
  // ==========================================
  const MONTHS = { ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12, dec: 12 };

  const DEPARTAMENTOS = ['Amazonas', 'Antioquia', 'Arauca', 'Atlántico', 'Bogotá D.C.', 'Bolívar', 'Boyacá', 'Caldas', 'Caquetá', 'Casanare', 'Cauca', 'Cesar', 'Chocó', 'Córdoba', 'Cundinamarca', 'Guainía', 'Guaviare', 'Huila', 'La Guajira', 'Magdalena', 'Meta', 'Nariño', 'Norte de Santander', 'Putumayo', 'Quindío', 'Risaralda', 'San Andrés y Providencia', 'Santander', 'Sucre', 'Tolima', 'Valle del Cauca', 'Vaupés', 'Vichada'];

  const pad = n => String(n).padStart(2, '0');

  function stripAccents(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }

  // Coincidencia difusa contra el catálogo de departamentos (corrige errores de OCR y tildes)
  function matchDepartamento(text) {
    const t = stripAccents(text).toLowerCase().replace(/[^a-z ]/g, '').trim();
    if (t.length < 4) return null;
    let best = null;
    for (const d of DEPARTAMENTOS) {
      const k = stripAccents(d).toLowerCase().replace(/[^a-z ]/g, '');
      const dist = levenshtein(t, k);
      const score = 1 - dist / Math.max(t.length, k.length);
      if (!best || score > best.score) best = { name: d, score };
    }
    return best && best.score >= 0.75 ? best : null;
  }

  function parseDate(text) {
    // a) "26 feb 2025 10:57:01 a.m."  (TimeMark / Timestamp Camera en español)
    let m = text.match(/(\d{1,2})\s*[-./ ]?\s*([a-zA-Z]{3,4})[a-zA-Z.]*\s*[-./ ]?\s*(\d{4})\s*(\d{1,2})\s*[:.]\s*(\d{2})(?:\s*[:.]\s*(\d{2}))?\s*([apAP])?\s*\.?\s*[mM]?/);
    if (m) {
      const mon = MONTHS[stripAccents(m[2]).toLowerCase().slice(0, 3)];
      if (mon) return buildDate(+m[3], mon, +m[1], +m[4], +m[5], m[6] ? +m[6] : 0, m[7]);
    }
    // b) "26/02/2025 10:57:01" o "2025-02-26 10:57"  (estampado propio de la app y formatos ISO)
    m = text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})[ T]*(\d{1,2})?:?(\d{2})?:?(\d{2})?\s*([apAP])?/);
    if (m) return buildDate(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), m[7]);
    m = text.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\s*(\d{1,2})?:?(\d{2})?:?(\d{2})?\s*([apAP])?/);
    if (m) return buildDate(+m[3], +m[2], +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0), m[7]);
    return null;
  }

  function buildDate(y, mo, d, h, mi, s, ampm) {
    if (ampm) {
      const p = ampm.toLowerCase();
      if (p === 'p' && h < 12) h += 12;
      if (p === 'a' && h === 12) h = 0;
    }
    if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
    return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(s)}`;
  }

  // Genera las lecturas posibles de una coordenada DMS escrita con errores de OCR.
  // Ej.: "7522 24.708" (el símbolo ° leído como 5) → 7°22'24.708"
  function dmsCandidates(chunk, maxDeg) {
    const groups = (chunk.match(/\d+(?:[.,]\d+)?/g) || []).map(g => g.replace(',', '.'));
    const out = [];
    const push = (d, m, s, score) => {
      d = +d; m = +m; s = +s;
      if (!(d <= maxDeg && m < 60 && s < 60)) return;
      out.push({ value: d + m / 60 + s / 3600, d, m, s, score });
    };
    if (groups.length >= 3) push(groups[0], groups[1], groups[2], 3);
    if (groups.length === 2 || groups.length >= 3) {
      // Dos grupos: [grados+°+minutos][segundos] o [grados][minutos+segundos]
      const [a, b] = groups.slice(-2);
      if (/^\d{3,5}$/.test(a)) {
        push(a.slice(0, -3), a.slice(-2), b, 2);      // grados, glifo leído como dígito, minutos
        push(a.slice(0, -2), a.slice(-2), b, 1);      // grados pegados a los minutos
      }
      const bi = b.split('.')[0];
      if (bi.length >= 3) {
        const dec = b.includes('.') ? '.' + b.split('.')[1] : '';
        push(a, bi.slice(0, 2), bi.slice(2) + dec, 2); // minutos pegados a los segundos
        push(a, bi.slice(0, 1), bi.slice(1) + dec, 1);
      }
    }
    if (groups.length === 1 && /^\d{6,}/.test(groups[0])) {
      const g = groups[0];
      push(g.slice(0, -6), g.slice(-5, -3), g.slice(-2), 0);
    }
    return out.sort((x, y) => y.score - x.score);
  }

  function pickCandidate(cands, hint) {
    if (!cands.length) return null;
    if (typeof hint === 'number') {
      return cands.slice().sort((a, b) => Math.abs(a.value - Math.abs(hint)) - Math.abs(b.value - Math.abs(hint)))[0];
    }
    return cands[0];
  }

  function parseCoordinates(text, hints = {}) {
    const flat = text.replace(/\n/g, ' ');
    // Latitud: el bloque numérico que termina en N o S
    const latM = flat.match(/([0-9][0-9°º'’"”.,:;*%°\s]{3,24}?)\s*[°º'’"”]?\s*([NS])\b/);
    let lonM = null;
    if (latM) {
      const rest = flat.slice(latM.index + latM[0].length);
      lonM = rest.match(/([0-9][0-9°º'’"”.,:;*%°\s/]{3,24}?)\s*[°º'’"”]?\s*([EWO])\b/);
    }
    if (!latM || !lonM) {
      // Coordenadas decimales "7.37353, -72.69036"
      const dm = flat.match(/(-?\d{1,2}\.\d{3,})\s*[,;]\s*(-?\d{1,3}\.\d{3,})/);
      if (dm) return { lat: +dm[1], lon: +dm[2], format: 'decimal', raw: dm[0] };
      return null;
    }
    const lc = pickCandidate(dmsCandidates(latM[1], 90), hints.lat);
    const oc = pickCandidate(dmsCandidates(lonM[1].replace(/^\D*[,/]/, ''), 180), hints.lon);
    if (!lc || !oc) return null;
    const lat = (latM[2] === 'S' ? -1 : 1) * lc.value;
    const lon = (lonM[2] === 'W' || lonM[2] === 'O' ? -1 : 1) * oc.value;
    const fmt = (c, h) => `${c.d}°${c.m}'${c.s}"${h}`;
    return { lat, lon, format: 'dms', raw: `${latM[0].trim()} ${lonM[0].trim()}`, text: `${fmt(lc, latM[2])} ${fmt(oc, lonM[2] === 'O' ? 'W' : lonM[2])}` };
  }

  // Líneas de lugar: después de las coordenadas, de arriba abajo: vía/dirección, municipio, departamento
  function parsePlace(text) {
    const raw = text.split('\n');
    const coordIdx = raw.findIndex(l => /\d+\D{1,3}\d+.*[NS]\b/.test(l));
    const candidates = raw.slice(coordIdx >= 0 ? coordIdx + 1 : 0)
      .filter(l => !parseDate(l) && (l.match(/\d/g) || []).length < 4)
      .map(l => l.replace(/([a-záéíóúñ])[lI|]([A-ZÁÉÍÓÚÑ])/g, '$1 $2').replace(/^[^A-Za-zÁÉÍÓÚÑáéíóúñ]+/, '').replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9 .,#-]+$/g, '').trim())
      .filter(l => (l.match(/[A-Za-zÁÉÍÓÚÑáéíóúñ]/g) || []).length >= 4);
    if (!candidates.length) return null;
    const place = { via: null, municipio: null, departamento: null, departamentoScore: 0 };
    const last = candidates[candidates.length - 1];
    const dep = matchDepartamento(last);
    let rest = candidates;
    if (dep) { place.departamento = dep.name; place.departamentoScore = dep.score; rest = candidates.slice(0, -1); }
    if (rest.length) place.municipio = rest[rest.length - 1];
    if (rest.length > 1) place.via = rest.slice(0, -1).join(' · ');
    return place;
  }

  function parseStampText(text, hints = {}) {
    text = String(text || '');
    const date = parseDate(text);
    const coords = parseCoordinates(text, hints);
    const place = parsePlace(text);
    const fields = (date ? 1 : 0) + (coords ? 1 : 0) + (place && (place.municipio || place.departamento) ? 1 : 0);
    return { date, coords, place, fields, complete: !!(date && coords) };
  }

  // ==========================================
  // 4. FUSIÓN EXIF + OCR
  // ==========================================
  function distanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000, toR = Math.PI / 180;
    const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // ocrConf: confianza media del OCR (0-100). Devuelve campos con fuente y confianza 0..1
  function fuseMetadata(exif, ocr, ocrConf = 70) {
    const oc = Math.max(0.3, Math.min(0.9, ocrConf / 100));
    const meta = {
      capturedAt: null, lat: null, lon: null, coordsText: null,
      via: null, municipio: null, departamento: null,
      altitude: exif && exif.altitude != null ? exif.altitude : null,
      camera: exif && (exif.make || exif.model) ? [exif.make, exif.model].filter(Boolean).join(' ') : null,
      sources: {}, confidence: {}, checks: {}
    };

    // Fecha
    const ed = exif && exif.dateTimeOriginal, od = ocr && ocr.date;
    if (ed && od) {
      const diff = Math.abs(new Date(ed) - new Date(od)) / 1000;
      meta.checks.dateDiffSeconds = diff;
      meta.capturedAt = ed;
      meta.sources.date = diff <= 120 ? 'exif+ocr' : 'exif';
      meta.confidence.date = diff <= 120 ? 0.99 : 0.75;
    } else if (ed) { meta.capturedAt = ed; meta.sources.date = 'exif'; meta.confidence.date = 0.85; }
    else if (od) { meta.capturedAt = od; meta.sources.date = 'ocr'; meta.confidence.date = oc; }

    // Coordenadas
    const eg = exif && exif.lat != null ? exif : null, og = ocr && ocr.coords;
    if (eg && og) {
      const d = distanceMeters(eg.lat, eg.lon, og.lat, og.lon);
      meta.checks.gpsDiffMeters = Math.round(d * 10) / 10;
      meta.lat = eg.lat; meta.lon = eg.lon;
      meta.sources.gps = d <= 30 ? 'exif+ocr' : 'exif';
      meta.confidence.gps = d <= 30 ? 0.99 : 0.75;
    } else if (eg) { meta.lat = eg.lat; meta.lon = eg.lon; meta.sources.gps = 'exif'; meta.confidence.gps = 0.85; }
    else if (og) { meta.lat = og.lat; meta.lon = og.lon; meta.sources.gps = 'ocr'; meta.confidence.gps = oc; }
    if (og && og.text) meta.coordsText = og.text;

    // Lugar (solo lo trae el sello)
    const pl = ocr && ocr.place;
    if (pl) {
      meta.via = pl.via; meta.municipio = pl.municipio; meta.departamento = pl.departamento;
      if (pl.municipio || pl.departamento) {
        meta.sources.place = 'ocr';
        meta.confidence.place = pl.departamento ? Math.min(0.95, 0.5 * oc + 0.5 * pl.departamentoScore) : oc * 0.8;
      }
    }
    const confs = Object.values(meta.confidence);
    meta.confidence.overall = confs.length ? Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 100) / 100 : 0;
    return meta;
  }

  // ==========================================
  // 5. PIE DE FOTO AUTOMÁTICO
  // ==========================================
  function formatDateEs(iso) {
    if (!iso) return '';
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return iso;
    return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
  }

  function buildCaption(meta) {
    if (!meta) return '';
    const parts = [];
    if (meta.capturedAt) parts.push(formatDateEs(meta.capturedAt));
    const place = [meta.via, meta.municipio, meta.departamento].filter(Boolean).join(', ');
    if (place) parts.push(place);
    if (meta.lat != null && meta.lon != null) parts.push(`${meta.lat.toFixed(5)}, ${meta.lon.toFixed(5)}`);
    return parts.join(' · ');
  }

  return {
    parseExif, binarizeStampRegion, parseStampText, parseDate, parseCoordinates, parsePlace,
    dmsCandidates, fuseMetadata, buildCaption, formatDateEs, distanceMeters, matchDepartamento,
    DEPARTAMENTOS, DEFAULT_REGION
  };
});
