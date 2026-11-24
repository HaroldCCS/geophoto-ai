/**
 * GeoPhoto AI - Versionado de informes (RQ-05)
 *
 * Cada vez que se genera un informe se guarda una versión nueva en IndexedDB:
 *   - Versión MAYOR (1.0 → 2.0): cambió el conjunto u orden de fotos, o la plantilla.
 *   - Versión MENOR (1.0 → 1.1): mismas fotos y plantilla; cambiaron ajustes, textos o se regeneró.
 * El historial permite volver a descargar cualquier versión y, si la nube está activa,
 * cada versión se sube a Drive y se registra en la hoja de cálculo (ver modules/cloud.js).
 */
(function () {
  const ADJUST_FIELDS = ['rotation', 'scale', 'fitMode', 'offsetX', 'offsetY', 'flipH', 'flipV', 'lockAspect', 'note', 'coords'];

  // Hash corto y estable (FNV-1a) para comparar estados del informe
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }

  function fingerprint() {
    const structure = hash(JSON.stringify({
      photos: state.photos.map(p => p.id),
      template: [state.template.name, getActiveFormatType(), !!state.template.hasUserTemplate]
    }));
    const content = hash(JSON.stringify(state.photos.map(p => ADJUST_FIELDS.map(k => p[k] ?? null))));
    return { structure, content };
  }

  function nextVersion(previous, fp) {
    if (!previous) return { major: 1, minor: 0, reason: 'Primera versión del informe' };
    if (previous.structureHash !== fp.structure) return { major: previous.major + 1, minor: 0, reason: 'Cambió el conjunto de fotos o la plantilla' };
    return {
      major: previous.major,
      minor: previous.minor + 1,
      reason: previous.contentHash !== fp.content ? 'Cambiaron ajustes o descripciones' : 'Regenerado sin cambios'
    };
  }

  async function onReportGenerated(blob, fileName) {
    try {
      const project = state.currentProject;
      if (!project || !project.id || !blob) return;
      const history = await OfflineStore.listReports(project.id);
      const prev = history[history.length - 1] || null;
      const fp = fingerprint();
      const v = nextVersion(prev, fp);
      const version = `${v.major}.${v.minor}`;
      const ext = (fileName.match(/\.(docx|xlsx|pdf)$/i) || ['', 'docx'])[1].toLowerCase();
      const base = fileName.replace(/\.(docx|xlsx|pdf)$/i, '');
      const report = {
        id: `${project.id}-v${version}`,
        projectId: project.id,
        projectName: project.name,
        version,
        major: v.major,
        minor: v.minor,
        reason: v.reason,
        fileName: `${base}_v${version}.${ext}`,
        downloadName: fileName,
        format: ext,
        size: blob.size,
        blob,
        createdAt: new Date().toISOString(),
        createdBy: project.createdBy || state.config.userName || '',
        photoCount: state.photos.length,
        photoIds: state.photos.map(p => p.id),
        templateName: state.template.name,
        structureHash: fp.structure,
        contentHash: fp.content,
        driveFileId: null,
        driveUrl: null,
        syncStatus: 'local'
      };
      await OfflineStore.putReport(report);
      if (window.Projects) Projects.markReportGenerated(version);
      showToast(`Informe guardado como versión ${version} (${v.reason.toLowerCase()})`, 'ph-clock-counter-clockwise text-sky-300');
      document.dispatchEvent(new CustomEvent('geophoto:report-saved', { detail: report }));
      renderHistory();
    } catch (err) {
      console.warn('[Versiones] No se pudo guardar la versión del informe:', err);
    }
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadVersion(id) {
    const r = await OfflineStore.getReport(id);
    if (!r || !r.blob) { showToast('Esta versión no tiene archivo guardado en el dispositivo', 'ph-warning text-amber-400'); return; }
    downloadBlob(r.blob, r.fileName);
  }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SYNC = {
    local: ['Solo en el dispositivo', 'text-slate-400', 'ph-device-mobile'],
    pending: ['En cola para Drive', 'text-amber-300', 'ph-cloud-arrow-up'],
    synced: ['En Google Drive', 'text-emerald-300', 'ph-cloud-check'],
    error: ['Error al subir', 'text-red-300', 'ph-cloud-warning']
  };

  async function renderHistory() {
    const panel = document.getElementById('report-history-panel');
    if (!panel || !state.currentProject || !state.currentProject.id) return;
    const list = (await OfflineStore.listReports(state.currentProject.id)).reverse();
    panel.innerHTML = `
      <section class="bg-slate-800/60 border border-slate-700 rounded-xl p-3 space-y-2">
        <h3 class="text-xs font-bold text-white flex items-center gap-1.5"><i class="ph-bold ph-clock-counter-clockwise text-sky-300"></i> Historial de versiones
          <span class="text-[10px] font-normal text-slate-400">· ${esc(state.currentProject.name)}</span></h3>
        ${list.length ? `<ul class="space-y-1.5">${list.map((r, i) => {
          const [label, color, icon] = SYNC[r.syncStatus] || SYNC.local;
          return `<li class="flex items-center gap-2 bg-slate-950/60 border ${i === 0 ? 'border-sky-500/40' : 'border-slate-800'} rounded-lg px-2.5 py-2">
            <span class="font-mono text-xs font-bold ${i === 0 ? 'text-sky-300' : 'text-slate-300'} w-10">v${esc(r.version)}</span>
            <div class="flex-1 min-w-0">
              <div class="text-[11px] text-slate-200 truncate" title="${esc(r.fileName)}">${esc(r.fileName)}</div>
              <div class="text-[10px] text-slate-500 truncate">${new Date(r.createdAt).toLocaleString('es-CO')} · ${r.photoCount} fotos · ${esc(r.reason)}</div>
              <div class="text-[10px] ${color} flex items-center gap-1"><i class="ph-bold ${icon}"></i> ${label}${r.driveUrl ? ` · <a href="${esc(r.driveUrl)}" target="_blank" rel="noopener" class="underline">abrir</a>` : ''}</div>
            </div>
            <button type="button" data-dl="${esc(r.id)}" class="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center" aria-label="Descargar versión ${esc(r.version)}"><i class="ph-bold ph-download-simple"></i></button>
          </li>`;
        }).join('')}</ul>` : '<p class="text-[11px] text-slate-500">Aún no se ha generado ningún informe en este proyecto.</p>'}
      </section>`;
    panel.querySelectorAll('[data-dl]').forEach(b => b.addEventListener('click', () => downloadVersion(b.dataset.dl)));
  }

  window.onReportGenerated = onReportGenerated;
  window.ReportVersions = { renderHistory, downloadVersion, nextVersion, fingerprint };
  document.addEventListener('geophoto:project-changed', renderHistory);
  document.addEventListener('geophoto:report-synced', renderHistory);
})();
