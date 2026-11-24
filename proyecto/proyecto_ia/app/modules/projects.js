/**
 * GeoPhoto AI - Gestión de proyectos (RF-01, RQ-06)
 *
 * Cada proyecto guarda en IndexedDB sus metadatos, fotos, plantilla y página activa.
 * Metadatos RQ-06: id único, nombre, fecha de creación, usuario, estado, fecha del último
 * informe, rutas de Drive (carpeta de fotos e informe) y última modificación.
 */
(function () {
  const STATUSES = ['Borrador', 'En proceso', 'Finalizado'];
  const DEFAULT_TEMPLATE = JSON.parse(JSON.stringify(state.template));

  function generateProjectId() {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `PRJ-${ymd}-${rnd}`;
  }

  function newMeta(fields = {}) {
    const now = new Date().toISOString();
    const name = (fields.name || '').trim() || 'Proyecto sin nombre';
    return {
      id: generateProjectId(),
      name,
      code: (fields.code || '').trim() || name.replace(/[^A-Za-z0-9]+/g, '').slice(0, 8).toUpperCase() || 'PROY',
      client: (fields.client || '').trim(),
      createdBy: (fields.createdBy || state.config.userName || '').trim(),
      status: 'Borrador',
      createdAt: now,
      updatedAt: now,
      lastReportAt: null,
      lastReportVersion: null,
      // Rutas en Google Drive (se llenan al sincronizar, ver modules/cloud.js)
      driveFolderId: null,
      driveFolderUrl: null,
      drivePhotosFolderId: null,
      driveReportsFolderId: null,
      lastReportUrl: null,
      driveFolderMode: fields.driveFolderMode || 'new', // 'new' | 'existing'
      driveExistingFolder: fields.driveExistingFolder || ''
    };
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return iso; }
  }

  function refreshUiForProject() {
    const nameEl = document.getElementById('header-project-name');
    if (nameEl) nameEl.textContent = state.currentProject.name;
    const countBadge = document.getElementById('canvas-badge-count');
    if (countBadge) countBadge.textContent = state.photos.length;
    const headerPill = document.getElementById('header-template-name');
    if (headerPill && typeof getActiveFormatType === 'function') {
      headerPill.textContent = getActiveFormatType() === 'word' ? 'Word' : 'Excel';
    }
    if (typeof updateCanvasGrid === 'function') updateCanvasGrid();
    if (typeof renderPagination === 'function') renderPagination();
    if (typeof updateDirectDownloadView === 'function') updateDirectDownloadView();
    if (typeof updateLiveWatermarkOverlay === 'function') updateLiveWatermarkOverlay();
    document.dispatchEvent(new CustomEvent('geophoto:project-changed', { detail: state.currentProject }));
  }

  function apply(record) {
    state.currentProject = { ...newMeta(), ...(record.meta || {}), id: record.id };
    state.photos = (record.photos || []).map(p => { delete p.previewUrl; return p; });
    state.currentPage = record.currentPage || 1;
    state.selectedPhotoIds.clear();
    state.template = JSON.parse(JSON.stringify(DEFAULT_TEMPLATE));
    if (record.template && record.template.metadata) {
      Object.assign(state.template, record.template.metadata);
      if (record.template.rawBuffer) {
        state.template.rawBuffer = record.template.rawBuffer;
        state.template.hasUserTemplate = true;
      }
    }
    refreshUiForProject();
  }

  async function bootstrap(saved) {
    if (saved && saved.activeProjectId) {
      const rec = await OfflineStore.getProject(saved.activeProjectId);
      if (rec) { apply(rec); return; }
    }
    // ¿Hay algún proyecto guardado aunque no esté marcado como activo?
    const list = await OfflineStore.listProjects();
    if (list.length) {
      apply(await OfflineStore.getProject(list[0].id));
      return;
    }
    // Migración v1 → v2: el trabajo previo se convierte en el primer proyecto
    if (saved && saved.legacy) {
      const legacyMeta = saved.legacy.project || {};
      const meta = newMeta({ name: legacyMeta.name || 'Proyecto migrado', code: legacyMeta.code, client: legacyMeta.client });
      const rec = {
        id: meta.id,
        meta,
        photos: saved.legacy.photos || [],
        template: saved.legacy.template ? { metadata: saved.legacy.template.metadata, rawBuffer: saved.legacy.template.rawBuffer } : null,
        currentPage: 1
      };
      await OfflineStore.putProject(rec);
      await OfflineStore.clearLegacy();
      apply(rec);
      await OfflineStore.saveState(state);
      return;
    }
    // Primera vez: proyecto inicial vacío
    const meta = newMeta({ name: 'Mi primer proyecto' });
    const rec = { id: meta.id, meta, photos: [], template: null, currentPage: 1 };
    await OfflineStore.putProject(rec);
    apply(rec);
    await OfflineStore.saveState(state);
  }

  async function flush() {
    if (typeof offlineSaveTimer !== 'undefined') clearTimeout(offlineSaveTimer);
    await OfflineStore.saveState(state);
  }

  async function create(fields) {
    await flush();
    const meta = newMeta(fields);
    const rec = { id: meta.id, meta, photos: [], template: null, currentPage: 1 };
    await OfflineStore.putProject(rec);
    apply(rec);
    await OfflineStore.saveState(state);
    if (typeof switchView === 'function') switchView('view-camera');
    showToast(`Proyecto creado: ${meta.name} (${meta.id})`, 'ph-folder-plus text-emerald-400');
    return meta;
  }

  async function switchTo(id) {
    if (state.currentProject && state.currentProject.id === id) return;
    await flush();
    const rec = await OfflineStore.getProject(id);
    if (!rec) { showToast('No se encontró el proyecto', 'ph-warning text-amber-400'); return; }
    apply(rec);
    await OfflineStore.saveState(state);
    showToast(`Proyecto abierto: ${rec.meta.name}`, 'ph-folder text-blue-400');
  }

  async function remove(id) {
    const list = await OfflineStore.listProjects();
    if (list.length <= 1) { showToast('Debe existir al menos un proyecto', 'ph-warning text-amber-400'); return false; }
    await OfflineStore.deleteProject(id);
    if (state.currentProject.id === id) {
      const next = (await OfflineStore.listProjects())[0];
      apply(await OfflineStore.getProject(next.id));
      await OfflineStore.saveState(state);
    }
    return true;
  }

  function updateCurrent(fields) {
    Object.assign(state.currentProject, fields);
    if (fields.createdBy !== undefined) state.config.userName = fields.createdBy;
    refreshUiForProject();
    scheduleOfflineSave();
  }

  // Llamado por el módulo de versiones cada vez que se genera un informe
  function markReportGenerated(version, reportUrl) {
    state.currentProject.lastReportAt = new Date().toISOString();
    state.currentProject.lastReportVersion = version;
    if (reportUrl) state.currentProject.lastReportUrl = reportUrl;
    scheduleOfflineSave();
  }

  // ==========================================
  // INTERFAZ: modal de proyectos
  // ==========================================
  function injectUi() {
    const container = document.getElementById('app-container');
    if (!container || document.getElementById('projects-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'projects-modal';
    modal.className = 'hidden fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end md:items-center justify-center p-2';
    modal.innerHTML = `
      <div class="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md max-h-[92vh] flex flex-col shadow-2xl" onclick="event.stopPropagation()">
        <div class="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <h3 class="text-sm font-bold text-white flex items-center gap-2"><i class="ph-bold ph-folder text-blue-400"></i> Proyectos</h3>
          <button type="button" data-close class="w-7 h-7 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center" aria-label="Cerrar"><i class="ph-bold ph-x"></i></button>
        </div>
        <div class="overflow-y-auto p-4 space-y-4">
          <section class="space-y-2">
            <h4 class="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Proyecto activo</h4>
            <div class="grid grid-cols-2 gap-2 text-xs">
              <label class="col-span-2 space-y-1"><span class="text-slate-400">Nombre</span>
                <input id="prj-edit-name" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white" maxlength="80"></label>
              <label class="space-y-1"><span class="text-slate-400">Código / contrato</span>
                <input id="prj-edit-code" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white font-mono" maxlength="24"></label>
              <label class="space-y-1"><span class="text-slate-400">Estado</span>
                <select id="prj-edit-status" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-2 text-white">
                  ${STATUSES.map(s => `<option value="${s}">${s}</option>`).join('')}
                </select></label>
              <label class="space-y-1"><span class="text-slate-400">Cliente / entidad</span>
                <input id="prj-edit-client" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white" maxlength="80"></label>
              <label class="space-y-1"><span class="text-slate-400">Usuario responsable</span>
                <input id="prj-edit-user" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white" maxlength="60"></label>
            </div>
            <dl id="prj-edit-meta" class="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] bg-slate-950/60 border border-slate-800 rounded-lg p-2.5"></dl>
            <button type="button" id="prj-edit-save" class="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold">Guardar cambios</button>
          </section>

          <section class="space-y-2">
            <h4 class="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Todos los proyectos</h4>
            <ul id="prj-list" class="space-y-1.5"></ul>
          </section>

          <section class="space-y-2">
            <h4 class="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Nuevo proyecto</h4>
            <div class="grid grid-cols-2 gap-2 text-xs">
              <input id="prj-new-name" placeholder="Nombre del proyecto" class="col-span-2 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white" maxlength="80">
              <input id="prj-new-code" placeholder="Código (opcional)" class="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white font-mono" maxlength="24">
              <input id="prj-new-client" placeholder="Cliente (opcional)" class="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white" maxlength="80">
              <fieldset class="col-span-2 bg-slate-950/60 border border-slate-800 rounded-lg p-2.5 space-y-1.5">
                <legend class="px-1 text-slate-400">Carpeta en Google Drive</legend>
                <label class="flex items-center gap-2"><input type="radio" name="prj-new-folder" value="new" checked> Crear carpeta nueva para este proyecto</label>
                <label class="flex items-center gap-2"><input type="radio" name="prj-new-folder" value="existing"> Usar una carpeta existente</label>
                <input id="prj-new-folder-link" placeholder="Enlace o ID de la carpeta de Drive" class="hidden w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white">
              </fieldset>
            </div>
            <button type="button" id="prj-new-create" class="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5"><i class="ph-bold ph-folder-plus"></i> Crear y abrir</button>
          </section>
        </div>
      </div>`;
    container.appendChild(modal);

    modal.addEventListener('click', close);
    modal.querySelector('[data-close]').addEventListener('click', close);
    modal.querySelectorAll('input[name="prj-new-folder"]').forEach(r => r.addEventListener('change', () => {
      document.getElementById('prj-new-folder-link').classList.toggle('hidden', r.value !== 'existing' || !r.checked);
    }));

    document.getElementById('prj-edit-save').addEventListener('click', () => {
      updateCurrent({
        name: document.getElementById('prj-edit-name').value.trim() || state.currentProject.name,
        code: document.getElementById('prj-edit-code').value.trim() || state.currentProject.code,
        client: document.getElementById('prj-edit-client').value.trim(),
        createdBy: document.getElementById('prj-edit-user').value.trim(),
        status: document.getElementById('prj-edit-status').value
      });
      showToast('Proyecto actualizado', 'ph-check-circle text-emerald-400');
      render();
    });

    document.getElementById('prj-new-create').addEventListener('click', async () => {
      const nameInput = document.getElementById('prj-new-name');
      if (!nameInput.value.trim()) { nameInput.focus(); showToast('Escribe el nombre del proyecto', 'ph-warning text-amber-400'); return; }
      const mode = modal.querySelector('input[name="prj-new-folder"]:checked').value;
      await create({
        name: nameInput.value,
        code: document.getElementById('prj-new-code').value,
        client: document.getElementById('prj-new-client').value,
        driveFolderMode: mode,
        driveExistingFolder: mode === 'existing' ? document.getElementById('prj-new-folder-link').value.trim() : ''
      });
      ['prj-new-name', 'prj-new-code', 'prj-new-client', 'prj-new-folder-link'].forEach(id => { document.getElementById(id).value = ''; });
      close();
    });

    document.getElementById('prj-list').addEventListener('click', async (e) => {
      const del = e.target.closest('[data-delete]');
      if (del) {
        e.stopPropagation();
        const name = del.dataset.name;
        if (confirm(`¿Eliminar el proyecto "${name}" de este dispositivo?\n\nSe borran sus fotos e informes guardados en la app. Lo que ya esté en Google Drive no se toca.`)) {
          if (await remove(del.dataset.delete)) { showToast(`Proyecto eliminado: ${name}`, 'ph-trash text-red-400'); render(); }
        }
        return;
      }
      const item = e.target.closest('[data-open]');
      if (item) { await switchTo(item.dataset.open); close(); }
    });
  }

  const STATUS_STYLE = {
    'Borrador': 'bg-slate-700/60 text-slate-300 border-slate-600',
    'En proceso': 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    'Finalizado': 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
  };

  async function render() {
    const p = state.currentProject;
    document.getElementById('prj-edit-name').value = p.name || '';
    document.getElementById('prj-edit-code').value = p.code || '';
    document.getElementById('prj-edit-client').value = p.client || '';
    document.getElementById('prj-edit-user').value = p.createdBy || state.config.userName || '';
    document.getElementById('prj-edit-status').value = p.status || 'Borrador';
    const metaRows = [
      ['ID', `<span class="font-mono">${escapeHtml(p.id)}</span>`],
      ['Fotos', String(state.photos.length)],
      ['Creado', formatDate(p.createdAt)],
      ['Modificado', formatDate(p.updatedAt)],
      ['Último informe', p.lastReportAt ? `${formatDate(p.lastReportAt)} · v${escapeHtml(p.lastReportVersion)}` : '—'],
      ['Carpeta Drive', p.driveFolderUrl ? `<a class="text-blue-400 underline" href="${escapeHtml(p.driveFolderUrl)}" target="_blank" rel="noopener">Abrir</a>` : (p.driveFolderMode === 'existing' ? 'Existente (pendiente)' : 'Sin sincronizar')]
    ];
    document.getElementById('prj-edit-meta').innerHTML = metaRows.map(([k, v]) => `<dt class="text-slate-500">${k}</dt><dd class="text-slate-200 text-right truncate">${v}</dd>`).join('');

    const list = await OfflineStore.listProjects();
    document.getElementById('prj-list').innerHTML = list.map(item => {
      const active = item.id === p.id;
      return `<li data-open="${escapeHtml(item.id)}" class="flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer ${active ? 'border-blue-500 bg-blue-500/10' : 'border-slate-800 bg-slate-950/50 hover:border-slate-600'}">
        <i class="ph-bold ${active ? 'ph-folder-open text-blue-400' : 'ph-folder text-slate-400'}"></i>
        <div class="flex-1 min-w-0">
          <div class="text-xs font-semibold text-white truncate">${escapeHtml(item.name)}</div>
          <div class="text-[10px] text-slate-500 font-mono truncate">${escapeHtml(item.id)} · ${item.photoCount} fotos · ${formatDate(item.updatedAt)}</div>
        </div>
        <span class="text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLE[item.status] || STATUS_STYLE.Borrador}">${escapeHtml(item.status || 'Borrador')}</span>
        ${active ? '' : `<button type="button" data-delete="${escapeHtml(item.id)}" data-name="${escapeHtml(item.name)}" class="w-7 h-7 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center" aria-label="Eliminar ${escapeHtml(item.name)}"><i class="ph-bold ph-trash"></i></button>`}
      </li>`;
    }).join('');
  }

  async function open() {
    injectUi();
    await flush();
    await render();
    document.getElementById('projects-modal').classList.remove('hidden');
  }

  function close() {
    const m = document.getElementById('projects-modal');
    if (m) m.classList.add('hidden');
  }

  window.Projects = { bootstrap, create, switchTo, remove, updateCurrent, markReportGenerated, open, close, STATUSES, newMeta };
})();
