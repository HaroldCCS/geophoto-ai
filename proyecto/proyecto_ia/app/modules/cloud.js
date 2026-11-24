/**
 * GeoPhoto AI - Google Drive + Google Sheets con sincronización diferida (RQ-01 a RQ-07)
 *
 * - Inicio de sesión con Google Identity Services (token OAuth en el navegador, sin backend).
 * - Por proyecto: carpeta "GeoPhoto AI/<ID> - <Nombre>/" con subcarpetas Fotos/ e Informes/,
 *   o una carpeta existente elegida por el usuario.
 * - Hoja de cálculo "GeoPhoto AI - Registro" con pestañas Proyectos, Versiones y Fotos.
 * - Cola persistente en IndexedDB (sync_queue): lo generado sin internet se sube al reconectar.
 *
 * Todas las llamadas HTTP pasan por Cloud._http, que las pruebas reemplazan por un Google simulado.
 */
(function () {
  const SCOPES = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets';
  const DRIVE = 'https://www.googleapis.com/drive/v3';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
  const FOLDER_MIME = 'application/vnd.google-apps.folder';
  const LS = 'geophoto_cloud_settings';

  const SHEET_HEADERS = {
    Proyectos: ['ID proyecto', 'Nombre', 'Código', 'Cliente', 'Usuario creador', 'Estado', 'Fecha de creación', 'Última modificación', 'Fecha último informe', 'Última versión', 'Carpeta de fotos (ruta)', 'Carpeta de fotos (enlace)', 'Informe generado (ruta)', 'Informe generado (enlace)', 'Total fotos'],
    Versiones: ['ID proyecto', 'Proyecto', 'Versión', 'Fecha de generación', 'Usuario', 'Archivo', 'Ruta en Drive', 'Enlace', 'Fotos', 'Motivo', 'Plantilla'],
    Fotos: ['ID proyecto', 'ID foto', 'N.º en informe', 'Archivo original', 'Fecha de captura', 'Latitud', 'Longitud', 'Vía / dirección', 'Municipio', 'Departamento', 'Descripción', 'Fuente fecha', 'Fuente GPS', 'Confianza IA', 'Ruta en Drive', 'Enlace', 'Actualizado']
  };

  const settings = Object.assign({
    clientId: '',
    saveReports: true,     // RQ-04: guardar el informe también en Drive (opcional)
    uploadPhotos: true,    // RQ-03: subir el registro fotográfico
    rootFolderId: null,
    spreadsheetId: null,
    spreadsheetUrl: null
  }, JSON.parse(localStorage.getItem(LS) || '{}'));

  let token = null;          // { access_token, expiresAt }
  let tokenClient = null;
  let processing = false;
  let lastError = null;

  function persist() { localStorage.setItem(LS, JSON.stringify(settings)); }
  const isConfigured = () => !!settings.clientId;
  const isConnected = () => !!(token && token.expiresAt > Date.now() + 30000);
  const online = () => navigator.onLine !== false && state.isOnline !== false;

  // ==========================================
  // AUTENTICACIÓN
  // ==========================================
  function loadGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('No se pudo cargar el inicio de sesión de Google (¿sin internet?)'));
      document.head.appendChild(s);
    });
  }

  async function connect() {
    if (!isConfigured()) throw new Error('Falta el Client ID de Google');
    await loadGis();
    return new Promise((resolve, reject) => {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: settings.clientId,
        scope: SCOPES,
        callback: (resp) => {
          if (resp.error) { reject(new Error(resp.error_description || resp.error)); return; }
          token = { access_token: resp.access_token, expiresAt: Date.now() + (Number(resp.expires_in) || 3600) * 1000 };
          sessionStorage.setItem('geophoto_cloud_token', JSON.stringify(token));
          resolve();
        },
        error_callback: (err) => reject(new Error(err && err.message ? err.message : 'Inicio de sesión cancelado'))
      });
      tokenClient.requestAccessToken({ prompt: token ? '' : 'consent' });
    });
  }

  function disconnect() {
    if (token && window.google && google.accounts && google.accounts.oauth2) google.accounts.oauth2.revoke(token.access_token, () => {});
    token = null;
    sessionStorage.removeItem('geophoto_cloud_token');
    renderPanel();
  }

  try { const t = JSON.parse(sessionStorage.getItem('geophoto_cloud_token') || 'null'); if (t && t.expiresAt > Date.now()) token = t; } catch (e) { /* sin token */ }

  // ==========================================
  // HTTP
  // ==========================================
  async function http(method, url, { json, body, headers = {}, raw = false } = {}) {
    if (!isConnected()) throw Object.assign(new Error('Sesión de Google vencida: vuelve a conectar'), { code: 'AUTH' });
    const h = { Authorization: `Bearer ${token.access_token}`, ...headers };
    if (json !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    const res = await fetch(url, { method, headers: h, body });
    if (res.status === 401) { token = null; throw Object.assign(new Error('Sesión de Google vencida: vuelve a conectar'), { code: 'AUTH' }); }
    if (!res.ok) {
      let msg = `${res.status}`;
      try { const j = await res.json(); msg = (j.error && (j.error.message || j.error)) || msg; } catch (e) { /* sin cuerpo */ }
      throw new Error(`Google respondió: ${msg}`);
    }
    if (raw) return res;
    return res.status === 204 ? null : res.json();
  }

  const api = { http: (...a) => Cloud._http(...a) };

  // ==========================================
  // DRIVE
  // ==========================================
  const q = s => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  async function findFolder(name, parentId) {
    const query = `mimeType='${FOLDER_MIME}' and name='${q(name)}' and trashed=false` + (parentId ? ` and '${parentId}' in parents` : " and 'root' in parents");
    const r = await api.http('GET', `${DRIVE}/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink)&pageSize=1`);
    return r.files && r.files[0] ? r.files[0] : null;
  }

  async function ensureFolder(name, parentId) {
    const found = await findFolder(name, parentId);
    if (found) return found;
    return api.http('POST', `${DRIVE}/files?fields=id,name,webViewLink`, { json: { name, mimeType: FOLDER_MIME, parents: parentId ? [parentId] : undefined } });
  }

  async function getFile(id) {
    return api.http('GET', `${DRIVE}/files/${encodeURIComponent(id)}?fields=id,name,webViewLink,mimeType,trashed`);
  }

  function multipartBody(metadata, blob) {
    const boundary = 'geophoto' + Math.random().toString(36).slice(2);
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: ${metadata.mimeType || 'application/octet-stream'}\r\n\r\n`,
      blob,
      `\r\n--${boundary}--`
    ]);
    return { body, contentType: `multipart/related; boundary=${boundary}` };
  }

  async function uploadFile(blob, name, parentId, mimeType, existingId) {
    const metadata = { name, mimeType: mimeType || blob.type || 'application/octet-stream' };
    if (!existingId) metadata.parents = [parentId];
    const { body, contentType } = multipartBody(metadata, blob);
    const url = existingId
      ? `${UPLOAD}/files/${existingId}?uploadType=multipart&fields=id,name,webViewLink`
      : `${UPLOAD}/files?uploadType=multipart&fields=id,name,webViewLink`;
    return api.http(existingId ? 'PATCH' : 'POST', url, { body, headers: { 'Content-Type': contentType } });
  }

  function folderIdFromInput(input) {
    if (!input) return null;
    const m = String(input).match(/folders\/([A-Za-z0-9_-]{10,})/) || String(input).match(/[?&]id=([A-Za-z0-9_-]{10,})/);
    if (m) return m[1];
    return /^[A-Za-z0-9_-]{10,}$/.test(input.trim()) ? input.trim() : null;
  }

  // Carpetas del proyecto (RQ-03): nueva bajo "GeoPhoto AI" o una existente elegida por el usuario
  async function ensureProjectFolders(meta) {
    if (!settings.rootFolderId) {
      const root = await ensureFolder('GeoPhoto AI', null);
      settings.rootFolderId = root.id; persist();
    }
    let projectFolder = null;
    if (meta.driveFolderId) {
      try { projectFolder = await getFile(meta.driveFolderId); if (projectFolder.trashed) projectFolder = null; } catch (e) { projectFolder = null; }
    }
    if (!projectFolder && meta.driveFolderMode === 'existing' && meta.driveExistingFolder) {
      const id = folderIdFromInput(meta.driveExistingFolder);
      if (!id) throw new Error('El enlace de la carpeta existente de Drive no es válido');
      projectFolder = await getFile(id);
    }
    if (!projectFolder) projectFolder = await ensureFolder(`${meta.id} - ${meta.name}`.slice(0, 120), settings.rootFolderId);
    const photos = await ensureFolder('Fotos', projectFolder.id);
    const reports = await ensureFolder('Informes', projectFolder.id);
    const base = meta.driveFolderMode === 'existing' ? projectFolder.name : `GeoPhoto AI/${projectFolder.name}`;
    return {
      driveFolderId: projectFolder.id,
      driveFolderUrl: projectFolder.webViewLink || `https://drive.google.com/drive/folders/${projectFolder.id}`,
      drivePhotosFolderId: photos.id,
      drivePhotosFolderUrl: photos.webViewLink || `https://drive.google.com/drive/folders/${photos.id}`,
      drivePhotosPath: `${base}/Fotos`,
      driveReportsFolderId: reports.id,
      driveReportsPath: `${base}/Informes`
    };
  }

  // ==========================================
  // SHEETS
  // ==========================================
  async function ensureSpreadsheet() {
    if (settings.spreadsheetId) {
      try {
        const f = await getFile(settings.spreadsheetId);
        if (!f.trashed) return settings.spreadsheetId;
      } catch (e) { /* se vuelve a crear */ }
    }
    const created = await api.http('POST', SHEETS, {
      json: {
        properties: { title: 'GeoPhoto AI - Registro', locale: 'es_CO' },
        sheets: Object.keys(SHEET_HEADERS).map((title, i) => ({ properties: { sheetId: i + 1, title, gridProperties: { frozenRowCount: 1 } } }))
      }
    });
    settings.spreadsheetId = created.spreadsheetId;
    settings.spreadsheetUrl = created.spreadsheetUrl;
    persist();
    await api.http('POST', `${SHEETS}/${created.spreadsheetId}/values:batchUpdate`, {
      json: { valueInputOption: 'RAW', data: Object.entries(SHEET_HEADERS).map(([t, h]) => ({ range: `${t}!A1`, values: [h] })) }
    });
    // Dejar la hoja dentro de la carpeta raíz "GeoPhoto AI"
    if (settings.rootFolderId) {
      try { await api.http('PATCH', `${DRIVE}/files/${created.spreadsheetId}?addParents=${settings.rootFolderId}&removeParents=root&fields=id`, { json: {} }); } catch (e) { /* no crítico */ }
    }
    return created.spreadsheetId;
  }

  async function readKeys(sheetId, sheet, cols) {
    const r = await api.http('GET', `${SHEETS}/${sheetId}/values/${encodeURIComponent(`${sheet}!${cols}`)}`);
    return r.values || [];
  }

  // Inserta o actualiza filas según una clave (columnas iniciales)
  async function upsertRows(sheetId, sheet, rows, keyCols) {
    if (!rows.length) return;
    const lastCol = String.fromCharCode(64 + keyCols);
    const existing = await readKeys(sheetId, sheet, `A:${lastCol}`);
    const index = new Map(existing.map((r, i) => [r.slice(0, keyCols).join('|'), i + 1]));
    const updates = [], appends = [];
    rows.forEach(row => {
      const key = row.slice(0, keyCols).map(String).join('|');
      const rowNum = index.get(key);
      if (rowNum && rowNum > 1) updates.push({ range: `${sheet}!A${rowNum}`, values: [row] });
      else appends.push(row);
    });
    if (updates.length) await api.http('POST', `${SHEETS}/${sheetId}/values:batchUpdate`, { json: { valueInputOption: 'USER_ENTERED', data: updates } });
    if (appends.length) await api.http('POST', `${SHEETS}/${sheetId}/values/${encodeURIComponent(`${sheet}!A1`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, { json: { values: appends } });
  }

  const fmt = iso => (iso ? new Date(iso).toLocaleString('es-CO') : '');

  function projectRow(m, photoCount) {
    return [m.id, m.name, m.code || '', m.client || '', m.createdBy || '', m.status || '', fmt(m.createdAt), fmt(m.updatedAt),
      fmt(m.lastReportAt), m.lastReportVersion || '', m.drivePhotosPath || '', m.drivePhotosFolderUrl || '',
      m.lastReportPath || '', m.lastReportUrl || '', photoCount];
  }

  function photoRow(m, p, i) {
    const x = p.meta || {};
    return [m.id, p.id, i + 1, p.fileName || '', x.capturedAt ? (window.MetadataCore ? MetadataCore.formatDateEs(x.capturedAt) : x.capturedAt) : '',
      x.lat != null ? x.lat : '', x.lon != null ? x.lon : '', x.via || '', x.municipio || p.municipality || '', x.departamento || p.department || '',
      p.note || '', (x.sources && x.sources.date) || '', (x.sources && x.sources.gps) || '',
      x.confidence && x.confidence.overall != null ? x.confidence.overall : '',
      p.driveFileId ? `${m.drivePhotosPath}/${p.driveName || ''}` : '', p.driveUrl || '', fmt(new Date().toISOString())];
  }

  // ==========================================
  // COLA DE SINCRONIZACIÓN
  // ==========================================
  async function enqueue(job) {
    await OfflineStore.enqueueSync(job);
    renderPanel();
    processQueue();
  }

  function photoBlob(p) {
    const bytes = dataUrlToUint8Array(p.url);
    const mime = (p.url.match(/^data:([^;,]+)/) || [])[1] || 'image/jpeg';
    return { blob: new Blob([bytes], { type: mime }), ext: mime.includes('png') ? 'png' : 'jpg', mime };
  }

  async function syncProject(projectId, reportId) {
    const isCurrent = state.currentProject && state.currentProject.id === projectId;
    if (isCurrent) await OfflineStore.saveState(state);
    const rec = await OfflineStore.getProject(projectId);
    if (!rec) return;
    const meta = rec.meta;
    Object.assign(meta, await ensureProjectFolders(meta));

    // 1. Fotos (cada una se sube una sola vez; se reutiliza su ID de Drive)
    if (settings.uploadPhotos) {
      for (let i = 0; i < rec.photos.length; i++) {
        const p = rec.photos[i];
        if (p.driveFileId || !p.url || !p.url.startsWith('data:')) continue;
        const { blob, ext, mime } = photoBlob(p);
        const name = `${String(i + 1).padStart(3, '0')}_${(p.fileName || p.id).replace(/\.[^.]+$/, '')}.${ext}`;
        const up = await uploadFile(blob, name, meta.drivePhotosFolderId, mime);
        p.driveFileId = up.id; p.driveUrl = up.webViewLink; p.driveName = name;
      }
    }

    // 2. Informe (versión)
    let report = null;
    if (reportId) {
      report = await OfflineStore.getReport(reportId);
      if (report && report.blob && !report.driveFileId) {
        const up = await uploadFile(report.blob, report.fileName, meta.driveReportsFolderId, report.blob.type);
        report.driveFileId = up.id;
        report.driveUrl = up.webViewLink;
        report.drivePath = `${meta.driveReportsPath}/${report.fileName}`;
      }
      if (report && report.driveFileId) {
        meta.lastReportUrl = report.driveUrl;
        meta.lastReportPath = report.drivePath;
      }
    }

    // 3. Hoja de cálculo
    const sheetId = await ensureSpreadsheet();
    await upsertRows(sheetId, 'Proyectos', [projectRow(meta, rec.photos.length)], 1);
    if (report) {
      await upsertRows(sheetId, 'Versiones', [[meta.id, meta.name, `v${report.version}`, fmt(report.createdAt), report.createdBy || '', report.fileName,
        report.drivePath || '', report.driveUrl || '', report.photoCount, report.reason, report.templateName || '']], 3);
    }
    await upsertRows(sheetId, 'Fotos', rec.photos.map((p, i) => photoRow(meta, p, i)), 2);

    // 4. Guardar IDs/rutas de Drive en el proyecto (y en memoria si es el activo)
    rec.meta = meta;
    if (isCurrent) {
      const driveFields = Object.keys(meta).filter(k => k.startsWith('drive') || k.startsWith('lastReport'));
      driveFields.forEach(k => { state.currentProject[k] = meta[k]; });
      const byId = new Map(rec.photos.map(p => [p.id, p]));
      state.photos.forEach(p => { const s = byId.get(p.id); if (s && s.driveFileId) { p.driveFileId = s.driveFileId; p.driveUrl = s.driveUrl; p.driveName = s.driveName; } });
      await OfflineStore.saveState(state);
    } else {
      await OfflineStore.putProject(rec);
    }
    if (report) { report.syncStatus = 'synced'; await OfflineStore.putReport(report); }
  }

  async function processQueue() {
    if (processing) return;
    if (!isConfigured() || !online() || !isConnected()) { renderPanel(); return; }
    processing = true;
    lastError = null;
    renderPanel();
    try {
      const jobs = (await OfflineStore.listSyncJobs()).sort((a, b) => a.id - b.id);
      for (const job of jobs) {
        try {
          await syncProject(job.projectId, job.reportId || null);
          await OfflineStore.removeSyncJob(job.id);
          document.dispatchEvent(new CustomEvent('geophoto:report-synced', { detail: job }));
        } catch (err) {
          job.attempts = (job.attempts || 0) + 1;
          job.lastError = String(err.message || err);
          await OfflineStore.updateSyncJob(job);
          if (job.reportId) {
            const r = await OfflineStore.getReport(job.reportId);
            if (r) { r.syncStatus = 'error'; await OfflineStore.putReport(r); }
          }
          lastError = job.lastError;
          if (err.code === 'AUTH') break;
        }
      }
      if (!lastError && jobs.length) showToast(`Google Drive actualizado (${jobs.length} pendiente${jobs.length === 1 ? '' : 's'} sincronizado${jobs.length === 1 ? '' : 's'})`, 'ph-cloud-check text-emerald-400');
      if (lastError) showToast(`Drive: ${lastError}`, 'ph-cloud-warning text-amber-400');
    } finally {
      processing = false;
      renderPanel();
      document.dispatchEvent(new CustomEvent('geophoto:report-synced'));
    }
  }

  // Nueva versión de informe → a la cola de Drive (si el usuario lo tiene activado)
  document.addEventListener('geophoto:report-saved', async (e) => {
    if (!isConfigured() || !settings.saveReports) return;
    const report = e.detail;
    report.syncStatus = 'pending';
    await OfflineStore.putReport(report);
    await enqueue({ type: 'report', projectId: report.projectId, reportId: report.id });
  });

  window.addEventListener('online', () => setTimeout(processQueue, 1500));

  // ==========================================
  // INTERFAZ (vista Descargar)
  // ==========================================
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function renderPanel() {
    const panel = document.getElementById('report-cloud-panel');
    if (!panel) return;
    const pending = (await OfflineStore.listSyncJobs()).length;
    const p = state.currentProject || {};
    let body;
    if (!isConfigured()) {
      body = `
        <p class="text-[11px] text-slate-400">Opcional. Guarda fotos, informes y una hoja de cálculo de control en tu Google Drive. Necesitas un <strong>Client ID de OAuth</strong> (tipo "Aplicación web") con las APIs de Drive y Sheets habilitadas.</p>
        <div class="flex gap-2">
          <input id="cloud-client-id" placeholder="xxxxxxxx.apps.googleusercontent.com" class="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-[11px] text-white font-mono">
          <button type="button" data-act="save-client" class="px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold">Guardar</button>
        </div>`;
    } else {
      body = `
        <div class="flex items-center justify-between gap-2">
          <span class="text-[11px] ${isConnected() ? 'text-emerald-300' : 'text-slate-400'} flex items-center gap-1"><i class="ph-bold ${isConnected() ? 'ph-check-circle' : 'ph-plug'}"></i> ${isConnected() ? 'Conectado a Google' : 'Sin conectar'}</span>
          ${isConnected()
            ? '<button type="button" data-act="disconnect" class="text-[11px] text-slate-400 hover:text-white underline">Desconectar</button>'
            : '<button type="button" data-act="connect" class="px-3 py-1.5 rounded-lg bg-white text-slate-900 text-xs font-bold flex items-center gap-1.5"><i class="ph-bold ph-google-logo"></i> Conectar con Google</button>'}
        </div>
        <label class="flex items-center gap-2 text-[11px] text-slate-300"><input type="checkbox" data-set="saveReports" ${settings.saveReports ? 'checked' : ''}> Guardar cada informe generado también en Drive</label>
        <label class="flex items-center gap-2 text-[11px] text-slate-300"><input type="checkbox" data-set="uploadPhotos" ${settings.uploadPhotos ? 'checked' : ''}> Subir el registro fotográfico a la carpeta del proyecto</label>
        <div class="text-[11px] text-slate-400 space-y-0.5">
          <div>Carpeta del proyecto: ${p.driveFolderUrl ? `<a class="text-blue-400 underline" target="_blank" rel="noopener" href="${esc(p.driveFolderUrl)}">${esc(p.drivePhotosPath ? p.drivePhotosPath.replace(/\/Fotos$/, '') : 'abrir')}</a>` : (p.driveFolderMode === 'existing' ? 'carpeta existente (se usará al sincronizar)' : 'se crea al sincronizar')}</div>
          <div>Hoja de control: ${settings.spreadsheetUrl ? `<a class="text-blue-400 underline" target="_blank" rel="noopener" href="${esc(settings.spreadsheetUrl)}">GeoPhoto AI - Registro</a>` : 'se crea al sincronizar'}</div>
        </div>
        <div class="flex items-center justify-between gap-2 pt-1 border-t border-slate-700/60">
          <span class="text-[11px] ${pending ? 'text-amber-300' : 'text-slate-500'}">${processing ? '<i class="ph-bold ph-spinner animate-spin"></i> Sincronizando…' : `${pending} pendiente${pending === 1 ? '' : 's'} en cola${!online() ? ' · sin conexión' : ''}`}</span>
          <div class="flex gap-1.5">
            <button type="button" data-act="sync-project" class="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-[11px] font-semibold">Sincronizar proyecto</button>
            <button type="button" data-act="settings" class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 text-[11px]" title="Cambiar Client ID"><i class="ph-bold ph-gear"></i></button>
          </div>
        </div>
        ${lastError ? `<p class="text-[11px] text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-2">${esc(lastError)}</p>` : ''}`;
    }
    panel.innerHTML = `<section class="bg-slate-800/60 border border-slate-700 rounded-xl p-3 space-y-2">
      <h3 class="text-xs font-bold text-white flex items-center gap-1.5"><i class="ph-bold ph-cloud text-sky-300"></i> Nube: Google Drive y Sheets</h3>${body}</section>`;

    panel.querySelectorAll('[data-set]').forEach(cb => cb.addEventListener('change', () => { settings[cb.dataset.set] = cb.checked; persist(); }));
    panel.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', async () => {
      const act = b.dataset.act;
      try {
        if (act === 'save-client') {
          const v = document.getElementById('cloud-client-id').value.trim();
          if (!/\.apps\.googleusercontent\.com$/.test(v)) { showToast('Ese no parece un Client ID de Google', 'ph-warning text-amber-400'); return; }
          settings.clientId = v; persist(); renderPanel();
        } else if (act === 'connect') {
          await connect(); showToast('Conectado a Google Drive', 'ph-cloud-check text-emerald-400'); renderPanel(); processQueue();
        } else if (act === 'disconnect') {
          disconnect();
        } else if (act === 'sync-project') {
          await enqueue({ type: 'project', projectId: state.currentProject.id });
          if (!isConnected()) showToast('Quedó en cola: conecta tu cuenta de Google para subirlo', 'ph-cloud-arrow-up text-amber-300');
        } else if (act === 'settings') {
          const v = prompt('Client ID de OAuth de Google (déjalo vacío para quitar la conexión):', settings.clientId);
          if (v === null) return;
          settings.clientId = v.trim(); token = null; persist(); renderPanel();
        }
      } catch (err) {
        lastError = String(err.message || err); renderPanel();
      }
    }));
  }

  const Cloud = {
    _http: http,
    settings, connect, disconnect, enqueue, processQueue, renderPanel, syncProject,
    ensureProjectFolders, ensureSpreadsheet, upsertRows, folderIdFromInput, SHEET_HEADERS,
    isConnected, isConfigured,
    _setTokenForTests: (t) => { token = t; }
  };
  window.Cloud = Cloud;
  document.addEventListener('geophoto:project-changed', () => renderPanel());
})();
