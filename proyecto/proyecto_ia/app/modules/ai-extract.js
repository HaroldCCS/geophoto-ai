/**
 * GeoPhoto AI - Extracción automática de metadatos de las fotos (IA en el dispositivo)
 *
 * Flujo por foto:
 *   1. EXIF del JPEG original (fecha de captura, GPS, cámara).
 *   2. OCR del sello visible (Tesseract.js, modelo LSTM local, sin internet):
 *      recorte de la zona del sello → binarización → reconocimiento. Si el texto no trae
 *      fecha y coordenadas, se reintenta con umbrales más bajos.
 *   3. Interpretación del texto y fusión con el EXIF, con confianza por campo.
 *   4. Se guardan en photo.meta y se llenan automáticamente la descripción y las
 *      coordenadas que van al informe (solo si el usuario no las escribió a mano).
 */
(function () {
  const MC = window.MetadataCore;
  const THRESHOLDS = [245, 230, 200];
  const LIB = new URL('lib/tesseract/', document.baseURI).href;

  let workerPromise = null;
  let queue = [];
  let running = false;
  let totalInBatch = 0;
  let doneInBatch = 0;

  function getWorker() {
    if (!workerPromise) {
      if (!window.Tesseract) return Promise.reject(new Error('Tesseract.js no está cargado'));
      workerPromise = Tesseract.createWorker('eng', 1, {
        workerPath: LIB + 'worker.min.js',
        corePath: LIB + 'core',
        langPath: LIB + 'lang',
        gzip: true,
        cacheMethod: 'refresh',
        workerBlobURL: false
      }).catch(err => { workerPromise = null; throw err; });
    }
    return workerPromise;
  }

  function dataUrlToArrayBuffer(url) {
    const bytes = dataUrlToUint8Array(url);
    return bytes ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : null;
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo leer la imagen'));
      img.src = url;
    });
  }

  // Obtiene los píxeles de la zona del sello (sin aplicar los ajustes de la mesa)
  function stampPixels(img) {
    const R = MC.DEFAULT_REGION;
    const W = img.naturalWidth, H = img.naturalHeight;
    const sx = Math.floor(W * R.x), sy = Math.floor(H * R.y);
    const sw = W - sx, sh = H - sy;
    const c = document.createElement('canvas');
    c.width = sw; c.height = sh;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    return { data: ctx.getImageData(0, 0, sw, sh).data, width: sw, height: sh };
  }

  function toCanvas(bin) {
    const c = document.createElement('canvas');
    c.width = bin.width; c.height = bin.height;
    c.getContext('2d').putImageData(new ImageData(bin.data, bin.width, bin.height), 0, 0);
    return c;
  }

  async function extract(photo) {
    const t0 = performance.now();
    const exif = photo.url && photo.url.startsWith('data:image/jpeg') ? MC.parseExif(dataUrlToArrayBuffer(photo.url)) : null;
    const hints = exif ? { lat: exif.lat, lon: exif.lon } : {};

    let best = null;
    try {
      const worker = await getWorker();
      const img = await loadImage(photo.url);
      const pixels = stampPixels(img);
      const full = { x: 0, y: 0, w: 1, h: 1 }; // el recorte ya se hizo en stampPixels
      for (const threshold of THRESHOLDS) {
        const bin = MC.binarizeStampRegion(pixels, { region: full, threshold });
        const { data } = await worker.recognize(toCanvas(bin));
        const parsed = MC.parseStampText(data.text, hints);
        if (!best || parsed.fields > best.parsed.fields || (parsed.fields === best.parsed.fields && data.confidence > best.conf)) {
          best = { parsed, text: data.text, conf: data.confidence, threshold };
        }
        if (parsed.complete) break;
      }
    } catch (err) {
      console.warn('[IA] OCR no disponible, se usa solo EXIF:', err);
    }

    const meta = MC.fuseMetadata(exif, best ? best.parsed : null, best ? best.conf : 0);
    meta.ocrText = best ? best.text.trim() : '';
    meta.ocrConfidence = best ? Math.round(best.conf) : null;
    meta.ocrThreshold = best ? best.threshold : null;
    meta.exif = exif;
    meta.processingMs = Math.round(performance.now() - t0);
    meta.extractedAt = new Date().toISOString();
    meta.engine = 'tesseract.js-5/eng-lstm + exif';
    return meta;
  }

  // Vuelca los metadatos a los campos que usa el informe, sin pisar lo escrito por el usuario
  function applyMetaToPhoto(photo, meta) {
    photo.meta = meta;
    const place = [meta.via, meta.municipio, meta.departamento].filter(Boolean).join(', ');
    if (!photo.note || photo.noteAuto) {
      photo.note = place || photo.note || '';
      photo.noteAuto = true;
    }
    if (!photo.coords || photo.coordsAuto) {
      if (meta.lat != null) {
        photo.coords = meta.coordsText || `${meta.lat.toFixed(6)}, ${meta.lon.toFixed(6)}`;
        photo.coordsAuto = true;
      }
    }
    if (meta.lat != null) { photo.lat = meta.lat; photo.lon = meta.lon; }
    if (meta.capturedAt) photo.capturedAt = meta.capturedAt;
    if (meta.municipio) photo.municipality = meta.municipio;
    if (meta.departamento) photo.department = meta.departamento;
  }

  function setProgress() {
    const bar = document.getElementById('ai-extract-status');
    if (!bar) return;
    if (!running) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    bar.querySelector('[data-text]').textContent = `IA leyendo fotos… ${doneInBatch}/${totalInBatch}`;
    bar.querySelector('[data-bar]').style.width = `${totalInBatch ? (doneInBatch / totalInBatch) * 100 : 0}%`;
  }

  async function runQueue() {
    if (running) return;
    running = true;
    setProgress();
    while (queue.length) {
      const id = queue.shift();
      const photo = state.photos.find(p => p.id === id);
      if (photo && photo.url) {
        try {
          applyMetaToPhoto(photo, await extract(photo));
        } catch (e) {
          console.warn('[IA] Error extrayendo metadatos:', e);
          photo.meta = { error: String(e.message || e), extractedAt: new Date().toISOString() };
        }
        scheduleOfflineSave();
        if (state.activeView === 'view-canvas') updateCanvasGrid();
      }
      doneInBatch++;
      setProgress();
    }
    running = false;
    setProgress();
    const n = doneInBatch;
    totalInBatch = 0; doneInBatch = 0;
    if (typeof updateDirectDownloadView === 'function') updateDirectDownloadView();
    document.dispatchEvent(new CustomEvent('geophoto:metadata-updated'));
    showToast(`IA: metadatos extraídos de ${n} foto${n === 1 ? '' : 's'}`, 'ph-sparkle text-violet-300');
  }

  function enqueue(photos, force = false) {
    const ids = photos.filter(p => p && (force || !p.meta || p.meta.error)).map(p => p.id).filter(id => !queue.includes(id));
    if (!ids.length) return 0;
    queue.push(...ids);
    totalInBatch += ids.length;
    runQueue();
    return ids.length;
  }

  function extractAllPending() {
    const n = enqueue(state.photos);
    if (!n) showToast('Todas las fotos ya tienen metadatos extraídos', 'ph-sparkle text-violet-300');
  }

  // ==========================================
  // PANEL DE METADATOS POR FOTO (editable)
  // ==========================================
  const pct = v => (v == null ? '—' : `${Math.round(v * 100)}%`);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SOURCE_LABEL = { 'exif+ocr': 'EXIF + sello (verificado)', exif: 'EXIF', ocr: 'Sello (OCR)' };

  function injectPanel() {
    if (document.getElementById('meta-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'meta-modal';
    modal.className = 'hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-2';
    modal.innerHTML = `
      <div class="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md max-h-[92vh] flex flex-col shadow-2xl" onclick="event.stopPropagation()">
        <div class="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <h3 class="text-sm font-bold text-white flex items-center gap-2"><i class="ph-bold ph-sparkle text-violet-300"></i> Datos extraídos por IA <span id="meta-photo-title" class="text-slate-400 font-mono text-xs"></span></h3>
          <button type="button" data-close class="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center" aria-label="Cerrar"><i class="ph-bold ph-x"></i></button>
        </div>
        <div id="meta-body" class="overflow-y-auto p-4 space-y-3 text-xs"></div>
        <div class="grid grid-cols-2 gap-2 p-3 border-t border-slate-800">
          <button type="button" id="meta-rerun" class="py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold flex items-center justify-center gap-1"><i class="ph-bold ph-arrows-clockwise"></i> Volver a leer</button>
          <button type="button" id="meta-save" class="py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold">Guardar</button>
        </div>
      </div>`;
    document.getElementById('app-container').appendChild(modal);
    modal.addEventListener('click', closePanel);
    modal.querySelector('[data-close]').addEventListener('click', closePanel);
    document.getElementById('meta-save').addEventListener('click', savePanel);
    document.getElementById('meta-rerun').addEventListener('click', async () => {
      const photo = state.photos.find(p => p.id === modal.dataset.photoId);
      if (!photo) return;
      document.getElementById('meta-body').innerHTML = '<p class="text-slate-400 py-6 text-center"><i class="ph-bold ph-spinner animate-spin"></i> Leyendo la foto…</p>';
      applyMetaToPhoto(photo, await extract(photo));
      scheduleOfflineSave();
      updateCanvasGrid();
      renderPanel(photo);
    });
  }

  function renderPanel(photo) {
    const m = photo.meta || {};
    document.getElementById('meta-photo-title').textContent = photo.title || '';
    const row = (label, value, src, conf) => `
      <div class="flex items-start justify-between gap-2 py-1.5 border-b border-slate-800/80">
        <span class="text-slate-400 shrink-0">${label}</span>
        <span class="text-right"><span class="text-slate-100">${value || '—'}</span>
          ${src ? `<br><span class="text-[10px] ${src === 'exif+ocr' ? 'text-emerald-400' : 'text-slate-500'}">${SOURCE_LABEL[src] || src} · confianza ${pct(conf)}</span>` : ''}</span>
      </div>`;
    const checks = [];
    if (m.checks && m.checks.gpsDiffMeters != null) checks.push(`GPS del sello vs EXIF: ${m.checks.gpsDiffMeters} m`);
    if (m.checks && m.checks.dateDiffSeconds != null) checks.push(`Hora del sello vs EXIF: ${Math.round(m.checks.dateDiffSeconds)} s`);
    document.getElementById('meta-body').innerHTML = !photo.meta ? '<p class="text-slate-400 py-6 text-center">Aún no se han extraído datos de esta foto.</p>' : `
      ${m.error ? `<p class="text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-2">${esc(m.error)}</p>` : ''}
      <div>
        ${row('Fecha de captura', m.capturedAt ? esc(MC.formatDateEs(m.capturedAt)) : '', m.sources && m.sources.date, m.confidence && m.confidence.date)}
        ${row('Coordenadas', m.lat != null ? `${m.lat.toFixed(6)}, ${m.lon.toFixed(6)}${m.coordsText ? `<br><span class="font-mono text-[10px] text-slate-400">${esc(m.coordsText)}</span>` : ''}` : '', m.sources && m.sources.gps, m.confidence && m.confidence.gps)}
        ${row('Lugar', esc([m.via, m.municipio, m.departamento].filter(Boolean).join(', ')), m.sources && m.sources.place, m.confidence && m.confidence.place)}
        ${row('Cámara', esc(m.camera || ''), null, null)}
        ${row('Confianza global', pct(m.confidence && m.confidence.overall), null, null)}
      </div>
      ${checks.length ? `<p class="text-[11px] text-emerald-300/90">${checks.map(esc).join(' · ')}</p>` : ''}
      <label class="block space-y-1"><span class="text-slate-400">Descripción para el informe</span>
        <textarea id="meta-note" rows="2" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white">${esc(photo.note || '')}</textarea></label>
      <label class="block space-y-1"><span class="text-slate-400">Coordenadas para el informe</span>
        <input id="meta-coords" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white font-mono" value="${esc(photo.coords || '')}"></label>
      <details class="bg-slate-950/60 border border-slate-800 rounded-lg p-2">
        <summary class="cursor-pointer text-slate-400">Texto leído por OCR (confianza ${m.ocrConfidence != null ? m.ocrConfidence + '%' : '—'}, ${m.processingMs || '—'} ms)</summary>
        <pre class="whitespace-pre-wrap font-mono text-[10px] text-slate-300 mt-2">${esc(m.ocrText || '(sin texto)')}</pre>
      </details>`;
  }

  function openPanel(index) {
    injectPanel();
    const photo = state.photos[index];
    if (!photo) return;
    const modal = document.getElementById('meta-modal');
    modal.dataset.photoId = photo.id;
    renderPanel(photo);
    modal.classList.remove('hidden');
    if (!photo.meta) enqueue([photo]);
  }

  function savePanel() {
    const modal = document.getElementById('meta-modal');
    const photo = state.photos.find(p => p.id === modal.dataset.photoId);
    if (photo) {
      const note = document.getElementById('meta-note');
      const coords = document.getElementById('meta-coords');
      if (note && note.value !== photo.note) { photo.note = note.value.trim(); photo.noteAuto = false; }
      if (coords && coords.value !== photo.coords) { photo.coords = coords.value.trim(); photo.coordsAuto = false; }
      scheduleOfflineSave();
      updateCanvasGrid();
      showToast('Datos de la foto guardados', 'ph-check-circle text-emerald-400');
    }
    closePanel();
  }

  function closePanel() {
    const m = document.getElementById('meta-modal');
    if (m) m.classList.add('hidden');
  }

  // Chips compactos para la tarjeta de la mesa
  function cardChips(photo) {
    const m = photo.meta;
    if (!m) return queue.includes(photo.id) ? '<span class="text-[9px] text-violet-300"><i class="ph-bold ph-spinner animate-spin"></i> IA…</span>' : '';
    if (m.error) return '<span class="text-[9px] text-red-300">IA: error</span>';
    const verified = m.sources && (m.sources.gps === 'exif+ocr' || m.sources.date === 'exif+ocr');
    const bits = [];
    if (m.capturedAt) bits.push(MC.formatDateEs(m.capturedAt).split(' ')[0]);
    if (m.municipio) bits.push(m.municipio);
    return `<span class="text-[9px] ${verified ? 'text-emerald-300' : 'text-violet-300'} truncate" title="Datos extraídos por IA${verified ? ' (verificados contra EXIF)' : ''}"><i class="ph-bold ph-sparkle"></i> ${esc(bits.join(' · ') || 'Sin datos')}</span>`;
  }

  window.AIExtract = { extract, enqueue, extractAllPending, openPanel, cardChips, applyMetaToPhoto, isBusy: () => running };
})();
