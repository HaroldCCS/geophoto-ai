/**
 * GeoPhoto Report AI - Lógica Principal de la Aplicación
 * Prototipo Interactivo de Campo y Mesa de Trabajo
 */

// Logo corporativo vectorial autónomo predeterminado (100% offline, seguro en PWA sin depender de red externa)
const DEFAULT_LOGO_DATA_URL = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="44" viewBox="0 0 160 44"><rect width="160" height="44" rx="6" fill="%231e3a8a"/><rect x="2" y="2" width="156" height="40" rx="5" fill="%230f172a" stroke="%233b82f6" stroke-width="1.5"/><circle cx="24" cy="22" r="12" fill="%232563eb"/><path d="M24 13v18M15 22h18" stroke="%2393c5fd" stroke-width="2" stroke-linecap="round"/><circle cx="24" cy="22" r="4" fill="%23ffffff"/><text x="44" y="23" font-family="Arial,sans-serif" font-weight="900" font-size="12" fill="%23ffffff" letter-spacing="1">GEOPHOTO</text><text x="44" y="34" font-family="Arial,sans-serif" font-weight="700" font-size="8" fill="%2360a5fa" letter-spacing="0.5">INGENIERIA</text></svg>';

// ==========================================
// ESTADO GLOBAL DE LA APLICACIÓN
// ==========================================
const state = {
  activeView: 'view-camera',
  isOnline: true,
  // Proyecto activo. Valor provisional hasta que loadOfflineState() abre el proyecto guardado (ver modules/projects.js)
  currentProject: { id: '', name: 'Proyecto nuevo', code: 'PROY', client: '', status: 'Borrador' },
  config: {
    masterToggle: true,
    showDate: true,
    dateFormat: 'DD/MM/YYYY_24H',
    showGps: true,
    gpsFormat: 'CTM12', // CTM12 por defecto para Colombia
    showMap: true,
    mapZoom: 16, // Nivel de zoom/escala del mini-mapa (12 a 19)
    showLogo: true,
    opacity: 0.65,
    activeNote: 'Fisura observada en zapata de torre',
    logoUrl: DEFAULT_LOGO_DATA_URL,
    logoFileName: 'Logo Predeterminado',
    logoPosition: 'top-right',
    logoSize: 44,
    logoOpacity: 0.9,
    // Estilos de texto y rótulo
    fontFamily: 'sans-serif', // 'sans-serif', 'monospace', 'condensed', 'serif'
    fontSize: 'normal', // 'small', 'normal', 'large'
    textColor: '#FFFFFF', // Color de fuente
    textOpacity: 1.0, // Opacidad de textos (30% a 100%)
    watermarkPosition: 'bottom-full', // 'bottom-full', 'bottom-left', 'bottom-right', 'top-left', 'top-right'
    // Ubicación geográfica: Municipio y Departamento
    showLocation: true,
    department: 'Antioquia',
    municipality: 'Medellín',
    lat: 6.2442,
    lon: -75.5812,
    // Google Drive: enlace y carpeta de destino (por defecto: 'proyecto')
    gdriveLink: localStorage.getItem('geophoto_gdrive_link') || '',
    gdriveFolder: localStorage.getItem('geophoto_gdrive_folder') || 'proyecto',
    // Mesa de ajuste (RQ-12, RQ-15, RQ-16, RQ-19)
    showCropGrid: true,
    minScalePct: 50,
    maxScalePct: 250,
    uniformPhotoSize: true,
    autoExtract: true, // IA: leer metadatos automáticamente al importar fotos
    userName: ''
  },
  template: {
    name: 'Formato_Interventoria_4Fotos.docx',
    type: 'word',
    slotsPerPage: 4,
    hasHeaderLogo: true,
    preExistingPhotosCount: 2
  },
  photos: [], // Sin fotos demo de internet: cada proyecto arranca vacío
  currentPage: 1,
  selectedPhotoIds: new Set(),
  isMultiSelectMode: false,
  syncQueue: []
};
window.state = state;

// ==========================================
// DETERMINACIÓN ESTRICTA Y CANÓNICA DEL FORMATO (WORD O EXCEL)
// ==========================================
function getActiveFormatType() {
  if (typeof state !== 'undefined' && state.template) {
    if (state.template.name) {
      if (/\.xlsx?$/i.test(state.template.name)) return 'excel';
      if (/\.docx?$/i.test(state.template.name)) return 'word';
    }
    if (state.template.uploadedFormat === 'excel' || state.template.type === 'excel') return 'excel';
    if (state.template.uploadedFormat === 'word' || state.template.type === 'word') return 'word';
  }
  return 'word';
}
window.getActiveFormatType = getActiveFormatType;

function getActiveExtension() {
  return getActiveFormatType() === 'word' ? 'docx' : 'xlsx';
}
window.getActiveExtension = getActiveExtension;

// ==========================================
// PERSISTENCIA OFFLINE (INDEXEDDB - OFFLINESTORE)
// ==========================================
const DB_NAME = 'GeoPhotoAI_OfflineDB';
// v2: almacenes por proyecto (projects), historial de informes (reports) y cola de nube (sync_queue)
const DB_VERSION = 2;

function idbRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbTxDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// Copia serializable de la plantilla activa (sin funciones ni referencias DOM)
function serializeTemplate(template) {
  if (!template) return null;
  return {
    metadata: {
      name: template.name,
      type: template.type,
      uploadedFormat: template.uploadedFormat,
      isInvias: !!template.isInvias,
      slotsPerPage: template.slotsPerPage,
      hasHeaderLogo: template.hasHeaderLogo,
      tablesCount: template.tablesCount,
      documentTitle: template.documentTitle,
      preExistingPhotosCount: template.preExistingPhotosCount,
      hasUserTemplate: !!template.hasUserTemplate
    },
    rawBuffer: template.rawBuffer || null
  };
}

const OfflineStore = {
  db: null,

  async open() {
    if (this.db) return this.db;
    return new Promise((resolve) => {
      try {
        if (typeof window === 'undefined' || !window.indexedDB) {
          console.warn('[OfflineStore] IndexedDB no soportado en este entorno');
          resolve(null);
          return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          // Almacenes v1 (se conservan para migrar datos antiguos)
          if (!db.objectStoreNames.contains('app_state')) db.createObjectStore('app_state', { keyPath: 'key' });
          if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('template_data')) db.createObjectStore('template_data', { keyPath: 'id' });
          // Almacenes v2
          if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('reports')) {
            const rs = db.createObjectStore('reports', { keyPath: 'id' });
            rs.createIndex('projectId', 'projectId', { unique: false });
          }
          if (!db.objectStoreNames.contains('sync_queue')) db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
        };
        request.onsuccess = (e) => {
          this.db = e.target.result;
          resolve(this.db);
        };
        request.onerror = (e) => {
          console.warn('[OfflineStore] Error abriendo IndexedDB:', e.target && e.target.error);
          resolve(null);
        };
      } catch (err) {
        console.warn('[OfflineStore] Excepción al inicializar IndexedDB (modo local restringido):', err);
        resolve(null);
      }
    });
  },

  // Guarda la configuración global y el proyecto activo completo (metadatos, fotos y plantilla)
  async saveState(currentState) {
    try {
      const db = await this.open();
      if (!db) return;
      const project = currentState.currentProject;
      const tx = db.transaction(['app_state', 'projects'], 'readwrite');
      const stateStore = tx.objectStore('app_state');
      stateStore.put({ key: 'config', value: currentState.config });
      if (project && project.id) {
        stateStore.put({ key: 'activeProjectId', value: project.id });
        project.updatedAt = new Date().toISOString();
        if (project.status === 'Borrador' && (currentState.photos || []).length > 0) project.status = 'En proceso';
        tx.objectStore('projects').put({
          id: project.id,
          meta: { ...project },
          photos: currentState.photos || [],
          template: serializeTemplate(currentState.template),
          currentPage: currentState.currentPage || 1
        });
      }
      await idbTxDone(tx);
    } catch (err) {
      console.warn('[OfflineStore] Error guardando estado offline:', err);
    }
  },

  // Devuelve { config, activeProjectId, legacy } — legacy trae datos v1 para migrarlos
  async loadState() {
    try {
      const db = await this.open();
      if (!db) return null;
      const tx = db.transaction(['app_state', 'photos', 'template_data'], 'readonly');
      const [configRes, activeRes, legacyProject, legacyPhotos, legacyTemplate] = await Promise.all([
        idbRequest(tx.objectStore('app_state').get('config')),
        idbRequest(tx.objectStore('app_state').get('activeProjectId')),
        idbRequest(tx.objectStore('app_state').get('currentProject')),
        idbRequest(tx.objectStore('photos').getAll()),
        idbRequest(tx.objectStore('template_data').get('active_template'))
      ]);
      return {
        config: configRes?.value || null,
        activeProjectId: activeRes?.value || null,
        legacy: (legacyPhotos && legacyPhotos.length) || legacyTemplate ? {
          project: legacyProject?.value || null,
          photos: (legacyPhotos || []).filter(p => !(p.url || '').includes('unsplash.com')),
          template: legacyTemplate || null
        } : null
      };
    } catch (err) {
      console.warn('[OfflineStore] Error cargando estado offline:', err);
      return null;
    }
  },

  async clearLegacy() {
    const db = await this.open();
    if (!db) return;
    const tx = db.transaction(['photos', 'template_data', 'app_state'], 'readwrite');
    tx.objectStore('photos').clear();
    tx.objectStore('template_data').clear();
    tx.objectStore('app_state').delete('currentProject');
    await idbTxDone(tx);
  },

  // ---- Proyectos ----
  async getProject(id) {
    const db = await this.open();
    if (!db) return null;
    return idbRequest(db.transaction('projects').objectStore('projects').get(id));
  },

  async putProject(record) {
    const db = await this.open();
    if (!db) return;
    const tx = db.transaction('projects', 'readwrite');
    tx.objectStore('projects').put(record);
    await idbTxDone(tx);
  },

  // Lista liviana: solo metadatos y conteo de fotos (recorre con cursor)
  async listProjects() {
    const db = await this.open();
    if (!db) return [];
    return new Promise((resolve, reject) => {
      const out = [];
      const req = db.transaction('projects').objectStore('projects').openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) { resolve(out.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))); return; }
        out.push({ ...cur.value.meta, photoCount: (cur.value.photos || []).length });
        cur.continue();
      };
      req.onerror = () => reject(req.error);
    });
  },

  async deleteProject(id) {
    const db = await this.open();
    if (!db) return;
    const reports = await this.listReports(id);
    const tx = db.transaction(['projects', 'reports'], 'readwrite');
    tx.objectStore('projects').delete(id);
    reports.forEach(r => tx.objectStore('reports').delete(r.id));
    await idbTxDone(tx);
  },

  // ---- Historial de informes (versiones) ----
  async putReport(report) {
    const db = await this.open();
    if (!db) return;
    const tx = db.transaction('reports', 'readwrite');
    tx.objectStore('reports').put(report);
    await idbTxDone(tx);
  },

  async listReports(projectId) {
    const db = await this.open();
    if (!db) return [];
    const all = await idbRequest(db.transaction('reports').objectStore('reports').index('projectId').getAll(projectId));
    return (all || []).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  },

  async getReport(id) {
    const db = await this.open();
    if (!db) return null;
    return idbRequest(db.transaction('reports').objectStore('reports').get(id));
  },

  // ---- Cola de sincronización con la nube (persistente) ----
  async enqueueSync(job) {
    const db = await this.open();
    if (!db) return null;
    const tx = db.transaction('sync_queue', 'readwrite');
    const req = tx.objectStore('sync_queue').add({ ...job, createdAt: new Date().toISOString(), attempts: 0 });
    const id = await idbRequest(req);
    await idbTxDone(tx);
    return id;
  },

  async listSyncJobs() {
    const db = await this.open();
    if (!db) return [];
    return idbRequest(db.transaction('sync_queue').objectStore('sync_queue').getAll());
  },

  async updateSyncJob(job) {
    const db = await this.open();
    if (!db) return;
    const tx = db.transaction('sync_queue', 'readwrite');
    tx.objectStore('sync_queue').put(job);
    await idbTxDone(tx);
  },

  async removeSyncJob(id) {
    const db = await this.open();
    if (!db) return;
    const tx = db.transaction('sync_queue', 'readwrite');
    tx.objectStore('sync_queue').delete(id);
    await idbTxDone(tx);
  }
};

let offlineSaveTimer = null;
function scheduleOfflineSave() {
  clearTimeout(offlineSaveTimer);
  offlineSaveTimer = setTimeout(() => {
    OfflineStore.saveState(state).catch(e => console.warn(e));
  }, 400);
}
window.scheduleOfflineSave = scheduleOfflineSave;

// Cargar estado persistente de IndexedDB
async function loadOfflineState() {
  try {
    const saved = await OfflineStore.loadState();
    if (!saved) {
      if (typeof Projects !== 'undefined') await Projects.bootstrap(null);
      return;
    }

    if (saved.config) {
      Object.assign(state.config, saved.config);
      const masterTgl = document.getElementById('cfg-master-toggle');
      if (masterTgl) masterTgl.checked = !!state.config.masterToggle;
      const dateTgl = document.getElementById('cfg-date-enable');
      if (dateTgl) dateTgl.checked = !!state.config.showDate;
      const dateFmt = document.getElementById('cfg-date-format');
      if (dateFmt && state.config.dateFormat) dateFmt.value = state.config.dateFormat;
      const gpsTgl = document.getElementById('cfg-gps-enable');
      if (gpsTgl) gpsTgl.checked = !!state.config.showGps;
      const gpsFmt = document.getElementById('cfg-gps-format');
      if (gpsFmt && state.config.gpsFormat) gpsFmt.value = state.config.gpsFormat;
      const mapTgl = document.getElementById('cfg-map-enable');
      if (mapTgl) mapTgl.checked = !!state.config.showMap;
      const logoTgl = document.getElementById('cfg-logo-enable');
      if (logoTgl) logoTgl.checked = !!state.config.showLogo;
      const logoControls = document.getElementById('cfg-logo-controls');
      if (logoControls) {
        if (state.config.showLogo) {
          logoControls.classList.remove('opacity-40', 'pointer-events-none');
        } else {
          logoControls.classList.add('opacity-40', 'pointer-events-none');
        }
      }
      const logoBadge = document.getElementById('cfg-logo-status-badge');
      if (logoBadge) {
        logoBadge.textContent = state.config.showLogo ? 'Activo' : 'Desactivado';
        logoBadge.className = state.config.showLogo
          ? 'text-[10px] text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30 font-medium'
          : 'text-[10px] text-slate-400 bg-slate-700/50 px-1.5 py-0.5 rounded border border-slate-600 font-medium';
      }
      const posSelect = document.getElementById('cfg-logo-position');
      if (posSelect && state.config.logoPosition) posSelect.value = state.config.logoPosition;
      const sizeSlider = document.getElementById('cfg-logo-size');
      const sizeVal = document.getElementById('cfg-logo-size-val');
      if (sizeSlider && state.config.logoSize) {
        sizeSlider.value = state.config.logoSize;
        if (sizeVal) sizeVal.textContent = `${state.config.logoSize} px`;
      }
      const opacitySlider = document.getElementById('cfg-logo-opacity');
      const opacityVal = document.getElementById('cfg-logo-opacity-val');
      if (opacitySlider && state.config.logoOpacity !== undefined) {
        opacitySlider.value = Math.round(state.config.logoOpacity * 100);
        if (opacityVal) opacityVal.textContent = `${Math.round(state.config.logoOpacity * 100)}%`;
      }
      const logoNameLabel = document.getElementById('cfg-logo-name-label');
      if (logoNameLabel && state.config.logoFileName) logoNameLabel.textContent = state.config.logoFileName;
      const logoPrev = document.getElementById('cfg-logo-preview');
      if (logoPrev) logoPrev.src = state.config.logoUrl || DEFAULT_LOGO_DATA_URL;
      const noteInp = document.getElementById('cfg-note-input');
      if (noteInp && state.config.activeNote) noteInp.value = state.config.activeNote;

      // Restaurar Zoom del Mini-Mapa
      const mapZoomSlider = document.getElementById('cfg-map-zoom-slider');
      const mapZoomVal = document.getElementById('cfg-map-zoom-val');
      if (mapZoomSlider && state.config.mapZoom) {
        mapZoomSlider.value = state.config.mapZoom;
        if (mapZoomVal) mapZoomVal.textContent = `${state.config.mapZoom}`;
      }

      // Restaurar Municipio y Departamento
      const deptInp = document.getElementById('cfg-department-input');
      if (deptInp && state.config.department) deptInp.value = state.config.department;
      const munInp = document.getElementById('cfg-municipality-input');
      if (munInp && state.config.municipality) munInp.value = state.config.municipality;
      const locTgl = document.getElementById('cfg-location-enable');
      if (locTgl && state.config.showLocation !== undefined) locTgl.checked = !!state.config.showLocation;

      // Restaurar Estilos de Texto y Color
      const fontFam = document.getElementById('cfg-font-family');
      if (fontFam && state.config.fontFamily) fontFam.value = state.config.fontFamily;
      const fontSz = document.getElementById('cfg-font-size');
      if (fontSz && state.config.fontSize) fontSz.value = state.config.fontSize;
      const colorPreset = document.getElementById('cfg-text-color-preset');
      const colorPicker = document.getElementById('cfg-text-color-picker');
      if (state.config.textColor) {
        if (colorPicker) colorPicker.value = state.config.textColor;
        if (colorPreset) {
          const hasOpt = Array.from(colorPreset.options).some(o => o.value.toLowerCase() === state.config.textColor.toLowerCase());
          colorPreset.value = hasOpt ? state.config.textColor : 'custom';
        }
      }
      const textOpSlider = document.getElementById('cfg-text-opacity');
      const textOpVal = document.getElementById('cfg-text-opacity-val');
      if (textOpSlider && state.config.textOpacity !== undefined) {
        textOpSlider.value = Math.round(state.config.textOpacity * 100);
        if (textOpVal) textOpVal.textContent = `${Math.round(state.config.textOpacity * 100)}%`;
      }
      const wmPos = document.getElementById('cfg-watermark-position');
      if (wmPos && state.config.watermarkPosition) wmPos.value = state.config.watermarkPosition;

      if (typeof updateLiveWatermarkOverlay === 'function') {
        updateLiveWatermarkOverlay();
      }
    }

    // Abrir el proyecto activo (o migrar datos v1 / crear el primero). Ver modules/projects.js
    if (typeof Projects !== 'undefined') {
      await Projects.bootstrap(saved);
    }
  } catch (err) {
    console.warn('[OfflineStore] Error cargando datos guardados:', err);
  }
}

// ==========================================
// CONTROL DE MODO DE ESCRITORIO EXPANDIDO
// ==========================================
function initDesktopLayout() {
  const isExpanded = localStorage.getItem('geophoto_desktop_expanded') === 'true';
  const container = document.getElementById('app-container');
  const icon = document.getElementById('btn-toggle-layout-icon');
  
  if (isExpanded && container) {
    container.classList.add('desktop-expanded');
    if (icon) {
      icon.className = 'ph-bold ph-arrows-in-simple';
    }
  }
}

function toggleDesktopLayout() {
  const container = document.getElementById('app-container');
  const icon = document.getElementById('btn-toggle-layout-icon');
  if (!container) return;

  const isExpanded = container.classList.toggle('desktop-expanded');
  localStorage.setItem('geophoto_desktop_expanded', isExpanded ? 'true' : 'false');

  if (icon) {
    icon.className = isExpanded ? 'ph-bold ph-arrows-in-simple' : 'ph-bold ph-arrows-out-simple';
  }

  showToast(
    isExpanded 
      ? 'Modo Pantalla Ancha Activado (Escritorio / Multi-columna)' 
      : 'Modo Marco Móvil Activado (Simulador de Campo)',
    'ph-monitor text-blue-400'
  );
}
window.toggleDesktopLayout = toggleDesktopLayout;

// ==========================================
// REGISTRO DE SERVICE WORKER Y PWA INSTALL
// ==========================================
let deferredPwaPrompt = null;

function initPwaAndServiceWorker() {
  // 1. Registro de Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(registration => {
          console.log('[PWA] Service Worker registrado:', registration.scope);
          registration.onupdatefound = () => {
            const installingWorker = registration.installing;
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  showToast('Nueva versión de GeoPhoto AI disponible. Recarga la página.', 'ph-arrow-clockwise text-blue-400');
                }
              };
            }
          };
        })
        .catch(err => {
          console.warn('[PWA] Service Worker no registrado (esperado en file://):', err);
        });
    });
  }

  // 2. Detección nativa de conexión online / offline
  window.addEventListener('online', () => {
    state.isOnline = true;
    updateNetworkStatusUI(true);
    showToast('Conectividad restablecida: sincronizando datos', 'ph-wifi-high text-emerald-400');
    processSyncQueue();
  });

  window.addEventListener('offline', () => {
    state.isOnline = false;
    updateNetworkStatusUI(false);
    showToast('Modo Offline: Funcionando 100% autónomo con IndexedDB', 'ph-wifi-slash text-amber-400');
  });

  if (!navigator.onLine) {
    state.isOnline = false;
    updateNetworkStatusUI(false);
  }

  // 3. Captura del evento beforeinstallprompt (Chrome / Edge / Android)
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPwaPrompt = e;
    
    const installBtn = document.getElementById('btn-install-pwa');
    if (installBtn) installBtn.classList.remove('hidden');

    const banner = document.getElementById('pwa-install-banner');
    const dismissed = sessionStorage.getItem('pwa_banner_dismissed');
    if (banner && !dismissed && !isStandalonePwa()) {
      banner.classList.remove('hidden');
    }
  });

  // 4. Confirmación de app instalada
  window.addEventListener('appinstalled', () => {
    console.log('[PWA] GeoPhoto AI instalada como aplicación');
    deferredPwaPrompt = null;
    hidePwaInstallUI();
    showToast('¡GeoPhoto AI instalada con éxito en tu dispositivo!', 'ph-check-circle text-emerald-400');
  });

  // 5. Ocultar botones si ya está en modo Standalone
  if (isStandalonePwa()) {
    hidePwaInstallUI();
  }
}

function isStandalonePwa() {
  if (typeof window === 'undefined') return false;
  const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(display-mode: standalone)').matches : false;
  const isIosStandalone = !!(window.navigator && window.navigator.standalone === true);
  const isAndroidApp = !!(typeof document !== 'undefined' && document.referrer && typeof document.referrer === 'string' && document.referrer.includes('android-app://'));
  return !!(mq || isIosStandalone || isAndroidApp);
}

function triggerPwaInstallPrompt() {
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  if (isIos && !isStandalonePwa()) {
    const iosModal = document.getElementById('pwa-ios-modal');
    if (iosModal) iosModal.classList.remove('hidden');
    return;
  }

  if (deferredPwaPrompt) {
    deferredPwaPrompt.prompt();
    deferredPwaPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        hidePwaInstallUI();
      }
      deferredPwaPrompt = null;
    });
  } else {
    if (isStandalonePwa()) {
      showToast('GeoPhoto AI ya está instalada como aplicación', 'ph-check-circle text-blue-400');
    } else {
      showToast('Para instalar: usa la opción "Instalar aplicación" o "Agregar a inicio" de tu navegador', 'ph-info text-blue-400');
    }
  }
}
window.triggerPwaInstallPrompt = triggerPwaInstallPrompt;

function dismissPwaBanner() {
  const banner = document.getElementById('pwa-install-banner');
  if (banner) banner.classList.add('hidden');
  sessionStorage.setItem('pwa_banner_dismissed', 'true');
}
window.dismissPwaBanner = dismissPwaBanner;

function closeIosInstallModal() {
  const modal = document.getElementById('pwa-ios-modal');
  if (modal) modal.classList.add('hidden');
}
window.closeIosInstallModal = closeIosInstallModal;

function hidePwaInstallUI() {
  const installBtn = document.getElementById('btn-install-pwa');
  if (installBtn) installBtn.classList.add('hidden');
  const banner = document.getElementById('pwa-install-banner');
  if (banner) banner.classList.add('hidden');
}

function updateNetworkStatusUI(isOnline) {
  const netBtn = document.getElementById('network-toggle-btn');
  const netDot = document.getElementById('network-dot');
  const netText = document.getElementById('network-status-text');
  if (!netBtn || !netDot || !netText) return;

  if (isOnline) {
    netBtn.className = 'flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
    netDot.className = 'w-2 h-2 rounded-full bg-emerald-500 animate-pulse';
    netText.textContent = 'Online';
  } else {
    netBtn.className = 'flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30';
    netDot.className = 'w-2 h-2 rounded-full bg-amber-500';
    netText.textContent = 'Offline';
  }
}

// ==========================================
// INICIALIZACIÓN Y EVENT LISTENERS
// ==========================================
function initApp() {
  try {
    initNavigation();
  } catch (err) {
    console.warn('[initApp] Error inicializando navegación:', err);
  }

  try {
    initCameraAndWatermark();
  } catch (err) {
    console.warn('[initApp] Error inicializando cámara/marca:', err);
  }

  try {
    initTemplateModule();
  } catch (err) {
    console.warn('[initApp] Error inicializando plantillas:', err);
  }

  try {
    initCanvasModule();
  } catch (err) {
    console.warn('[initApp] Error inicializando mesa de trabajo:', err);
  }

  try {
    initExportModule();
  } catch (err) {
    console.warn('[initApp] Error inicializando exportación:', err);
  }

  try {
    initDesktopLayout();
  } catch (err) {
    console.warn('[initApp] Error inicializando modo escritorio:', err);
  }

  try {
    initPwaAndServiceWorker();
  } catch (err) {
    console.warn('[initApp] Error inicializando PWA/SW:', err);
  }

  try {
    updateCanvasGrid();
    renderPagination();
    if (typeof updateDirectDownloadView === 'function') updateDirectDownloadView();
  } catch (err) {
    console.warn('[initApp] Error en render inicial de fotos:', err);
  }

  loadOfflineState().then(() => {
    try {
      updateCanvasGrid();
      renderPagination();
      if (typeof updateDirectDownloadView === 'function') updateDirectDownloadView();
    } catch (err) {
      console.warn('[initApp] Error refrescando vista tras offline load:', err);
    }
  }).catch((err) => {
    console.warn('[initApp] Error en carga de estado diferida:', err);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// ==========================================
// 1. NAVEGACIÓN ENTRE VISTAS
// ==========================================
function initNavigation() {
  const navBtns = document.querySelectorAll('.nav-tab-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      switchView(targetId);
    });
  });

  // Toggle de conexión (Online / Offline simulator)
  const netBtn = document.getElementById('network-toggle-btn');
  const netDot = document.getElementById('network-dot');
  const netText = document.getElementById('network-status-text');

  if (netBtn) {
    netBtn.addEventListener('click', () => {
      state.isOnline = !state.isOnline;
      updateNetworkStatusUI(state.isOnline);
      if (state.isOnline) {
        showToast('Conectividad restablecida: procesando sincronizaciones pendientes', 'ph-wifi-high text-emerald-400');
        processSyncQueue();
      } else {
        showToast('Modo Offline: todo se guarda en el dispositivo y se sube a Drive al reconectar', 'ph-wifi-slash text-amber-400');
      }
    });
  }
}

function switchView(viewId) {
  state.activeView = viewId;
  document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(viewId);
  if (target) {
    target.classList.add('active');
  }

  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    if (btn.dataset.target === viewId) {
      btn.classList.add('active', 'text-blue-500');
      btn.classList.remove('text-slate-400');
    } else {
      btn.classList.remove('active', 'text-blue-500');
      btn.classList.add('text-slate-400');
    }
  });

  if (viewId === 'view-canvas') {
    updateCanvasGrid();
  } else if (viewId === 'view-export') {
    if (typeof updateDirectDownloadView === 'function') updateDirectDownloadView();
    if (window.ReportVersions) ReportVersions.renderHistory();
    if (window.Cloud) Cloud.renderPanel();
  }
}
window.switchView = switchView;

// ==========================================
// 2. CÁMARA Y ESTAMPADO EN VIVO (TIMEMARK STYLE)
// ==========================================
function initCameraAndWatermark() {
  const videoElem = document.getElementById('camera-stream');
  const simulatedView = document.getElementById('simulated-view');

  // Intentar abrir cámara real si está disponible y en entorno seguro
  try {
    if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        .then(stream => {
          videoElem.srcObject = stream;
          videoElem.classList.remove('hidden');
          simulatedView.classList.add('hidden');
        })
        .catch(() => {
          console.log('Usando vista simulada de campo');
        });
    }
  } catch (err) {
    console.log('Cámara física no disponible en este contexto, usando vista simulada:', err);
  }

  // Controles de Configuración Drawer
  const configDrawer = document.getElementById('config-drawer');
  document.getElementById('btn-open-config').addEventListener('click', () => {
    configDrawer.classList.add('open');
  });
  document.getElementById('btn-close-config').addEventListener('click', () => {
    configDrawer.classList.remove('open');
  });
  document.getElementById('btn-save-config').addEventListener('click', () => {
    applyConfigFromInputs();
    configDrawer.classList.remove('open');
    showToast('Parámetros de estampado actualizados');
  });

  // Slider de Opacidad en vivo
  const opacitySlider = document.getElementById('cfg-opacity-slider');
  const opacityVal = document.getElementById('cfg-opacity-val');
  if (opacitySlider) {
    opacitySlider.addEventListener('input', (e) => {
      if (opacityVal) opacityVal.textContent = `${e.target.value}%`;
      state.config.opacity = e.target.value / 100;
      updateLiveWatermarkOverlay();
    });
  }

  // Control de Mini-Mapa: Switch en vivo en la cabecera del panel
  const mapEnableToggle = document.getElementById('cfg-map-enable');
  if (mapEnableToggle) {
    mapEnableToggle.addEventListener('change', (e) => {
      state.config.showMap = e.target.checked;
      updateLiveWatermarkOverlay();
      scheduleOfflineSave();
    });
  }

  // Control de Logo: Switch en vivo dentro de la tarjeta de logo (sin desaparecer controles)
  const logoEnableToggle = document.getElementById('cfg-logo-enable');
  const logoControls = document.getElementById('cfg-logo-controls');
  const logoStatusBadge = document.getElementById('cfg-logo-status-badge');
  const updateLogoControlsUI = (enabled) => {
    if (logoControls) {
      if (enabled) {
        logoControls.classList.remove('opacity-40', 'pointer-events-none');
      } else {
        logoControls.classList.add('opacity-40', 'pointer-events-none');
      }
    }
    if (logoStatusBadge) {
      logoStatusBadge.textContent = enabled ? 'Activo' : 'Desactivado';
      logoStatusBadge.className = enabled
        ? 'text-[10px] text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30 font-medium'
        : 'text-[10px] text-slate-400 bg-slate-700/50 px-1.5 py-0.5 rounded border border-slate-600 font-medium';
    }
  };

  if (logoEnableToggle) {
    logoEnableToggle.addEventListener('change', (e) => {
      state.config.showLogo = e.target.checked;
      updateLogoControlsUI(e.target.checked);
      updateLiveWatermarkOverlay();
      scheduleOfflineSave();
    });
  }

  // Carga de archivo de logo personalizado
  const logoUploadBtn = document.getElementById('btn-upload-logo');
  const logoFileInput = document.getElementById('cfg-logo-file-input');
  if (logoUploadBtn && logoFileInput) {
    logoUploadBtn.addEventListener('click', () => {
      // Si el logo estaba apagado, encenderlo al interactuar
      if (!state.config.showLogo) {
        state.config.showLogo = true;
        if (logoEnableToggle) logoEnableToggle.checked = true;
        updateLogoControlsUI(true);
      }
      logoFileInput.value = '';
      logoFileInput.click();
    });

    logoFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        state.config.showLogo = true;
        if (logoEnableToggle) logoEnableToggle.checked = true;
        updateLogoControlsUI(true);

        state.config.logoUrl = loadEvt.target.result;
        state.config.logoFileName = file.name;
        cachedLogoImg = null;
        cachedLogoUrl = null;
        const nameLabel = document.getElementById('cfg-logo-name-label');
        if (nameLabel) nameLabel.textContent = file.name;
        const cfgPreview = document.getElementById('cfg-logo-preview');
        if (cfgPreview) cfgPreview.src = loadEvt.target.result;
        updateLiveWatermarkOverlay();
        scheduleOfflineSave();
        showToast(`Logo personalizado cargado: ${file.name}`, 'ph-image text-emerald-400');
      };
      reader.readAsDataURL(file);
    });
  }

  // Botón restablecer logo predeterminado
  const logoResetBtn = document.getElementById('btn-reset-logo');
  if (logoResetBtn) {
    logoResetBtn.addEventListener('click', () => {
      state.config.logoUrl = DEFAULT_LOGO_DATA_URL;
      state.config.logoFileName = 'Logo predeterminado';
      state.config.showLogo = true;
      if (logoEnableToggle) logoEnableToggle.checked = true;
      updateLogoControlsUI(true);

      state.config.logoPosition = 'top-right';
      state.config.logoSize = 44;
      state.config.logoOpacity = 0.9;
      cachedLogoImg = null;
      cachedLogoUrl = null;

      const posSel = document.getElementById('cfg-logo-position');
      if (posSel) posSel.value = 'top-right';
      const szSlider = document.getElementById('cfg-logo-size');
      const szVal = document.getElementById('cfg-logo-size-val');
      if (szSlider) szSlider.value = 44;
      if (szVal) szVal.textContent = '44 px';
      const opSlider = document.getElementById('cfg-logo-opacity');
      const opVal = document.getElementById('cfg-logo-opacity-val');
      if (opSlider) opSlider.value = 90;
      if (opVal) opVal.textContent = '90%';
      const nameLabel = document.getElementById('cfg-logo-name-label');
      if (nameLabel) nameLabel.textContent = 'Logo predeterminado';
      const cfgPreview = document.getElementById('cfg-logo-preview');
      if (cfgPreview) cfgPreview.src = DEFAULT_LOGO_DATA_URL;

      updateLiveWatermarkOverlay();
      scheduleOfflineSave();
      showToast('Logo restablecido a configuración inicial');
    });
  }

  // Selector de posición del logo
  const logoPosSelect = document.getElementById('cfg-logo-position');
  if (logoPosSelect) {
    logoPosSelect.addEventListener('change', (e) => {
      state.config.logoPosition = e.target.value;
      updateLiveWatermarkOverlay();
      scheduleOfflineSave();
      showToast(`Ubicación de logo: ${e.target.options[e.target.selectedIndex].text}`);
    });
  }

  // Slider de tamaño del logo
  const logoSizeSlider = document.getElementById('cfg-logo-size');
  const logoSizeVal = document.getElementById('cfg-logo-size-val');
  if (logoSizeSlider) {
    logoSizeSlider.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      if (logoSizeVal) logoSizeVal.textContent = `${val} px`;
      state.config.logoSize = val;
      updateLiveWatermarkOverlay();
      scheduleOfflineSave();
    });
  }

  // Slider de transparencia / opacidad del logo
  const logoOpacitySlider = document.getElementById('cfg-logo-opacity');
  const logoOpacityVal = document.getElementById('cfg-logo-opacity-val');
  if (logoOpacitySlider) {
    logoOpacitySlider.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      if (logoOpacityVal) logoOpacityVal.textContent = `${val}%`;
      state.config.logoOpacity = val / 100;
      updateLiveWatermarkOverlay();
      scheduleOfflineSave();
    });
  }

  // Control de Zoom y Escala del Mini-Mapa (Slider y Botones +/-)
  const mapZoomSlider = document.getElementById('cfg-map-zoom-slider');
  const mapZoomVal = document.getElementById('cfg-map-zoom-val');
  const btnZoomIn = document.getElementById('btn-map-zoom-in');
  const btnZoomOut = document.getElementById('btn-map-zoom-out');
  const btnOverlayZoomIn = document.getElementById('btn-overlay-zoom-in');
  const btnOverlayZoomOut = document.getElementById('btn-overlay-zoom-out');

  const setMapZoom = (newZoom) => {
    const clamped = Math.max(12, Math.min(19, Number(newZoom)));
    state.config.mapZoom = clamped;
    if (mapZoomSlider) mapZoomSlider.value = clamped;
    if (mapZoomVal) {
      mapZoomVal.textContent = `${clamped}`;
    }
    updateLiveWatermarkOverlay();
    scheduleOfflineSave();
  };

  if (mapZoomSlider) {
    mapZoomSlider.addEventListener('input', (e) => setMapZoom(e.target.value));
  }
  if (btnZoomIn) {
    btnZoomIn.addEventListener('click', () => setMapZoom((state.config.mapZoom || 16) + 1));
  }
  if (btnZoomOut) {
    btnZoomOut.addEventListener('click', () => setMapZoom((state.config.mapZoom || 16) - 1));
  }
  if (btnOverlayZoomIn) {
    btnOverlayZoomIn.addEventListener('click', (e) => {
      e.stopPropagation();
      setMapZoom((state.config.mapZoom || 16) + 1);
    });
  }
  if (btnOverlayZoomOut) {
    btnOverlayZoomOut.addEventListener('click', (e) => {
      e.stopPropagation();
      setMapZoom((state.config.mapZoom || 16) - 1);
    });
  }

  // Inputs manuales de Departamento y Municipio
  const deptInput = document.getElementById('cfg-department-input');
  if (deptInput) {
    deptInput.addEventListener('input', (e) => {
      state.config.department = e.target.value;
      updateLiveWatermarkOverlay();
      scheduleOfflineSave();
    });
  }
  const munInput = document.getElementById('cfg-municipality-input');
  if (munInput) {
    munInput.addEventListener('input', (e) => {
      state.config.municipality = e.target.value;
      updateLiveWatermarkOverlay();
      scheduleOfflineSave();
    });
  }
  const locToggle = document.getElementById('cfg-location-enable');
  if (locToggle) {
    locToggle.addEventListener('change', (e) => {
      state.config.showLocation = e.target.checked;
      updateLiveWatermarkOverlay();
      scheduleOfflineSave();
    });
  }

  // Selector de Sistema de Coordenadas (CTM12, EPSG:3116, UTM, etc.)
  const gpsFmtSelect = document.getElementById('cfg-gps-format');
  if (gpsFmtSelect) {
    gpsFmtSelect.addEventListener('change', (e) => {
      state.config.gpsFormat = e.target.value;
      updateLiveWatermarkOverlay();
      scheduleOfflineSave();
      showToast(`Coordenadas: ${e.target.options[e.target.selectedIndex].text.split('(')[0].trim()}`);
    });
  }

  // Estilos de Texto: Tipografía, Tamaño, Color y Opacidad
  const fontFamSelect = document.getElementById('cfg-font-family');
  if (fontFamSelect) {
    fontFamSelect.addEventListener('change', (e) => {
      state.config.fontFamily = e.target.value;
      updateLiveWatermarkOverlay();
      scheduleOfflineSave();
    });
  }

  const fontSzSelect = document.getElementById('cfg-font-size');
  if (fontSzSelect) {
    fontSzSelect.addEventListener('change', (e) => {
      state.config.fontSize = e.target.value;
      updateLiveWatermarkOverlay();
      scheduleOfflineSave();
    });
  }

  const textColorPreset = document.getElementById('cfg-text-color-preset');
  const textColorPicker = document.getElementById('cfg-text-color-picker');
  if (textColorPreset && textColorPicker) {
    textColorPreset.addEventListener('change', (e) => {
      if (e.target.value !== 'custom') {
        textColorPicker.value = e.target.value;
        state.config.textColor = e.target.value;
        updateLiveWatermarkOverlay();
        scheduleOfflineSave();
      }
    });
    textColorPicker.addEventListener('input', (e) => {
      state.config.textColor = e.target.value;
      if (textColorPreset) textColorPreset.value = 'custom';
      updateLiveWatermarkOverlay();
      scheduleOfflineSave();
    });
  }

  const textOpacitySlider = document.getElementById('cfg-text-opacity');
  const textOpacityVal = document.getElementById('cfg-text-opacity-val');
  if (textOpacitySlider) {
    textOpacitySlider.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      if (textOpacityVal) textOpacityVal.textContent = `${val}%`;
      state.config.textOpacity = val / 100;
      updateLiveWatermarkOverlay();
      scheduleOfflineSave();
    });
  }

  // Ubicación Agrupada del Rótulo
  const wmPosSelect = document.getElementById('cfg-watermark-position');
  if (wmPosSelect) {
    wmPosSelect.addEventListener('change', (e) => {
      state.config.watermarkPosition = e.target.value;
      updateLiveWatermarkOverlay();
      scheduleOfflineSave();
      showToast(`Ubicación de textos: ${e.target.options[e.target.selectedIndex].text}`);
    });
  }

  // Nota rápida
  const quickNoteBtn = document.getElementById('btn-quick-note');
  if (quickNoteBtn) {
    quickNoteBtn.addEventListener('click', () => {
      const newNote = prompt('Ingrese nota o descripción rápida para la foto:', state.config.activeNote);
      if (newNote !== null) {
        state.config.activeNote = newNote;
        const noteInp = document.getElementById('cfg-note-input');
        if (noteInp) noteInp.value = newNote;
        updateLiveWatermarkOverlay();
        showToast('Nota actualizada');
      }
    });
  }

  // Disparador de Cámara (Captura y Estampado)
  const shutterBtn = document.getElementById('btn-shutter');
  if (shutterBtn) {
    shutterBtn.addEventListener('click', () => {
      takePhoto();
    });
  }

  // Importar desde galería
  const fileImportInput = document.getElementById('file-import-input');
  if (fileImportInput) {
    fileImportInput.addEventListener('change', (e) => {
      handleGalleryImport(e.target.files);
    });
  }

  // Inicializar geolocalización pasiva al arrancar si el navegador lo permite
  initPassiveGeolocation();

  updateLiveWatermarkOverlay();
}

function applyConfigFromInputs() {
  const masterTgl = document.getElementById('cfg-master-toggle');
  if (masterTgl) state.config.masterToggle = masterTgl.checked;
  const dateTgl = document.getElementById('cfg-date-enable');
  if (dateTgl) state.config.showDate = dateTgl.checked;
  const dateFmt = document.getElementById('cfg-date-format');
  if (dateFmt) state.config.dateFormat = dateFmt.value;
  const gpsTgl = document.getElementById('cfg-gps-enable');
  if (gpsTgl) state.config.showGps = gpsTgl.checked;
  const gpsFmt = document.getElementById('cfg-gps-format');
  if (gpsFmt) state.config.gpsFormat = gpsFmt.value;
  const mapTgl = document.getElementById('cfg-map-enable');
  if (mapTgl) state.config.showMap = mapTgl.checked;
  const logoTgl = document.getElementById('cfg-logo-enable');
  if (logoTgl) state.config.showLogo = logoTgl.checked;
  const noteInp = document.getElementById('cfg-note-input');
  if (noteInp) state.config.activeNote = noteInp.value;

  const mapZoomSlider = document.getElementById('cfg-map-zoom-slider');
  if (mapZoomSlider) state.config.mapZoom = Number(mapZoomSlider.value);

  const locTgl = document.getElementById('cfg-location-enable');
  if (locTgl) state.config.showLocation = locTgl.checked;
  const deptInp = document.getElementById('cfg-department-input');
  if (deptInp) state.config.department = deptInp.value;
  const munInp = document.getElementById('cfg-municipality-input');
  if (munInp) state.config.municipality = munInp.value;

  const fontFam = document.getElementById('cfg-font-family');
  if (fontFam) state.config.fontFamily = fontFam.value;
  const fontSz = document.getElementById('cfg-font-size');
  if (fontSz) state.config.fontSize = fontSz.value;
  const colorPicker = document.getElementById('cfg-text-color-picker');
  if (colorPicker) state.config.textColor = colorPicker.value;
  const textOpSlider = document.getElementById('cfg-text-opacity');
  if (textOpSlider) state.config.textOpacity = Number(textOpSlider.value) / 100;
  const wmPos = document.getElementById('cfg-watermark-position');
  if (wmPos) state.config.watermarkPosition = wmPos.value;

  const posSelect = document.getElementById('cfg-logo-position');
  if (posSelect) state.config.logoPosition = posSelect.value;
  const sizeSlider = document.getElementById('cfg-logo-size');
  if (sizeSlider) state.config.logoSize = Number(sizeSlider.value);
  const opacitySlider = document.getElementById('cfg-logo-opacity');
  if (opacitySlider) state.config.logoOpacity = Number(opacitySlider.value) / 100;

  updateLiveWatermarkOverlay();
  scheduleOfflineSave();
}

// ==========================================
// RENDERIZADOR CARTOGRÁFICO RESILIENTE (100% OFFLINE)
// MINI-MAPA DE INGENIERÍA Y TOPOGRAFÍA DE ALTA PRECISIÓN
// ==========================================
function drawProceduralMiniMap(target, lat = 6.2442, lon = -75.5812, zoom = 16, w = 128, h = 128) {
  let ctx;
  if (target && target.getContext) {
    ctx = target.getContext('2d');
    w = target.width || w;
    h = target.height || h;
  } else if (target && typeof target.fillRect === 'function') {
    ctx = target;
  } else {
    return;
  }

  ctx.save();
  // 1. Fondo base topográfico oscuro de alta legibilidad
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, w, h);

  // 2. Curvas de nivel topográficas técnicas
  ctx.strokeStyle = 'rgba(51, 65, 85, 0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(w * 0.25, h * 0.35, w * 0.45, 0, Math.PI * 2);
  ctx.arc(w * 0.25, h * 0.35, w * 0.75, 0, Math.PI * 2);
  ctx.arc(w * 0.8, h * 0.75, w * 0.5, 0, Math.PI * 2);
  ctx.stroke();

  // 3. Trazo hidrográfico / río cartográfico
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
  ctx.lineWidth = Math.max(2, Math.round(w * 0.04));
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.72);
  ctx.bezierCurveTo(w * 0.35, h * 0.62, w * 0.65, h * 0.82, w, h * 0.58);
  ctx.stroke();

  // 4. Malla vial dinámica según escala/zoom
  const zoomFactor = Math.max(12, Math.min(19, parseInt(zoom, 10) || 16));
  const roadSpacing = Math.max(14, Math.round(w / (zoomFactor - 9)));
  
  // Calles secundarias de sector
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const offsetX = Math.abs(Math.round(lon * 10000)) % roadSpacing;
  const offsetY = Math.abs(Math.round(lat * 10000)) % roadSpacing;
  for (let x = offsetX; x < w; x += roadSpacing) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = offsetY; y < h; y += roadSpacing) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  // Troncal / Vía Principal de Acceso
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.8)';
  ctx.lineWidth = Math.max(2, Math.round(w * 0.035));
  ctx.beginPath();
  ctx.moveTo(0, h * 0.42);
  ctx.lineTo(w, h * 0.46);
  ctx.moveTo(w * 0.52, 0);
  ctx.lineTo(w * 0.48, h);
  ctx.stroke();

  // 5. Marco cartográfico con cuadrícula geodésica
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, w, h);

  // 6. Flecha y Norte Geográfico
  ctx.fillStyle = '#60a5fa';
  ctx.font = `bold ${Math.max(7, Math.round(w * 0.08))}px monospace`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('N ↑', w - 4, 3);

  // 7. Escala métrica según nivel de zoom
  const scaleText = zoomFactor >= 18 ? '50m' : zoomFactor >= 16 ? '200m' : zoomFactor >= 14 ? '1km' : '5km';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.font = `${Math.max(7, Math.round(w * 0.07))}px monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`⟷ ${scaleText}`, 4, h - 16);

  ctx.restore();
}

function updateLiveWatermarkOverlay() {
  const overlay = document.getElementById('live-watermark-overlay');
  const floatingBox = document.getElementById('live-logo-floating-box');
  const floatingImg = document.getElementById('overlay-logo-floating');
  const bannerLogoLeft = document.getElementById('overlay-logo-banner-left');
  const bannerLogoRight = document.getElementById('overlay-logo-banner-right');
  const leftImg = document.getElementById('overlay-logo-left-img');
  const rightImg = document.getElementById('overlay-logo-right-img');

  if (!state.config.masterToggle) {
    if (overlay) overlay.classList.add('hidden');
    if (floatingBox) floatingBox.classList.add('hidden');
    return;
  }
  if (overlay) overlay.classList.remove('hidden');

  // Aplicar opacidad del fondo de la tarjeta/cintillo
  if (overlay) {
    overlay.style.backgroundColor = `rgba(15, 23, 42, ${state.config.opacity !== undefined ? state.config.opacity : 0.65})`;

    // Posicionamiento agrupado del bloque completo (conservando textos unidos en una sola tarjeta o cintillo)
    const wmPos = state.config.watermarkPosition || 'bottom-full';
    let posClasses = 'absolute p-3 rounded-xl border border-white/20 transition-all z-20 shadow-2xl ';
    if (wmPos === 'bottom-left') {
      posClasses += 'bottom-4 left-3 right-auto max-w-[88%] sm:max-w-md';
    } else if (wmPos === 'bottom-right') {
      posClasses += 'bottom-4 right-3 left-auto max-w-[88%] sm:max-w-md';
    } else if (wmPos === 'top-left') {
      posClasses += 'top-14 left-3 right-auto max-w-[88%] sm:max-w-md';
    } else if (wmPos === 'top-right') {
      posClasses += 'top-14 right-3 left-auto max-w-[88%] sm:max-w-md';
    } else {
      // 'bottom-full' por defecto
      posClasses += 'bottom-4 inset-x-3';
    }
    overlay.className = posClasses;
  }

  // Estilos de tipografía, tamaño, color y opacidad de textos
  const metaWrapper = document.getElementById('overlay-metadata-wrapper');
  if (metaWrapper) {
    // Tipo de letra
    let fontFamilyCss = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    if (state.config.fontFamily === 'monospace') {
      fontFamilyCss = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';
    } else if (state.config.fontFamily === 'condensed') {
      fontFamilyCss = 'Impact, "Arial Narrow", "Trebuchet MS", sans-serif';
    } else if (state.config.fontFamily === 'serif') {
      fontFamilyCss = 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif';
    }
    metaWrapper.style.fontFamily = fontFamilyCss;

    // Tamaño de fuente
    let fontSizeCss = '11px';
    if (state.config.fontSize === 'small') {
      fontSizeCss = '9.5px';
    } else if (state.config.fontSize === 'large') {
      fontSizeCss = '12.5px';
    }
    metaWrapper.style.fontSize = fontSizeCss;

    // Opacidad de texto
    const textOp = state.config.textOpacity !== undefined ? state.config.textOpacity : 1.0;
    metaWrapper.style.opacity = textOp;

    // COLOR UNIFICADO DE TODOS LOS TEXTOS DEL RÓTULO (POR DEFECTO BLANCO #FFFFFF)
    // Incluye: proyecto, ubicación, icono de ubicación, coordenadas, fecha y nota de referencia
    const customColor = state.config.textColor || '#FFFFFF';
    metaWrapper.style.color = customColor;

    const textElementsToColor = [
      'overlay-project',
      'overlay-location-box',
      'overlay-location-icon',
      'overlay-location-text',
      'overlay-datetime',
      'overlay-coords',
      'overlay-note'
    ];
    textElementsToColor.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.style.color = customColor;
      }
    });
  }

  // Identificación de Municipio y Departamento
  const locBox = document.getElementById('overlay-location-box');
  const locText = document.getElementById('overlay-location-text');
  if (locBox && locText) {
    if (state.config.showLocation) {
      locBox.classList.remove('hidden');
      const mun = state.config.municipality || 'Medellín';
      const dep = state.config.department || 'Antioquia';
      locText.textContent = `${mun}, ${dep}`;
    } else {
      locBox.classList.add('hidden');
    }
  }

  // Fecha formateada
  const dateElem = document.getElementById('overlay-datetime');
  if (dateElem) {
    if (state.config.showDate) {
      dateElem.classList.remove('hidden');
      dateElem.textContent = getFormattedDateTime(state.config.dateFormat);
    } else {
      dateElem.classList.add('hidden');
    }
  }

  // Coordenadas formateadas (CTM12, EPSG:3116, UTM, etc.)
  const coordsElem = document.getElementById('overlay-coords');
  if (coordsElem) {
    if (state.config.showGps) {
      coordsElem.classList.remove('hidden');
      coordsElem.textContent = getFormattedCoordinates(state.config.gpsFormat);
    } else {
      coordsElem.classList.add('hidden');
    }
  }

  // Mini Mapa y escala/zoom con Soporte Dual (Canvas Procedural Inmediato + Tile Cartográfico Online)
  const mapBox = document.getElementById('overlay-minimap-box');
  const minimapCanvas = document.getElementById('overlay-minimap-canvas');
  const mapImg = document.getElementById('overlay-map-img');
  const zoomTag = document.getElementById('overlay-zoom-tag');
  if (mapBox) {
    if (state.config.showMap) {
      mapBox.classList.remove('hidden');
      const currentZoom = state.config.mapZoom || 16;
      if (zoomTag) zoomTag.textContent = `Z${currentZoom}`;
      const lat = state.config.lat !== undefined ? state.config.lat : 6.2442;
      const lon = state.config.lon !== undefined ? state.config.lon : -75.5812;

      // 1. Siempre renderizar inmediatamente el canvas vectorial (100% autónomo y offline)
      if (minimapCanvas) {
        drawProceduralMiniMap(minimapCanvas, lat, lon, currentZoom);
      }

      // 2. Si hay conexión online, intentar cargar tile cartográfico sin bloquear
      if (mapImg) {
        const tileUrl = getOsmTileUrl(lat, lon, currentZoom);
        mapImg.onload = () => {
          mapImg.classList.remove('hidden');
        };
        mapImg.onerror = () => {
          mapImg.classList.add('hidden');
        };
        if (navigator.onLine) {
          mapImg.src = tileUrl;
        } else {
          mapImg.classList.add('hidden');
        }
      }
    } else {
      mapBox.classList.add('hidden');
    }
  }

  // Proyecto y Nota
  const projElem = document.getElementById('overlay-project');
  if (projElem) {
    projElem.textContent = state.currentProject.name.toUpperCase();
  }
  const noteElem = document.getElementById('overlay-note');
  if (noteElem) {
    noteElem.textContent = `"${state.config.activeNote}"`;
  }

  // LOGO EN TIEMPO REAL CON GARANTÍA ANTI-SOLAPAMIENTO Y PERSISTENCIA OFFLINE
  const showLogo = !!state.config.showLogo;
  const logoUrl = state.config.logoUrl || DEFAULT_LOGO_DATA_URL;
  const logoPos = state.config.logoPosition || 'top-right';
  const logoSize = Number(state.config.logoSize) || 44;
  const logoOpacity = state.config.logoOpacity !== undefined ? Number(state.config.logoOpacity) : 0.9;

  // Actualizar imagen y estilos en todas las instancias del logo
  if (floatingImg) {
    floatingImg.src = logoUrl;
    floatingImg.style.maxHeight = `${logoSize}px`;
    floatingImg.style.opacity = logoOpacity;
  }
  if (leftImg) {
    leftImg.src = logoUrl;
    leftImg.style.maxHeight = `${Math.min(logoSize, 44)}px`;
    leftImg.style.opacity = logoOpacity;
  }
  if (rightImg) {
    rightImg.src = logoUrl;
    rightImg.style.maxHeight = `${Math.min(logoSize, 44)}px`;
    rightImg.style.opacity = logoOpacity;
  }

  // Ocultar todas las instancias inicialmente
  if (floatingBox) floatingBox.classList.add('hidden');
  if (bannerLogoLeft) bannerLogoLeft.classList.add('hidden');
  if (bannerLogoRight) bannerLogoRight.classList.add('hidden');

  if (showLogo) {
    if (logoPos === 'banner-left') {
      if (bannerLogoLeft) bannerLogoLeft.classList.remove('hidden');
    } else if (logoPos === 'banner-right') {
      if (bannerLogoRight) bannerLogoRight.classList.remove('hidden');
    } else {
      // Posición flotante fuera del cintillo de datos (top-left, top-right, top-center, bottom-right)
      if (floatingBox) {
        floatingBox.classList.remove('hidden');
        floatingBox.className = 'absolute z-20 pointer-events-none transition-all';
        if (logoPos === 'top-left') {
          floatingBox.classList.add('top-14', 'left-3');
        } else if (logoPos === 'top-center') {
          floatingBox.classList.add('top-14', 'left-1/2', '-translate-x-1/2');
        } else if (logoPos === 'bottom-right') {
          floatingBox.classList.add('bottom-28', 'right-3');
        } else {
          // default top-right
          floatingBox.classList.add('top-14', 'right-3');
        }
      }
    }
  }

  // Actualizar miniatura del logo en el panel de configuración
  const cfgPreview = document.getElementById('cfg-logo-preview');
  if (cfgPreview) {
    cfgPreview.src = logoUrl;
    cfgPreview.style.opacity = logoOpacity;
  }
}

// ==========================================
// GEODESIA, CARTOGRAFÍA Y PROYECCIONES OFICIALES DE COLOMBIA
// CTM12 (EPSG:9377) Y MAGNA-SIRGAS BOGOTÁ (EPSG:3116)
// ==========================================

/**
 * Proyección Gauss-Krüger / Transverse Mercator exacta sobre elipsoide GRS80 (MAGNA-SIRGAS)
 */
function latLonToTransverseMercator(latDeg, lonDeg, lat0Deg, lon0Deg, k0, x0, y0) {
  const a = 6378137.0; // Semieje mayor GRS80 (metros)
  const f = 1 / 298.257222101; // Achatamiento GRS80
  const e2 = 2 * f - f * f; // Primera excentricidad al cuadrado
  const ep2 = e2 / (1 - e2); // Segunda excentricidad al cuadrado

  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const lat0 = (lat0Deg * Math.PI) / 180;
  const lon0 = (lon0Deg * Math.PI) / 180;

  const dLon = lon - lon0;

  const mCalc = (phi) => {
    const A = a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * Math.pow(e2, 3)) / 256);
    const B = a * ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * Math.pow(e2, 3)) / 1024);
    const C = a * ((15 * e2 * e2) / 256 + (45 * Math.pow(e2, 3)) / 1024);
    const D = a * ((35 * Math.pow(e2, 3)) / 3072);
    return A * phi - B * Math.sin(2 * phi) + C * Math.sin(4 * phi) - D * Math.sin(6 * phi);
  };

  const M = mCalc(lat);
  const M0 = mCalc(lat0);

  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const tanLat = Math.tan(lat);

  const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  const T = tanLat * tanLat;
  const C = ep2 * cosLat * cosLat;
  const A = dLon * cosLat;

  // Coordenada Este (X)
  const easting = x0 + k0 * N * (
    A +
    ((1 - T + C) * Math.pow(A, 3)) / 6 +
    ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * Math.pow(A, 5)) / 120
  );

  // Coordenada Norte (Y)
  const northing = y0 + k0 * (
    (M - M0) +
    N * tanLat * (
      (A * A) / 2 +
      ((5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4)) / 24 +
      ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * Math.pow(A, 6)) / 720
    )
  );

  return { easting, northing };
}

function getColombiaCTM12Coords(lat, lon) {
  // MAGNA-SIRGAS CTM12 Origen Nacional Único (EPSG:9377)
  // Lat0 = 4.0° N, Lon0 = -73.0° W, k0 = 0.9992, Falso Este = 5.000.000 m, Falso Norte = 2.000.000 m
  return latLonToTransverseMercator(lat, lon, 4.0, -73.0, 0.9992, 5000000.0, 2000000.0);
}

function getColombiaEPSG3116Coords(lat, lon) {
  // MAGNA-SIRGAS Colombia Bogotá zone (EPSG:3116)
  // Lat0 = 4°35'46.3215" N, Lon0 = -74°04'39.0285" W, k0 = 1.0, Falso Este = 1.000.000 m, Falso Norte = 1.000.000 m
  const lat0 = 4 + 35 / 60 + 46.3215 / 3600;
  const lon0 = -(74 + 4 / 60 + 39.0285 / 3600);
  return latLonToTransverseMercator(lat, lon, lat0, lon0, 1.0, 1000000.0, 1000000.0);
}

// BASE DE DATOS GEOGRÁFICA OFFLINE DE MUNICIPIOS Y DEPARTAMENTOS DE COLOMBIA
const COLOMBIA_GEO_DB = [
  // Cundinamarca & Bogotá
  { mun: 'Bogotá D.C.', dep: 'Bogotá D.C.', lat: 4.7110, lon: -74.0721 },
  { mun: 'Soacha', dep: 'Cundinamarca', lat: 4.5800, lon: -74.2167 },
  { mun: 'Chía', dep: 'Cundinamarca', lat: 4.8633, lon: -74.0544 },
  { mun: 'Zipaquirá', dep: 'Cundinamarca', lat: 5.0267, lon: -74.0042 },
  { mun: 'Facatativá', dep: 'Cundinamarca', lat: 4.8136, lon: -74.3542 },
  { mun: 'Girardot', dep: 'Cundinamarca', lat: 4.3014, lon: -74.8058 },
  { mun: 'Fusagasugá', dep: 'Cundinamarca', lat: 4.3369, lon: -74.3639 },
  { mun: 'Mosquera', dep: 'Cundinamarca', lat: 4.7058, lon: -74.2303 },
  { mun: 'Madrid', dep: 'Cundinamarca', lat: 4.7325, lon: -74.2642 },
  { mun: 'Funza', dep: 'Cundinamarca', lat: 4.7161, lon: -74.2122 },
  { mun: 'Cota', dep: 'Cundinamarca', lat: 4.8106, lon: -74.1017 },
  { mun: 'Cajicá', dep: 'Cundinamarca', lat: 4.9189, lon: -74.0278 },

  // Antioquia
  { mun: 'Medellín', dep: 'Antioquia', lat: 6.2442, lon: -75.5812 },
  { mun: 'Bello', dep: 'Antioquia', lat: 6.3373, lon: -75.5579 },
  { mun: 'Itagüí', dep: 'Antioquia', lat: 6.1846, lon: -75.5991 },
  { mun: 'Envigado', dep: 'Antioquia', lat: 6.1759, lon: -75.5917 },
  { mun: 'Sabaneta', dep: 'Antioquia', lat: 6.1517, lon: -75.6164 },
  { mun: 'Rionegro', dep: 'Antioquia', lat: 6.1552, lon: -75.3736 },
  { mun: 'Apartadó', dep: 'Antioquia', lat: 7.8828, lon: -76.6264 },
  { mun: 'Turbo', dep: 'Antioquia', lat: 8.0931, lon: -76.7289 },
  { mun: 'Caucasia', dep: 'Antioquia', lat: 7.9867, lon: -75.1936 },
  { mun: 'Guarne', dep: 'Antioquia', lat: 6.2803, lon: -75.4431 },
  { mun: 'Marinilla', dep: 'Antioquia', lat: 6.1753, lon: -75.3378 },

  // Valle del Cauca
  { mun: 'Cali', dep: 'Valle del Cauca', lat: 3.4516, lon: -76.5320 },
  { mun: 'Palmira', dep: 'Valle del Cauca', lat: 3.5394, lon: -76.3036 },
  { mun: 'Buenaventura', dep: 'Valle del Cauca', lat: 3.8801, lon: -77.0312 },
  { mun: 'Tuluá', dep: 'Valle del Cauca', lat: 4.0847, lon: -76.1954 },
  { mun: 'Buga', dep: 'Valle del Cauca', lat: 3.9009, lon: -76.2978 },
  { mun: 'Cartago', dep: 'Valle del Cauca', lat: 4.7464, lon: -75.9117 },
  { mun: 'Yumbo', dep: 'Valle del Cauca', lat: 3.5828, lon: -76.4958 },
  { mun: 'Jamundí', dep: 'Valle del Cauca', lat: 3.2608, lon: -76.5414 },

  // Atlántico
  { mun: 'Barranquilla', dep: 'Atlántico', lat: 10.9685, lon: -74.7813 },
  { mun: 'Soledad', dep: 'Atlántico', lat: 10.9184, lon: -74.7646 },
  { mun: 'Malambo', dep: 'Atlántico', lat: 10.8594, lon: -74.7739 },
  { mun: 'Sabanalarga', dep: 'Atlántico', lat: 10.6328, lon: -74.9206 },
  { mun: 'Puerto Colombia', dep: 'Atlántico', lat: 10.9878, lon: -74.9547 },

  // Santander
  { mun: 'Bucaramanga', dep: 'Santander', lat: 7.1254, lon: -73.1198 },
  { mun: 'Floridablanca', dep: 'Santander', lat: 7.0622, lon: -73.0864 },
  { mun: 'Girón', dep: 'Santander', lat: 7.0682, lon: -73.1698 },
  { mun: 'Piedecuesta', dep: 'Santander', lat: 6.9886, lon: -73.0494 },
  { mun: 'Barrancabermeja', dep: 'Santander', lat: 7.0653, lon: -73.8547 },
  { mun: 'San Gil', dep: 'Santander', lat: 6.5564, lon: -73.1331 },

  // Bolívar
  { mun: 'Cartagena de Indias', dep: 'Bolívar', lat: 10.3910, lon: -75.4794 },
  { mun: 'Magangué', dep: 'Bolívar', lat: 9.2428, lon: -74.7547 },
  { mun: 'Turbaco', dep: 'Bolívar', lat: 10.3308, lon: -75.4114 },
  { mun: 'Arjona', dep: 'Bolívar', lat: 10.2583, lon: -75.3444 },

  // Norte de Santander
  { mun: 'Cúcuta', dep: 'Norte de Santander', lat: 7.8939, lon: -72.5078 },
  { mun: 'Villa del Rosario', dep: 'Norte de Santander', lat: 7.8339, lon: -72.4742 },
  { mun: 'Los Patios', dep: 'Norte de Santander', lat: 7.8469, lon: -72.5078 },
  { mun: 'Ocaña', dep: 'Norte de Santander', lat: 8.2386, lon: -73.3547 },

  // Eje Cafetero (Risaralda, Caldas, Quindío)
  { mun: 'Pereira', dep: 'Risaralda', lat: 4.8133, lon: -75.6961 },
  { mun: 'Dosquebradas', dep: 'Risaralda', lat: 4.8364, lon: -75.6797 },
  { mun: 'Santa Rosa de Cabal', dep: 'Risaralda', lat: 4.8697, lon: -75.6214 },
  { mun: 'Manizales', dep: 'Caldas', lat: 5.0689, lon: -75.5174 },
  { mun: 'Villamaría', dep: 'Caldas', lat: 5.0447, lon: -75.5161 },
  { mun: 'Chinchiná', dep: 'Caldas', lat: 4.9819, lon: -75.6042 },
  { mun: 'Armenia', dep: 'Quindío', lat: 4.5339, lon: -75.6811 },
  { mun: 'Calarcá', dep: 'Quindío', lat: 4.5297, lon: -75.6417 },
  { mun: 'Montenegro', dep: 'Quindío', lat: 4.5661, lon: -75.7503 },

  // Tolima y Huila
  { mun: 'Ibagué', dep: 'Tolima', lat: 4.4389, lon: -75.2322 },
  { mun: 'Espinal', dep: 'Tolima', lat: 4.1492, lon: -74.8844 },
  { mun: 'Melgar', dep: 'Tolima', lat: 4.2047, lon: -74.6408 },
  { mun: 'Neiva', dep: 'Huila', lat: 2.9273, lon: -75.2819 },
  { mun: 'Pitalito', dep: 'Huila', lat: 1.8539, lon: -76.0494 },
  { mun: 'Garzón', dep: 'Huila', lat: 2.1958, lon: -75.6278 },

  // Meta, Casanare, Boyacá
  { mun: 'Villavicencio', dep: 'Meta', lat: 4.1420, lon: -73.6266 },
  { mun: 'Acacías', dep: 'Meta', lat: 3.9875, lon: -73.7628 },
  { mun: 'Granada', dep: 'Meta', lat: 3.5461, lon: -73.7069 },
  { mun: 'Yopal', dep: 'Casanare', lat: 5.3378, lon: -72.3958 },
  { mun: 'Aguazul', dep: 'Casanare', lat: 5.1728, lon: -72.5472 },
  { mun: 'Tunja', dep: 'Boyacá', lat: 5.5353, lon: -73.3678 },
  { mun: 'Duitama', dep: 'Boyacá', lat: 5.8267, lon: -73.0336 },
  { mun: 'Sogamoso', dep: 'Boyacá', lat: 5.7144, lon: -72.9339 },
  { mun: 'Chiquinquirá', dep: 'Boyacá', lat: 5.6186, lon: -73.8164 },

  // Magdalena, Cesar, Guajira
  { mun: 'Santa Marta', dep: 'Magdalena', lat: 11.2408, lon: -74.1990 },
  { mun: 'Ciénaga', dep: 'Magdalena', lat: 11.0069, lon: -74.2494 },
  { mun: 'Valledupar', dep: 'Cesar', lat: 10.4631, lon: -73.2532 },
  { mun: 'Aguachica', dep: 'Cesar', lat: 8.3089, lon: -73.6144 },
  { mun: 'Riohacha', dep: 'La Guajira', lat: 11.5444, lon: -72.9072 },
  { mun: 'Maicao', dep: 'La Guajira', lat: 11.3778, lon: -72.2422 },

  // Córdoba y Sucre
  { mun: 'Montería', dep: 'Córdoba', lat: 8.7479, lon: -75.8814 },
  { mun: 'Cereté', dep: 'Córdoba', lat: 8.8847, lon: -75.7917 },
  { mun: 'Lorica', dep: 'Córdoba', lat: 9.2392, lon: -75.8139 },
  { mun: 'Sincelejo', dep: 'Sucre', lat: 9.3047, lon: -75.3978 },
  { mun: 'Corozal', dep: 'Sucre', lat: 9.3167, lon: -75.2936 },

  // Nariño, Cauca, Chocó
  { mun: 'Pasto', dep: 'Nariño', lat: 1.2136, lon: -77.2811 },
  { mun: 'Ipiales', dep: 'Nariño', lat: 0.8286, lon: -77.6389 },
  { mun: 'Tumaco', dep: 'Nariño', lat: 1.7986, lon: -78.8156 },
  { mun: 'Popayán', dep: 'Cauca', lat: 2.4448, lon: -76.6147 },
  { mun: 'Santander de Quilichao', dep: 'Cauca', lat: 3.0094, lon: -76.4847 },
  { mun: 'Quibdó', dep: 'Chocó', lat: 5.6919, lon: -76.6583 },

  // Amazonía y Orinoquía
  { mun: 'Florencia', dep: 'Caquetá', lat: 1.6144, lon: -75.6064 },
  { mun: 'Mocoa', dep: 'Putumayo', lat: 1.1528, lon: -76.6522 },
  { mun: 'Puerto Asís', dep: 'Putumayo', lat: 0.5133, lon: -76.5008 },
  { mun: 'San José del Guaviare', dep: 'Guaviare', lat: 2.5728, lon: -72.6458 },
  { mun: 'Arauca', dep: 'Arauca', lat: 7.0847, lon: -70.7592 },
  { mun: 'Puerto Carreño', dep: 'Vichada', lat: 6.1892, lon: -67.4858 },
  { mun: 'Inírida', dep: 'Guainía', lat: 3.8653, lon: -67.9239 },
  { mun: 'Mitú', dep: 'Vaupés', lat: 1.2583, lon: -70.2333 },
  { mun: 'Leticia', dep: 'Amazonas', lat: -4.2153, lon: -69.9406 },
  { mun: 'San Andrés', dep: 'San Andrés y Providencia', lat: 12.5847, lon: -81.7006 }
];

function getNearestColombianLocation(lat, lon) {
  if (lat === undefined || lon === undefined || isNaN(lat) || isNaN(lon)) {
    return { municipality: 'Medellín', department: 'Antioquia' };
  }
  let minDistance = Infinity;
  let nearest = COLOMBIA_GEO_DB[0];

  for (let i = 0; i < COLOMBIA_GEO_DB.length; i++) {
    const item = COLOMBIA_GEO_DB[i];
    const dLat = (lat - item.lat);
    const dLon = (lon - item.lon) * Math.cos((lat * Math.PI) / 180);
    const distSq = dLat * dLat + dLon * dLon;
    if (distSq < minDistance) {
      minDistance = distSq;
      nearest = item;
    }
  }
  return { municipality: nearest.mun, department: nearest.dep };
}

function getOsmTileUrl(lat, lon, zoom = 16) {
  const z = Math.max(0, Math.min(19, parseInt(zoom, 10) || 16));
  const latRad = (lat * Math.PI) / 180;
  const n = Math.pow(2, z);
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  // Servidor CartoDB Voyager con soporte de CORS universal para Web, Móvil y PWA
  return `https://basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`;
}

function detectCurrentGpsLocation() {
  if (!navigator.geolocation) {
    showToast('Geolocalización no soportada por el dispositivo', 'ph-warning text-amber-400');
    return;
  }
  showToast('Detectando coordenadas satelitales GPS...', 'ph-crosshair text-blue-400 animate-pulse');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      state.config.lat = latitude;
      state.config.lon = longitude;

      const loc = getNearestColombianLocation(latitude, longitude);
      state.config.municipality = loc.municipality;
      state.config.department = loc.department;

      const deptInp = document.getElementById('cfg-department-input');
      if (deptInp) deptInp.value = loc.department;
      const munInp = document.getElementById('cfg-municipality-input');
      if (munInp) munInp.value = loc.municipality;

      const accTag = document.getElementById('gps-accuracy-tag');
      if (accTag) {
        accTag.textContent = `GPS: ±${Math.round(accuracy || 3)}m (${loc.municipality})`;
      }

      updateLiveWatermarkOverlay();
      scheduleOfflineSave();
      showToast(`Ubicación detectada: ${loc.municipality}, ${loc.department} (±${Math.round(accuracy || 3)}m)`, 'ph-check-circle text-emerald-400');
    },
    (err) => {
      console.warn('Error en geolocation:', err);
      showToast('Sin señal GPS en vivo, usando coordenadas configuradas', 'ph-info text-blue-400');
      const loc = getNearestColombianLocation(state.config.lat, state.config.lon);
      if (!state.config.department) state.config.department = loc.department;
      if (!state.config.municipality) state.config.municipality = loc.municipality;
      updateLiveWatermarkOverlay();
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
  );
}

function initPassiveGeolocation() {
  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (pos && pos.coords) {
          state.config.lat = pos.coords.latitude;
          state.config.lon = pos.coords.longitude;
          const accTag = document.getElementById('gps-accuracy-tag');
          if (accTag) {
            accTag.textContent = `GPS: ±${Math.round(pos.coords.accuracy || 3)}m`;
          }
          updateLiveWatermarkOverlay();
        }
      },
      () => {},
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
    );
  }
}

function getFormattedDateTime(format) {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = now.getFullYear();
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');

  switch (format) {
    case 'DD/MM/YYYY_12H':
      const h12 = (now.getHours() % 12) || 12;
      const ampm = now.getHours() >= 12 ? 'PM' : 'AM';
      return `FECHA: ${d}/${m}/${y} ${h12}:${min}:${s} ${ampm}`;
    case 'ISO_8601':
      return `FECHA: ${y}-${m}-${d} ${h}:${min}:${s}`;
    case 'VERBAL':
      const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      return `FECHA: ${d} de ${months[now.getMonth()]} de ${y} ${h}:${min}`;
    case 'DD/MM/YYYY_24H':
    default:
      return `FECHA: ${d}/${m}/${y} ${h}:${min}:${s}`;
  }
}

function getFormattedCoordinates(format) {
  const lat = state.config.lat !== undefined ? state.config.lat : 6.2442;
  const lon = state.config.lon !== undefined ? state.config.lon : -75.5812;

  switch (format) {
    case 'CTM12': {
      const { easting, northing } = getColombiaCTM12Coords(lat, lon);
      return `CTM12: N ${Math.round(northing).toLocaleString('es-CO')} m, E ${Math.round(easting).toLocaleString('es-CO')} m`;
    }
    case 'EPSG3116': {
      const { easting, northing } = getColombiaEPSG3116Coords(lat, lon);
      return `MAGNA Bogotá (3116): N ${Math.round(northing).toLocaleString('es-CO')} m, E ${Math.round(easting).toLocaleString('es-CO')} m`;
    }
    case 'DECIMAL': {
      return `LAT: ${lat.toFixed(6)}°, LON: ${lon.toFixed(6)}° (±3m)`;
    }
    case 'DMS': {
      const latAbs = Math.abs(lat);
      const latDeg = Math.floor(latAbs);
      const latMin = Math.floor((latAbs - latDeg) * 60);
      const latSec = ((latAbs - latDeg - latMin / 60) * 3600).toFixed(1);
      const latDir = lat >= 0 ? 'N' : 'S';

      const lonAbs = Math.abs(lon);
      const lonDeg = Math.floor(lonAbs);
      const lonMin = Math.floor((lonAbs - lonDeg) * 60);
      const lonSec = ((lonAbs - lonDeg - lonMin / 60) * 3600).toFixed(1);
      const lonDir = lon >= 0 ? 'E' : 'W';

      return `COORD: ${String(latDeg).padStart(2, '0')}°${String(latMin).padStart(2, '0')}'${latSec}"${latDir} ${String(lonDeg).padStart(2, '0')}°${String(lonMin).padStart(2, '0')}'${lonSec}"${lonDir}`;
    }
    case 'DDM': {
      const latAbs = Math.abs(lat);
      const latDeg = Math.floor(latAbs);
      const latMin = ((latAbs - latDeg) * 60).toFixed(3);
      const latDir = lat >= 0 ? 'N' : 'S';

      const lonAbs = Math.abs(lon);
      const lonDeg = Math.floor(lonAbs);
      const lonMin = ((lonAbs - lonDeg) * 60).toFixed(3);
      const lonDir = lon >= 0 ? 'E' : 'W';

      return `COORD: ${String(latDeg).padStart(2, '0')}°${latMin}'${latDir} ${String(lonDeg).padStart(2, '0')}°${lonMin}'${lonDir}`;
    }
    case 'ADDRESS': {
      const mun = state.config.municipality || 'Medellín';
      const dep = state.config.department || 'Antioquia';
      return `DIR: Sector Urbano, ${mun}, ${dep}`;
    }
    case 'UTM':
    default: {
      const zone = 18;
      const lon0 = -75.0;
      const { easting, northing } = latLonToTransverseMercator(lat, lon, 0.0, lon0, 0.9996, 500000.0, 0.0);
      return `UTM: ${zone}N E ${Math.round(easting).toLocaleString('es-CO')} N ${Math.round(northing).toLocaleString('es-CO')} (±3m)`;
    }
  }
}

function takePhoto() {
  // Captura REAL del cuadro actual de la cámara (antes se usaba una foto de muestra aleatoria)
  const videoElem = document.getElementById('camera-stream');
  const hasLiveVideo = videoElem && videoElem.srcObject && videoElem.videoWidth > 0 && !videoElem.classList.contains('hidden');
  if (!hasLiveVideo) {
    showToast('Cámara no disponible en este dispositivo o sin permiso. Usa "Galería" para cargar fotos.', 'ph-camera-slash text-amber-400');
    return;
  }
  if (navigator.vibrate) navigator.vibrate(50);

  const frame = document.createElement('canvas');
  frame.width = videoElem.videoWidth;
  frame.height = videoElem.videoHeight;
  frame.getContext('2d').drawImage(videoElem, 0, 0, frame.width, frame.height);
  const chosenUrl = frame.toDataURL('image/jpeg', 0.92);

  const mun = state.config.municipality || 'Medellín';
  const dep = state.config.department || 'Antioquia';

  const newPhoto = {
    id: newPhotoId(),
    title: `Foto #${state.photos.length + 1}`,
    note: state.config.activeNote,
    url: chosenUrl,
    rotation: 0,
    scale: 1.0,
    fitMode: 'fit',
    offsetX: 0,
    offsetY: 0,
    isPreExisting: false,
    coords: getFormattedCoordinates(state.config.gpsFormat),
    department: dep,
    municipality: mun,
    showLocation: !!state.config.showLocation,
    gpsFormat: state.config.gpsFormat,
    mapZoom: state.config.mapZoom || 16,
    watermarkConfig: { ...state.config },
    source: 'camera',
    isUserUploaded: false,
    hasWatermark: state.config.masterToggle, // SÓLO si el usuario lo activó en la cámara
    capturedAt: new Date().toISOString(),
    lat: state.config.lat,
    lon: state.config.lon
  };

  // Metadatos de la captura en vivo: vienen directo de los sensores (no hace falta OCR)
  newPhoto.meta = {
    capturedAt: newPhoto.capturedAt.slice(0, 19),
    lat: state.config.lat, lon: state.config.lon,
    municipio: mun, departamento: dep, via: null,
    sources: { date: 'sensor', gps: 'sensor', place: 'gps' },
    confidence: { date: 1, gps: 0.9, place: 0.7, overall: 0.87 },
    checks: {}, engine: 'sensores del dispositivo', extractedAt: new Date().toISOString()
  };
  state.photos.push(newPhoto);
  const canvasCount = document.getElementById('canvas-badge-count');
  if (canvasCount) canvasCount.textContent = state.photos.length;
  if (typeof updateDirectDownloadView === 'function') updateDirectDownloadView();
  scheduleOfflineSave();
  
  showToast(`Fotografía guardada con éxito (${newPhoto.title}) - ${mun}, ${dep}`, 'ph-camera text-blue-400');
}

// Identificador único de foto (evita choques tras eliminar y volver a cargar)
function newPhotoId() {
  return `FOTO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
window.newPhotoId = newPhotoId;

// Helper para convertir DataURL a Uint8Array binario nativo sin alterar píxeles ni metadatos
function dataUrlToUint8Array(dataUrl) {
  try {
    const parts = dataUrl.split(',');
    const base64 = parts[1] || parts[0];
    const binaryStr = atob(base64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    console.warn('Error al convertir dataUrl a bytes:', e);
    return null;
  }
}

function handleGalleryImport(files) {
  if (!files || files.length === 0) return;

  // Si sólo existían las fotos demo iniciales de Unsplash o fotos demo predeterminadas, reemplazarlas limpiamente por las del usuario
  const isOnlyInitialDemo = state.photos.every(p => p.url && (p.url.includes('unsplash.com') || !p.isUserUploaded));
  if (isOnlyInitialDemo) {
    state.photos = [];
    state.currentPage = 1;
  }

  const fileList = Array.from(files);
  let processedCount = 0;

  fileList.forEach((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      // REGLA FUNDAMENTAL: Guardar el archivo ORIGINAL TAL CUAL sin reorientación automática
      const newPhoto = {
        id: newPhotoId(),
        title: `Foto #${state.photos.length + 1}`,
        note: '',
        fileName: file.name,
        url: e.target.result, // ARCHIVO ORIGINAL SIN MANIPULACIÓN NI REORIENTACIÓN
        rotation: 0,          // Rotación inicial en 0 (sólo el usuario la rota)
        scale: 1.0,
        fitMode: 'fit',
        offsetX: 0,
        offsetY: 0,
        isPreExisting: false,
        coords: '',
        source: 'gallery',
        isUserUploaded: true,
        hasWatermark: false
      };

      state.photos.push(newPhoto);
      processedCount++;

      if (processedCount === fileList.length) {
        const countBadge = document.getElementById('canvas-badge-count');
        if (countBadge) countBadge.textContent = state.photos.length;

        state.currentPage = 1;
        updateCanvasGrid();
        renderPagination();
        if (typeof updateDirectDownloadView === 'function') updateDirectDownloadView();
        scheduleOfflineSave();

        showToast(`${fileList.length} fotos importadas tal cual fueron cargadas`, 'ph-image text-emerald-400');
        switchView('view-canvas');
        // IA: extraer fecha, coordenadas y lugar de las fotos nuevas (OCR del sello + EXIF)
        if (window.AIExtract && state.config.autoExtract !== false) AIExtract.enqueue(state.photos);
      }
    };
    reader.readAsDataURL(file);
  });
}
window.handleGalleryImport = handleGalleryImport;

// ==========================================
// 3. MÓDULO DE FORMATOS E INTELIGENCIA ARTIFICIAL
// ==========================================
function triggerTemplateFileInput() {
  const fileInput = document.getElementById('template-file-input');
  if (fileInput) {
    fileInput.value = ''; // Permite volver a seleccionar el mismo archivo si se desea
    fileInput.click();
  }
}
window.triggerTemplateFileInput = triggerTemplateFileInput;

function handlePresetFormatChange(presetKey) {
  if (!presetKey) return;
  switch (presetKey) {
    case 'word-interventoria':
      simulateAiScanning('Formato_Interventoria_4Fotos.docx', 'word', '540 KB');
      break;
    case 'excel-inspeccion':
      simulateAiScanning('Inspeccion_Obra_6Fotos.xlsx', 'excel', '320 KB');
      break;
    case 'word-ambiental':
      simulateAiScanning('Ficha_Gestion_Ambiental_2Fotos.docx', 'word', '410 KB');
      break;
    case 'excel-electrico':
      simulateAiScanning('Ficha_Tecnica_Redes_4Fotos.xlsx', 'excel', '285 KB');
      break;
  }
}
window.handlePresetFormatChange = handlePresetFormatChange;

function confirmUseTemplate() {
  showToast(`Plantilla "${state.template.name}" asignada al proyecto`, 'ph-check-circle text-indigo-400');
  const baseName = state.template.name ? state.template.name.substring(0, state.template.name.lastIndexOf('.')) : 'Formato';
  const ext = getActiveExtension();
  const exportInput = document.getElementById('export-filename-input');
  if (exportInput) {
    exportInput.value = `${state.currentProject.code}_${baseName}_DILIGENCIADO.${ext}`;
  }
  const headerPill = document.getElementById('header-template-name');
  if (headerPill) {
    headerPill.textContent = getActiveFormatType() === 'word' ? `Word (${state.photos.length} fotos)` : `Excel (${state.photos.length} fotos)`;
  }
  state.currentPage = 1;
  const countBadge = document.getElementById('canvas-badge-count');
  if (countBadge) countBadge.textContent = state.photos.length;
  updateCanvasGrid();
  renderPagination();
  if (typeof updateDirectDownloadView === 'function') updateDirectDownloadView();
  if (typeof setModalExportFormat === 'function') setModalExportFormat(ext, true);
  switchView('view-canvas');
}
window.confirmUseTemplate = confirmUseTemplate;

function initTemplateModule() {
  const dropzone = document.getElementById('dropzone-template');
  const fileInput = document.getElementById('template-file-input');

  // Manejar selección de archivo nativa (único listener registrado)
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleTemplateFile(e.target.files[0]);
      }
    });
  }

  // Soporte de Arrastrar y Soltar (Drag & Drop) desde Windows
  if (dropzone) {
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('border-blue-400', 'bg-slate-800/80');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('border-blue-400', 'bg-slate-800/80');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-blue-400', 'bg-slate-800/80');
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleTemplateFile(e.dataTransfer.files[0]);
      }
    });
  }

  // Botones de plantillas de muestra
  document.querySelectorAll('.btn-demo-template').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.name;
      const type = btn.dataset.type && btn.dataset.type.startsWith('word') ? 'word' : 'excel';
      simulateAiScanning(name, type, '540 KB');
    });
  });

  // Confirmar y usar formato
  const confirmBtn = document.getElementById('btn-confirm-use-template');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      confirmUseTemplate();
    });
  }
}

let isProcessingTemplateFile = false;
async function handleTemplateFile(file) {
  if (!file) return;
  if (isProcessingTemplateFile) {
    console.warn('Procesamiento de plantilla en curso, ignorando llamada simultánea.');
    return;
  }
  isProcessingTemplateFile = true;
  try {
    const ext = file.name.split('.').pop().toLowerCase();
    const isWord = ext === 'docx' || ext === 'doc';
    const isExcel = ext === 'xlsx' || ext === 'xls';

    if (!isWord && !isExcel) {
      showToast('Por favor selecciona un archivo Word (.docx, .doc) o Excel (.xlsx, .xls)', 'ph-warning text-amber-400');
      return;
    }

    const type = isWord ? 'word' : 'excel';
    const targetExt = isWord ? 'docx' : 'xlsx';
    const sizeKb = (file.size / 1024).toFixed(1) + ' KB';

    // 1. ASIGNACIÓN INMEDIATA Y VINCULACIÓN AL FORMATO DE ORIGEN (WORD O EXCEL)
    state.template.name = file.name;
    state.template.type = type;
    state.template.uploadedFormat = type;
    state.template.hasUserTemplate = true;
    state.template.documentTitle = file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');

    // 2. Sincronizar inmediatamente la salida al formato exacto del archivo subido
    const fileBase = file.name.replace(/\.[^/.]+$/, '');
    const mainExportInput = document.getElementById('export-filename-input');
    if (mainExportInput) {
      mainExportInput.value = `${fileBase}_DILIGENCIADO.${targetExt}`;
    }
    if (typeof updateDirectDownloadView === 'function') updateDirectDownloadView();
    if (typeof setModalExportFormat === 'function') setModalExportFormat(targetExt, true);

    const statusBox = document.getElementById('template-file-status');
    const fileNameElem = document.getElementById('status-file-name');
    const fileSizeElem = document.getElementById('status-file-size');
    const fileIconElem = document.getElementById('status-file-icon');
    const progressBar = document.getElementById('ai-scan-progress-bar');
    const statusText = document.getElementById('ai-scan-status-text');
    const aiCard = document.getElementById('ai-template-card');

    if (statusBox) statusBox.classList.remove('hidden');
    if (aiCard) aiCard.classList.add('hidden');
    if (fileNameElem) fileNameElem.textContent = file.name;
    if (fileSizeElem) fileSizeElem.textContent = sizeKb;

    if (fileIconElem) {
      fileIconElem.className = isWord ? 'ph-bold ph-file-doc text-blue-400 text-lg' : 'ph-bold ph-file-xls text-emerald-400 text-lg';
    }

    if (progressBar) progressBar.style.width = '30%';
    if (statusText) statusText.textContent = 'Paso 1/3: Decodificando estructura del documento OpenXML...';

    // Almacenar el buffer original de la plantilla del usuario para inyección directa
    const arrayBuffer = await file.arrayBuffer();
    state.template.rawBuffer = arrayBuffer;

  let parsed = null;
  if (isWord) {
    parsed = await parseWordDocument(file, arrayBuffer);
  } else {
    parsed = await parseExcelDocument(file, arrayBuffer);
  }

  if (progressBar) progressBar.style.width = '75%';
  if (statusText) statusText.textContent = 'Paso 2/3: Mapeando tablas, celdas de foto y protegiendo membrete/logos...';

  setTimeout(() => {
    if (progressBar) progressBar.style.width = '100%';
    if (statusText) statusText.textContent = 'Paso 3/3: Mapeo de layout y continuidad completado con éxito.';

    state.template.name = file.name;
    state.template.type = type;
    state.template.slotsPerPage = parsed.slotsPerPage || (isWord ? 4 : 6);
    state.template.tablesCount = parsed.tablesCount || 1;
    state.template.documentTitle = parsed.extractedTitle || file.name;
    state.template.validatedPhotoSlots = parsed.validatedPhotoSlots || [];

    // CARGAR FOTOGRAFÍAS PREEXISTENTES O PRESERVAR LAS DE LA MESA
    if (parsed.extractedPhotos && parsed.extractedPhotos.length > 0) {
      state.photos = parsed.extractedPhotos;
      state.currentPage = 1;
      const countBadge = document.getElementById('canvas-badge-count');
      if (countBadge) countBadge.textContent = state.photos.length;
      updateCanvasGrid();
      renderPagination();
      showToast(`¡Se cargaron ${parsed.extractedPhotos.length} fotos preexistentes del formato a la mesa de trabajo!`, 'ph-image text-emerald-400');
    } else {
      // PRESERVAR FOTOGRAFÍAS EXISTENTES DE LA MESA DE TRABAJO (NO BORRAR)
      const countBadge = document.getElementById('canvas-badge-count');
      if (countBadge) countBadge.textContent = state.photos.length;
      updateCanvasGrid();
      renderPagination();
      if (state.photos.length > 0) {
        showToast(`Formato "${file.name}" asignado. Tus ${state.photos.length} fotos en mesa se conservan listas para exportar.`, 'ph-check-circle text-emerald-400');
      }
    }

    if (aiCard) aiCard.classList.remove('hidden');

    const slotsDetected = document.getElementById('ai-slots-detected');
    if (slotsDetected) {
      if (isWord) {
        slotsDetected.textContent = `${state.template.slotsPerPage} Fotos por Página (${parsed.tablesCount || 1} tabla(s) detectada(s))`;
      } else if (parsed.isInvias) {
        slotsDetected.textContent = `Formato Oficial INVIAS (4 Fotos / Página - Celdas A18:T39, U18:AN39, A41:T62, U41:AN62)`;
      } else if (parsed.validatedPhotoSlots && parsed.validatedPhotoSlots.length > 0) {
        slotsDetected.textContent = `${state.template.slotsPerPage} Fotos (${parsed.validatedPhotoSlots.length} rangos de celdas combinadas validados)`;
      } else {
        slotsDetected.textContent = `${state.template.slotsPerPage} Fotos por Página (${parsed.sheetNames ? parsed.sheetNames[0] : 'Cuadrícula Excel'})`;
      }
    }

    // Mostrar sección de validación de celdas múltiples/combinadas
    const multiCellSection = document.getElementById('ai-multicell-section');
    const multiCellBadge = document.getElementById('ai-multicell-count-badge');
    const multiCellList = document.getElementById('ai-multicell-list');
    if (multiCellSection && multiCellList) {
      if (parsed.validatedPhotoSlots && parsed.validatedPhotoSlots.length > 0) {
        multiCellSection.classList.remove('hidden');
        if (multiCellBadge) {
          multiCellBadge.textContent = parsed.isInvias
            ? `${parsed.validatedPhotoSlots.length} slots INVIAS validados (440 celdas c/u)`
            : `${parsed.validatedPhotoSlots.length} slots validados`;
        }
        multiCellList.innerHTML = parsed.validatedPhotoSlots.map(s => `
          <div class="flex items-center justify-between py-1 border-b border-slate-800/80 last:border-0">
            <span class="font-bold text-amber-300">[Slot #${s.slotIndex}] Rango ${s.rangeStr}:</span>
            <span class="text-slate-300">${s.colsSpan} cols × ${s.rowsSpan} filas <span class="text-emerald-400 font-bold">(${s.totalCells} celdas)</span></span>
          </div>
        `).join('');
      } else {
        multiCellSection.classList.add('hidden');
      }
    }

    const prevDetected = document.getElementById('ai-previous-photos');
    if (prevDetected) {
      prevDetected.textContent = parsed.extractedPhotos && parsed.extractedPhotos.length > 0
        ? `Documento: "${parsed.extractedTitle}" | ${parsed.extractedPhotos.length} fotos preexistentes en Mesa`
        : `Documento: "${parsed.extractedTitle}" | ${state.photos.length} fotos en Mesa listas para exportar`;
    }

    // Actualizar esquema de celdas dinámicamente según slots y fotos reales
    const gridPreview = document.getElementById('ai-grid-preview');
    if (gridPreview) {
      if (parsed.validatedPhotoSlots && parsed.validatedPhotoSlots.length > 0) {
        const cols = parsed.validatedPhotoSlots.length <= 4 ? 2 : 3;
        gridPreview.className = `grid grid-cols-${cols} gap-1.5 text-[10px] font-mono`;
        gridPreview.innerHTML = parsed.validatedPhotoSlots.map((s, idx) => {
          const isOccupied = idx < state.photos.length;
          const statusClass = isOccupied ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300';
          const statusText = isOccupied ? 'Foto Lista' : 'Disponible';
          return `
            <div class="p-1.5 rounded ${statusClass} border text-left">
              <div class="font-bold truncate text-[11px]">[Slot #${s.slotIndex}] ${s.rangeStr}</div>
              <div class="text-[9px] text-slate-300 opacity-90">${s.totalCells} celdas (${s.colsSpan}x${s.rowsSpan})</div>
              <div class="text-[9px] font-bold mt-0.5 text-emerald-400">${statusText}</div>
            </div>
          `;
        }).join('');
      } else {
        const totalSlots = state.template.slotsPerPage || (isWord ? 4 : 6);
        const cols = totalSlots <= 4 ? 2 : 3;
        gridPreview.className = `grid grid-cols-${cols} gap-1.5 text-[10px] font-mono`;
        let previewHtml = '';
        for (let i = 0; i < totalSlots; i++) {
          const isOccupied = i < state.photos.length;
          if (isOccupied) {
            previewHtml += `<div class="p-1.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 truncate" title="Foto ${i+1}">[Foto #${i+1}] Lista</div>`;
          } else {
            previewHtml += `<div class="p-1.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 truncate">[Slot #${i+1}] Libre</div>`;
          }
        }
        gridPreview.innerHTML = previewHtml;
      }
    }

    const headerPill = document.getElementById('header-template-name');
    if (headerPill) {
      headerPill.textContent = type === 'word' ? 'Word' : 'Excel';
    }

    if (typeof updateDirectDownloadView === 'function') updateDirectDownloadView();
    if (typeof setModalExportFormat === 'function') setModalExportFormat(targetExt, true);

    showToast(`Formato "${file.name}" reconocido: ${state.photos.length} fotos listas en mesa`, 'ph-brain text-indigo-400');
    scheduleOfflineSave();
  }, 600);
  } finally {
    setTimeout(() => {
      isProcessingTemplateFile = false;
    }, 800);
  }
}
window.handleTemplateFile = handleTemplateFile;

// Helper para extraer rotación nativa OpenXML DrawingML (rot en 60,000avos de grado) o VML
function extractDrawingRotation(xmlString) {
  if (!xmlString) return 0;
  // 1. DrawingML: rot="5400000" -> 90 grados, rot="10800000" -> 180 grados, etc.
  const rotMatch = xmlString.match(/\brot="(-?\d+)"/);
  if (rotMatch) {
    const rawVal = parseInt(rotMatch[1], 10);
    if (!isNaN(rawVal)) {
      const deg = Math.round(rawVal / 60000);
      return ((deg % 360) + 360) % 360;
    }
  }
  // 2. VML style="rotation:90"
  const vmlMatch = xmlString.match(/rotation:\s*(-?\d+)/);
  if (vmlMatch) {
    const deg = parseInt(vmlMatch[1], 10);
    if (!isNaN(deg)) {
      return ((deg % 360) + 360) % 360;
    }
  }
  return 0;
}
window.extractDrawingRotation = extractDrawingRotation;

async function parseWordDocument(file, rawBuffer) {
  try {
    const arrayBuffer = rawBuffer || await file.arrayBuffer();
    if (!window.JSZip) {
      return { success: false, tablesCount: 1, cellsCount: 4, extractedTitle: 'Formato Word', slotsPerPage: 4, extractedPhotos: [] };
    }
    const zip = await window.JSZip.loadAsync(arrayBuffer);
    const docXmlFile = zip.file('word/document.xml');
    if (!docXmlFile) {
      return { success: false, tablesCount: 1, cellsCount: 4, extractedTitle: 'Plantilla Word', slotsPerPage: 4, extractedPhotos: [] };
    }
    const docXmlStr = await docXmlFile.async('text');
    let relsXmlStr = '';
    if (zip.file('word/_rels/document.xml.rels')) {
      relsXmlStr = await zip.file('word/_rels/document.xml.rels').async('text');
    }

    // 1. Identificar logos protegidos en encabezados y pies de página
    const protectedMedia = new Set();
    const relRegex = /<Relationship[^>]+Id="([^"]+)"[^>]+Target="([^"]+)"[^>]*>/g;

    for (const f of Object.keys(zip.files)) {
      if ((f.startsWith('word/_rels/header') || f.startsWith('word/_rels/footer')) && f.endsWith('.rels')) {
        const xml = await zip.file(f).async('text');
        let match;
        while ((match = relRegex.exec(xml)) !== null) {
          let target = match[2];
          if (target.startsWith('../')) target = target.substring(3);
          if (target.startsWith('media/')) target = 'word/' + target;
          else if (!target.startsWith('word/media/')) target = 'word/media/' + target.split('/').pop();
          protectedMedia.add(target);
        }
      }
    }

    // 2. Mapear relaciones de document.xml.rels
    const docRels = {};
    let rMatch;
    while ((rMatch = relRegex.exec(relsXmlStr)) !== null) {
      let target = rMatch[2];
      if (target.startsWith('../')) target = target.substring(3);
      if (!target.startsWith('word/')) {
        if (target.startsWith('media/')) target = 'word/' + target;
        else target = 'word/' + target;
      }
      docRels[rMatch[1]] = target;
    }

    // 3. Inspeccionar tablas, proteger logos de cabecera y extraer fotos preexistentes con su orientación original
    const tblRegex = /<w:tbl[\s\S]*?<\/w:tbl>/g;
    const tables = docXmlStr.match(tblRegex) || [];

    const extractedPhotos = [];

    for (let tIdx = 0; tIdx < tables.length; tIdx++) {
      const tbl = tables[tIdx];
      const rowRegex = /<w:tr[\s\S]*?<\/w:tr>/g;
      const rows = tbl.match(rowRegex) || [];

      for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        const row = rows[rIdx];
        const rowText = row.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const isHeaderRow = (rIdx <= 3) && /REV\.|FORMATO|CÓDIGO|VERSIÓN|FECHA DE ELABORACIÓN|AUTOVÍA|NIT|EMPRESA|CONSORCIO|S\.A\.S|S\.A\.|REGISTRO FOTOGRÁFICO|HOJA \d|PÁGINA/i.test(rowText);

        const drawingRegex = /<w:drawing[\s\S]*?<\/w:drawing>/g;
        const drawings = row.match(drawingRegex) || [];

        for (let dIdx = 0; dIdx < drawings.length; dIdx++) {
          const dw = drawings[dIdx];
          const blipMatch = dw.match(/<a:blip[^>]+r:embed="([^"]+)"/);
          const extentMatch = dw.match(/<wp:extent[^>]+cx="(\d+)"[^>]+cy="(\d+)"/);

          if (blipMatch) {
            const rId = blipMatch[1];
            const target = docRels[rId];
            const cx = extentMatch ? parseInt(extentMatch[1]) : 0;
            const cy = extentMatch ? parseInt(extentMatch[2]) : 0;

            const isLogo = isHeaderRow || protectedMedia.has(target) || (cx < 1800000 && cy < 1200000 && rIdx <= 2);

            if (isLogo) {
              protectedMedia.add(target);
            } else if (target && zip.file(target)) {
              try {
                const b64 = await zip.file(target).async('base64');
                const ext = target.split('.').pop().toLowerCase();
                const mime = (ext === 'png') ? 'image/png' : 'image/jpeg';
                const dataUrl = `data:${mime};base64,${b64}`;

                // Buscar posible texto descriptivo en la fila siguiente o en la misma celda
                let photoNote = '';
                if (rIdx + 1 < rows.length) {
                  const nextRowText = rows[rIdx + 1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                  if (/DESCRIPCI/i.test(nextRowText)) {
                    photoNote = nextRowText.replace(/DESCRIPCIÓN:?/i, '').trim();
                  }
                }

                // Cero auto-rotación: las imágenes deben iniciar tal cual en orientación 0°
                extractedPhotos.push({
                  id: `FOTO-${String(extractedPhotos.length + 1).padStart(3, '0')}`,
                  title: `Foto #${extractedPhotos.length + 1}`,
                  note: photoNote,
                  url: dataUrl,
                  rotation: 0,
                  initialRotation: 0,
                  scale: 1.0,
                  fitMode: 'fit',
                  offsetX: 0,
                  offsetY: 0,
                  isPreExisting: true,
                  coords: '',
                  source: 'template',
                  isUserUploaded: false,
                  hasWatermark: false
                });
              } catch (e) {
                console.warn('Error al extraer foto:', target, e);
              }
            }
          }
        }
      }
    }

    const textNodes = docXmlStr.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) || [];
    let extractedTitle = '';
    for (let i = 0; i < Math.min(textNodes.length, 30); i++) {
      const txt = textNodes[i].replace(/<[^>]+>/g, '').trim();
      if (txt.length >= 6 && /FOTO|INFORME|REPORTE|OBRA|REGISTRO|FORMATO|INTERVENTOR|INSPECCI/i.test(txt)) {
        extractedTitle = txt;
        break;
      }
    }

    const tablesCount = tables.length || 1;
    const slotsPerPage = extractedPhotos.length > 0 ? (extractedPhotos.length > 6 ? 6 : extractedPhotos.length) : 4;

    return {
      success: true,
      tablesCount,
      cellsCount: tables.length * 6,
      imagesCount: extractedPhotos.length,
      extractedTitle: extractedTitle || 'Informe Técnico de Registro Fotográfico',
      slotsPerPage,
      extractedPhotos
    };
  } catch (err) {
    console.warn('Excepción al analizar Word:', err);
    return {
      success: false,
      tablesCount: 1,
      cellsCount: 4,
      extractedTitle: file.name.replace(/\.[^/.]+$/, ''),
      slotsPerPage: 4,
      extractedPhotos: []
    };
  }
}

async function parseExcelDocument(file, rawBuffer) {
  try {
    const arrayBuffer = rawBuffer || (file && file.arrayBuffer ? await file.arrayBuffer() : null);
    if (!arrayBuffer) {
      return { success: false, sheetNames: ['Hoja1'], rowsCount: 20, colsCount: 6, slotsPerPage: 6, extractedPhotos: [], validatedPhotoSlots: [] };
    }

    let extractedTitle = '';
    let sheetNames = ['Hoja1'];
    let rowsCount = 20;
    let colsCount = 6;
    let slotsPerPage = 6;
    const extractedPhotos = [];
    const protectedMedia = new Set();
    const drawingSlots = [];
    const validatedPhotoSlots = [];
    const seenRanges = new Set();
    let detectedSlotCount = 0;

    let isInviasContext = (file && /invias/i.test(file.name)) ||
      (typeof state !== 'undefined' && state.template && state.template.isInvias);

    // 1. Usar JSZip para inspeccionar el archivo OpenXML Excel (.xlsx) a profundidad
    if (window.JSZip) {
      try {
        const zip = await window.JSZip.loadAsync(arrayBuffer);

        if (zip.file('xl/sharedStrings.xml')) {
          try {
            const ssXml = await zip.file('xl/sharedStrings.xml').async('text');
            if (/invias|instituto nacional de v|red nacional de carreteras/i.test(ssXml)) {
              isInviasContext = true;
            }
          } catch (_) {}
        }
        if (zip.file('xl/worksheets/sheet1.xml')) {
          try {
            const s1Xml = await zip.file('xl/worksheets/sheet1.xml').async('text');
            if (/A18:T39|U18:AN39/i.test(s1Xml) || /invias|instituto nacional de v/i.test(s1Xml)) {
              isInviasContext = true;
            }
          } catch (_) {}
        }

        // A. Inspeccionar relaciones de dibujos y medios en xl/drawings/
        const drRels = {};
        const relRegex = /<Relationship[^>]+Id="([^"]+)"[^>]+Target="([^"]+)"[^>]*>/g;

        for (const f of Object.keys(zip.files)) {
          if (f.startsWith('xl/drawings/_rels/drawing') && f.endsWith('.rels')) {
            const relsStr = await zip.file(f).async('text');
            let m;
            while ((m = relRegex.exec(relsStr)) !== null) {
              let target = m[2];
              if (target.startsWith('../')) target = target.substring(3);
              if (target.startsWith('media/')) target = 'xl/' + target;
              else if (!target.startsWith('xl/media/')) target = 'xl/media/' + target.split('/').pop();
              drRels[m[1]] = target;
            }
          }
        }

        // B. Inspeccionar xl/drawings/drawing*.xml para identificar logos protegidos vs fotos y registrar celdas ocupadas
        for (const f of Object.keys(zip.files)) {
          if (f.startsWith('xl/drawings/drawing') && f.endsWith('.xml') && !f.includes('_rels')) {
            const drXmlStr = await zip.file(f).async('text');
            const anchorRegex = /<xdr:(?:twoCellAnchor|oneCellAnchor)[\s\S]*?<\/xdr:(?:twoCellAnchor|oneCellAnchor)>/g;
            const anchors = drXmlStr.match(anchorRegex) || [];

            for (let pIdx = 0; pIdx < anchors.length; pIdx++) {
              const anchor = anchors[pIdx];
              const blipMatch = anchor.match(/<a:blip[^>]+r:embed="([^"]+)"/);
              const extMatch = anchor.match(/<a:ext[^>]+cx="(\d+)"[^>]+cy="(\d+)"/);
              const nameMatch = anchor.match(/<xdr:cNvPr[^>]+name="([^"]+)"/);
              const name = nameMatch ? nameMatch[1].toLowerCase() : '';

              if (blipMatch) {
                const rId = blipMatch[1];
                const target = drRels[rId];
                const cx = extMatch ? parseInt(extMatch[1]) : 0;
                const cy = extMatch ? parseInt(extMatch[2]) : 0;

                const fromMatch = anchor.match(/<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/);
                const sRow = fromMatch ? parseInt(fromMatch[2]) : 999;

                // Regla INVIAS y membretes: en filas 1 a 17 (0-indexed sRow <= 16) toda imagen es logo/membrete institucional protegido
                const isLogo = name.includes('logo') || (cx < 2000000 && cy < 1500000 && pIdx === 0) || (isInviasContext && sRow <= 16);
                if (isLogo) {
                  if (target) protectedMedia.add(target);
                } else {
                  detectedSlotCount++;

                  // Extraer coordenadas de celdas asignadas al dibujo
                  const toMatch = anchor.match(/<xdr:to>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/);
                  if (fromMatch && toMatch) {
                    const sCol = parseInt(fromMatch[1]);
                    const eCol = Math.max(sCol, parseInt(toMatch[1]) - 1);
                    const eRow = Math.max(sRow, parseInt(toMatch[2]) - 1);
                    const colsSpan = eCol - sCol + 1;
                    const rowsSpan = eRow - sRow + 1;
                    const totalCells = colsSpan * rowsSpan;
                    const rangeStr = window.XLSX
                      ? window.XLSX.utils.encode_range({ s: { r: sRow, c: sCol }, e: { r: eRow, c: eCol } })
                      : `C${sCol+1}R${sRow+1}:C${eCol+1}R${eRow+1}`;
                    drawingSlots.push({
                      slotIndex: drawingSlots.length + 1,
                      rangeStr,
                      startCol: sCol,
                      endCol: eCol,
                      startRow: sRow,
                      endRow: eRow,
                      colsSpan,
                      rowsSpan,
                      totalCells,
                      keyword: name || 'Ancla Gráfica',
                      source: 'ancla_dibujo'
                    });
                  }

                  if (target && zip.file(target)) {
                    try {
                      const b64 = await zip.file(target).async('base64');
                      const ext = target.split('.').pop().toLowerCase();
                      const mime = (ext === 'png') ? 'image/png' : 'image/jpeg';
                      const dataUrl = `data:${mime};base64,${b64}`;
                      extractedPhotos.push({
                        id: `FOTO-${String(extractedPhotos.length + 1).padStart(3, '0')}`,
                        title: `Foto #${extractedPhotos.length + 1}`,
                        note: '',
                        url: dataUrl,
                        rotation: 0,
                        initialRotation: 0,
                        scale: 1.0,
                        fitMode: 'fit',
                        offsetX: 0,
                        offsetY: 0,
                        isPreExisting: true,
                        coords: '',
                        source: 'template',
                        isUserUploaded: false,
                        hasWatermark: false
                      });
                    } catch (e) {
                      console.warn('Error al extraer foto Excel:', target, e);
                    }
                  }
                }
              }
            }
          }
        }

        // C. Extraer título y palabras clave de celdas desde xl/sharedStrings.xml
        if (zip.file('xl/sharedStrings.xml')) {
          const ssXml = await zip.file('xl/sharedStrings.xml').async('text');
          const strMatches = ssXml.match(/<t[^>]*>([^<]+)<\/t>/g) || [];
          const textValues = strMatches.map(m => m.replace(/<[^>]+>/g, '').trim());

          for (const txt of textValues) {
            if (!extractedTitle && txt.length >= 6 && /INFORME|REPORTE|FORMATO|INSPECCI|REGISTRO|MATRIZ|OBRA|INTERVENTOR|EVIDENCIA/i.test(txt)) {
              extractedTitle = txt;
            }
            if (/FOTO|FOTOGRAF|REGISTRO\s*#?\d|EVIDENCIA\s*#?\d|REGISTRO\s*FOTOGR/i.test(txt)) {
              detectedSlotCount++;
            }
          }
        }

        // D. Inspeccionar texto directo en sheet1.xml
        if (zip.file('xl/worksheets/sheet1.xml')) {
          const s1Xml = await zip.file('xl/worksheets/sheet1.xml').async('text');
          const cellStrMatches = s1Xml.match(/<v>([^<]+)<\/v>/g) || [];
          for (const cMatch of cellStrMatches) {
            const val = cMatch.replace(/<[^>]+>/g, '').trim();
            if (!extractedTitle && val.length >= 6 && /INFORME|REPORTE|FORMATO|INSPECCI|REGISTRO|MATRIZ|OBRA|INTERVENTOR/i.test(val)) {
              extractedTitle = val;
            }
          }
        }
      } catch (zipErr) {
        console.warn('JSZip no pudo descomprimir Excel (posible formato antiguo o binario):', zipErr);
      }
    }

    // 2. Extraer metadatos con SheetJS y analizar celdas múltiples / combinadas
    if (window.XLSX) {
      try {
        const workbook = window.XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
        sheetNames = workbook.SheetNames || ['Hoja1'];
        const firstSheet = workbook.Sheets[sheetNames[0]];
        if (firstSheet && firstSheet['!ref']) {
          const range = window.XLSX.utils.decode_range(firstSheet['!ref']);
          rowsCount = range.e.r - range.s.r + 1;
          colsCount = range.e.c - range.s.c + 1;

          // Buscar título en primeras 5 filas de la hoja si aún no se encontró
          if (!extractedTitle) {
            for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 4); r++) {
              for (let c = range.s.c; c <= range.e.c; c++) {
                const cellAddr = window.XLSX.utils.encode_cell({ r, c });
                const cell = firstSheet[cellAddr];
                if (cell && cell.v && typeof cell.v === 'string') {
                  const str = cell.v.trim();
                  if (str.length >= 6 && /INFORME|REPORTE|FORMATO|INSPECCI|REGISTRO|MATRIZ|OBRA|INTERVENTOR/i.test(str)) {
                    extractedTitle = str;
                    break;
                  }
                }
              }
              if (extractedTitle) break;
            }
          }

          // ANALIZAR Y VALIDAR CELDAS COMBINADAS ASIGNADAS PARA FOTOS (!merges)
          if (firstSheet['!merges'] && Array.isArray(firstSheet['!merges'])) {
            if (firstSheet['!merges'].some(m => m.s.r === 17 && m.s.c === 0 && m.e.r === 38 && m.e.c === 19)) {
              isInviasContext = true;
            }
            if (sheetNames.some(s => /invias/i.test(s))) {
              isInviasContext = true;
            }
            firstSheet['!merges'].forEach((m) => {
              const sCol = m.s.c, eCol = m.e.c, sRow = m.s.r, eRow = m.e.r;
              const colsSpan = eCol - sCol + 1;
              const rowsSpan = eRow - sRow + 1;
              const totalCells = colsSpan * rowsSpan;
              const rangeStr = window.XLSX.utils.encode_range(m);

              // Omitir membretes, títulos y etiquetas de 1 sola fila de alto.
              // En formatos técnicos de inspección, las casillas para fotos siempre tienen área vertical (mínimo 2 filas)
              if (rowsSpan < 2) return;

              // REGLA ESTRICTA INVIAS: Hasta la fila 17 (0-indexed sRow <= 16) no debe ponerse fotos en el formato INVIAS
              if (isInviasContext && sRow <= 16) return;

              const startCellAddr = window.XLSX.utils.encode_cell({ r: sRow, c: sCol });
              const cellVal = firstSheet[startCellAddr] && firstSheet[startCellAddr].v ? String(firstSheet[startCellAddr].v).trim() : '';
              const aboveCellAddr = sRow > 0 ? window.XLSX.utils.encode_cell({ r: sRow - 1, c: sCol }) : null;
              const aboveVal = aboveCellAddr && firstSheet[aboveCellAddr] && firstSheet[aboveCellAddr].v ? String(firstSheet[aboveCellAddr].v).trim() : '';

              const hasPhotoKeyword = /foto|fotograf|evidencia|registro\s*#?\d|registro\s*fotogr|imagen|espacio/i.test(cellVal) ||
                                      /foto|fotograf|evidencia|registro\s*#?\d|registro\s*fotogr|imagen|espacio/i.test(aboveVal);

              // Filtrar posibles bloques de texto institucional en filas superiores (filas 0 a 11) si no son explícitamente fotos
              const isHeaderArea = sRow < 12;
              const cellValLower = (cellVal + ' ' + aboveVal).toLowerCase();
              const hasHeaderWords = /instituto|invias|ministerio|republica|transporte|contrato|interventor|territorial|proyecto|tramo|sector/i.test(cellValLower);
              if (isHeaderArea && (hasHeaderWords || !hasPhotoKeyword)) return;

              const isPhotoSlot = hasPhotoKeyword || (rowsSpan >= 3 && colsSpan >= 1) || (rowsSpan >= 2 && colsSpan >= 2);

              if (isPhotoSlot && !seenRanges.has(rangeStr)) {
                seenRanges.add(rangeStr);
                validatedPhotoSlots.push({
                  slotIndex: validatedPhotoSlots.length + 1,
                  rangeStr,
                  startCol: sCol,
                  endCol: eCol,
                  startRow: sRow,
                  endRow: eRow,
                  colsSpan,
                  rowsSpan,
                  totalCells,
                  keyword: cellVal || aboveVal || `Casilla #${validatedPhotoSlots.length + 1}`,
                  source: 'celdas_combinadas'
                });
              }
            });
          }

          // Incluir anclas de dibujo si no coincidieron con celdas combinadas
          if (drawingSlots.length > 0) {
            drawingSlots.forEach((ds) => {
              if (!seenRanges.has(ds.rangeStr)) {
                seenRanges.add(ds.rangeStr);
                validatedPhotoSlots.push(ds);
              }
            });
          }

          // Si aún no hay slots detectados por combinaciones o dibujos, mapear celdas con palabras clave
          if (validatedPhotoSlots.length === 0) {
            for (let r = range.s.r; r <= range.e.r; r++) {
              if (isInviasContext && r <= 16) continue; // Prohibido en filas 1 a 17 para INVIAS
              for (let c = range.s.c; c <= range.e.c; c++) {
                const addr = window.XLSX.utils.encode_cell({ r, c });
                const cell = firstSheet[addr];
                if (cell && cell.v && typeof cell.v === 'string') {
                  const str = cell.v.trim();
                  if (/foto|fotograf|evidencia|registro\s*#?\d|registro\s*fotogr/i.test(str)) {
                    const eC = Math.min(c + 2, range.e.c);
                    const eR = Math.min(r + 4, range.e.r);
                    const rng = `${addr}:${window.XLSX.utils.encode_cell({ r: eR, c: eC })}`;
                    if (!seenRanges.has(rng)) {
                      seenRanges.add(rng);
                      const cSpan = eC - c + 1;
                      const rSpan = eR - r + 1;
                      validatedPhotoSlots.push({
                        slotIndex: validatedPhotoSlots.length + 1,
                        rangeStr: rng,
                        startCol: c,
                        endCol: eC,
                        startRow: r,
                        endRow: eR,
                        colsSpan: cSpan,
                        rowsSpan: rSpan,
                        totalCells: cSpan * rSpan,
                        keyword: str,
                        source: 'celdas_detectadas'
                      });
                    }
                  }
                }
              }
            }
          }
        }
      } catch (xlsxErr) {
        console.warn('SheetJS error al leer Excel:', xlsxErr);
      }
    }

    // Ordenar slots validados en orden de lectura (arriba hacia abajo, izquierda a derecha)
    validatedPhotoSlots.sort((a, b) => a.startRow !== b.startRow ? a.startRow - b.startRow : a.startCol - b.startCol);
    validatedPhotoSlots.forEach((s, idx) => s.slotIndex = idx + 1);

    // Identificar si corresponde al Formato Oficial INVIAS (Celdas A18:T39, U18:AN39, A41:T62, U41:AN62)
    const isInvias = isInviasContext ||
      validatedPhotoSlots.some(s => s.rangeStr === 'A18:T39' || s.rangeStr === 'U18:AN39' || s.rangeStr === 'A41:T62' || s.rangeStr === 'U41:AN62') ||
      /invias|instituto nacional de v|red nacional de carreteras/i.test(extractedTitle || '') ||
      /invias/i.test(file ? file.name : '');

    if (isInvias) {
      // Regla estricta INVIAS: ninguna foto en filas 1 a 17 (0-indexed <= 16)
      const filteredSlots = validatedPhotoSlots.filter(s => s.startRow >= 17);
      validatedPhotoSlots.length = 0;
      validatedPhotoSlots.push(...filteredSlots);
      validatedPhotoSlots.forEach((s, idx) => s.slotIndex = idx + 1);

      extractedTitle = 'FORMATO OFICIAL INVIAS - REGISTRO FOTOGRÁFICO';
      slotsPerPage = 4;
    } else if (validatedPhotoSlots.length > 0) {
      slotsPerPage = validatedPhotoSlots.length;
    } else if (detectedSlotCount > 0) {
      slotsPerPage = detectedSlotCount;
    } else if (extractedPhotos.length > 0) {
      slotsPerPage = extractedPhotos.length;
    } else {
      slotsPerPage = 6;
    }

    return {
      success: true,
      sheetNames,
      rowsCount,
      colsCount,
      extractedTitle: extractedTitle || (file ? file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ') : `Matriz de Inspección (${sheetNames[0]})`),
      slotsPerPage,
      extractedPhotos,
      detectedSlotCount,
      validatedPhotoSlots,
      isInvias
    };
  } catch (err) {
    console.warn('Excepción al analizar Excel:', err);
    return {
      success: false,
      sheetNames: ['Hoja1'],
      rowsCount: 20,
      colsCount: 6,
      extractedTitle: file ? file.name.replace(/\.[^/.]+$/, '') : 'Plantilla Excel',
      slotsPerPage: 6,
      extractedPhotos: [],
      validatedPhotoSlots: []
    };
  }
}

function generateInviasTemplateWorkbookBuffer() {
  if (!window.XLSX) return null;
  const wb = window.XLSX.utils.book_new();
  const wsData = [];
  for (let r = 0; r < 70; r++) {
    wsData.push(new Array(40).fill(''));
  }

  // Encabezado Institucional INVIAS
  wsData[0][0] = 'REPÚBLICA DE COLOMBIA - MINISTERIO DE TRANSPORTE';
  wsData[1][0] = 'INSTITUTO NACIONAL DE VÍAS - INVIAS';
  wsData[2][0] = 'SUBDIRECCIÓN DE GESTIÓN Y OPERACIÓN DE RED NACIONAL DE CARRETERAS';
  wsData[3][0] = 'REGISTRO FOTOGRÁFICO DE INSPECCIÓN Y SEGUIMIENTO TÉCNICO';

  // Datos del Contrato y Proyecto
  wsData[5][0] = 'CONTRATO DE OBRA / INTERVENTORÍA:';
  wsData[5][7] = 'INVIAS-CT-2026-0842';
  wsData[5][20] = 'CÓDIGO DE PROYECTO:';
  wsData[5][27] = 'PRY-VIAL-COL-9377';

  wsData[6][0] = 'CORREDOR VIAL / TERRITORIAL:';
  wsData[6][7] = 'CORREDOR TRONCAL CENTRAL - TERRITORIAL ANTIOQUIA';
  wsData[6][20] = 'FECHA DE INSPECCIÓN:';
  wsData[6][27] = 'OCTUBRE DE 2026';

  wsData[7][0] = 'TRAMO / SECTOR:';
  wsData[7][7] = 'TRAMO 02: MEDELLÍN - PUERTO TRIUNFO';
  wsData[7][20] = 'ABSCISADO / PR:';
  wsData[7][27] = 'PR 24+500 AL PR 38+200';

  wsData[8][0] = 'CONTRATISTA DE OBRA:';
  wsData[8][7] = 'CONSORCIO VIAL NACIONAL S.A.S.';
  wsData[8][20] = 'INTERVENTORÍA:';
  wsData[8][27] = 'CONSORCIO CONTROL Y GESTIÓN VIAL';

  // Rótulos de fotos 1 y 2
  wsData[16][0] = 'REGISTRO FOTOGRÁFICO #1 - ESTADO DE CALZADA / TALUD';
  wsData[16][20] = 'REGISTRO FOTOGRÁFICO #2 - OBRAS DE ARTE Y DRENAJE';

  // Espacios asignados para fotos 1 y 2 (Filas 18 a 39: celdas A18:T39 y U18:AN39)
  wsData[17][0] = '[ESPACIO ASIGNADO FOTOGRAFÍA #1 - FORMATO INVIAS A18:T39]';
  wsData[17][20] = '[ESPACIO ASIGNADO FOTOGRAFÍA #2 - FORMATO INVIAS U18:AN39]';

  // Metadatos de fotos 1 y 2 (Fila 40: A40:T40 y U40:AN40)
  wsData[39][0] = 'DESCRIPCIÓN: Vista panorámica PR 25+100. Calzada bidireccional en carpeta asfáltica. CTM12: N: 509214 E: 598432';
  wsData[39][20] = 'DESCRIPCIÓN: Cabezal y aletas de alcantarilla PR 28+450 sin obstrucción hidráulica. CTM12: N: 509350 E: 598610';

  // Espacios asignados para fotos 3 y 4 (Filas 41 a 62: celdas A41:T62 y U41:AN62)
  wsData[40][0] = '[ESPACIO ASIGNADO FOTOGRAFÍA #3 - FORMATO INVIAS A41:T62]';
  wsData[40][20] = '[ESPACIO ASIGNADO FOTOGRAFÍA #4 - FORMATO INVIAS U41:AN62]';

  // Metadatos de fotos 3 y 4 (Fila 63: A63:T63 y U63:AN63)
  wsData[62][0] = 'DESCRIPCIÓN: Instalación de defensas metálicas tipo W en curva PR 32+800. CTM12: N: 509520 E: 598840';
  wsData[62][20] = 'DESCRIPCIÓN: Demarcación y aplicación de pintura termoplástica PR 36+200. CTM12: N: 509710 E: 599100';

  // Firmas
  wsData[65][0] = '_____________________________________________';
  wsData[65][20] = '_____________________________________________';
  wsData[66][0] = 'ING. RESIDENTE DE OBRA / CONTRATISTA';
  wsData[66][20] = 'ING. DIRECTOR DE INTERVENTORÍA INVIAS';

  const ws = window.XLSX.utils.aoa_to_sheet(wsData);
  ws['!merges'] = [
    { s: { c: 0, r: 0 }, e: { c: 39, r: 0 } },
    { s: { c: 0, r: 1 }, e: { c: 39, r: 1 } },
    { s: { c: 0, r: 2 }, e: { c: 39, r: 2 } },
    { s: { c: 0, r: 3 }, e: { c: 39, r: 3 } },
    { s: { c: 0, r: 5 }, e: { c: 6, r: 5 } },
    { s: { c: 7, r: 5 }, e: { c: 19, r: 5 } },
    { s: { c: 20, r: 5 }, e: { c: 26, r: 5 } },
    { s: { c: 27, r: 5 }, e: { c: 39, r: 5 } },
    { s: { c: 0, r: 6 }, e: { c: 6, r: 6 } },
    { s: { c: 7, r: 6 }, e: { c: 19, r: 6 } },
    { s: { c: 20, r: 6 }, e: { c: 26, r: 6 } },
    { s: { c: 27, r: 6 }, e: { c: 39, r: 6 } },
    { s: { c: 0, r: 7 }, e: { c: 6, r: 7 } },
    { s: { c: 7, r: 7 }, e: { c: 19, r: 7 } },
    { s: { c: 20, r: 7 }, e: { c: 26, r: 7 } },
    { s: { c: 27, r: 7 }, e: { c: 39, r: 7 } },
    { s: { c: 0, r: 8 }, e: { c: 6, r: 8 } },
    { s: { c: 7, r: 8 }, e: { c: 19, r: 8 } },
    { s: { c: 20, r: 8 }, e: { c: 26, r: 8 } },
    { s: { c: 27, r: 8 }, e: { c: 39, r: 8 } },
    { s: { c: 0, r: 16 }, e: { c: 19, r: 16 } },
    { s: { c: 20, r: 16 }, e: { c: 39, r: 16 } },
    // Fotografía 1 y 2
    { s: { c: 0, r: 17 }, e: { c: 19, r: 38 } }, // A18:T39 (440 celdas)
    { s: { c: 20, r: 17 }, e: { c: 39, r: 38 } }, // U18:AN39 (440 celdas)
    // Metadatos 1 y 2
    { s: { c: 0, r: 39 }, e: { c: 19, r: 39 } }, // A40:T40
    { s: { c: 20, r: 39 }, e: { c: 39, r: 39 } }, // U40:AN40
    // Fotografía 3 y 4
    { s: { c: 0, r: 40 }, e: { c: 19, r: 61 } }, // A41:T62 (440 celdas)
    { s: { c: 20, r: 40 }, e: { c: 39, r: 61 } }, // U41:AN62 (440 celdas)
    // Metadatos 3 y 4
    { s: { c: 0, r: 62 }, e: { c: 19, r: 62 } }, // A63:T63
    { s: { c: 20, r: 62 }, e: { c: 39, r: 62 } }, // U63:AN63
    // Firmas
    { s: { c: 0, r: 65 }, e: { c: 19, r: 65 } },
    { s: { c: 20, r: 65 }, e: { c: 39, r: 65 } },
    { s: { c: 0, r: 66 }, e: { c: 19, r: 66 } },
    { s: { c: 20, r: 66 }, e: { c: 39, r: 66 } }
  ];

  const colWidths = [];
  for (let c = 0; c < 40; c++) colWidths.push({ wch: 3.2 });
  ws['!cols'] = colWidths;

  window.XLSX.utils.book_append_sheet(wb, ws, 'REGISTRO_INVIAS');
  return window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

function simulateAiScanning(filename, type, sizeStr = '750 KB') {
  const isInvias = type === 'invias' || filename.toLowerCase().includes('invias');
  const targetType = isInvias ? 'excel' : type;
  const targetExt = targetType === 'word' ? 'docx' : 'xlsx';
  state.template.name = filename;
  state.template.type = targetType;
  state.template.uploadedFormat = targetType;
  state.template.isInvias = isInvias;
  state.template.slotsPerPage = isInvias ? 4 : (type === 'word' ? 4 : 6);
  state.template.documentTitle = isInvias ? 'REGISTRO FOTOGRÁFICO OFICIAL INVIAS' : filename.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');

  const fileBase = filename.replace(/\.[^/.]+$/, '');
  const mainExportInput = document.getElementById('export-filename-input');
  if (mainExportInput) {
    mainExportInput.value = `${fileBase}_DILIGENCIADO.${targetExt}`;
  }
  if (typeof updateDirectDownloadView === 'function') updateDirectDownloadView();
  if (typeof setModalExportFormat === 'function') setModalExportFormat(targetExt, true);

  const statusBox = document.getElementById('template-file-status');
  const fileNameElem = document.getElementById('status-file-name');
  const fileSizeElem = document.getElementById('status-file-size');
  const fileIconElem = document.getElementById('status-file-icon');
  const progressBar = document.getElementById('ai-scan-progress-bar');
  const statusText = document.getElementById('ai-scan-status-text');
  const aiCard = document.getElementById('ai-template-card');

  if (statusBox) statusBox.classList.remove('hidden');
  if (aiCard) aiCard.classList.add('hidden');
  if (fileNameElem) fileNameElem.textContent = filename;
  if (fileSizeElem) fileSizeElem.textContent = sizeStr;

  if (fileIconElem) {
    fileIconElem.className = type === 'word' ? 'ph-bold ph-file-doc text-blue-400 text-lg' : 'ph-bold ph-file-xls text-emerald-400 text-lg';
  }

  if (progressBar) progressBar.style.width = '30%';
  if (statusText) statusText.textContent = 'Paso 1/3: Decodificando estructura del documento OpenXML...';

  setTimeout(() => {
    if (progressBar) progressBar.style.width = '70%';
    if (statusText) statusText.textContent = 'Paso 2/3: Mapeando celdas de fotos y protegiendo membrete/logos...';
  }, 300);

  setTimeout(() => {
    if (progressBar) progressBar.style.width = '100%';
    if (statusText) statusText.textContent = 'Paso 3/3: Mapeo de layout y continuidad completado con éxito.';

    if (isInvias) {
      state.template.hasUserTemplate = true;
      try {
        state.template.rawBuffer = generateInviasTemplateWorkbookBuffer();
      } catch (e) {
        console.warn('Error al generar plantilla INVIAS en memoria:', e);
      }
      state.template.validatedPhotoSlots = [
        { slotIndex: 1, rangeStr: 'A18:T39', startCol: 0, endCol: 19, startRow: 17, endRow: 38, colsSpan: 20, rowsSpan: 22, totalCells: 440, label: 'A18:T39 (20 cols × 22 filas = 440 celdas)' },
        { slotIndex: 2, rangeStr: 'U18:AN39', startCol: 20, endCol: 39, startRow: 17, endRow: 38, colsSpan: 20, rowsSpan: 22, totalCells: 440, label: 'U18:AN39 (20 cols × 22 filas = 440 celdas)' },
        { slotIndex: 3, rangeStr: 'A41:T62', startCol: 0, endCol: 19, startRow: 40, endRow: 61, colsSpan: 20, rowsSpan: 22, totalCells: 440, label: 'A41:T62 (20 cols × 22 filas = 440 celdas)' },
        { slotIndex: 4, rangeStr: 'U41:AN62', startCol: 20, endCol: 39, startRow: 40, endRow: 61, colsSpan: 20, rowsSpan: 22, totalCells: 440, label: 'U41:AN62 (20 cols × 22 filas = 440 celdas)' }
      ];
    } else if (type === 'excel') {
      state.template.validatedPhotoSlots = [
        { slotIndex: 1, rangeStr: 'A6:C9', startCol: 0, endCol: 2, startRow: 5, endRow: 8, colsSpan: 3, rowsSpan: 4, totalCells: 12, label: 'A6:C9 (3 cols × 4 filas = 12 celdas)' },
        { slotIndex: 2, rangeStr: 'D6:F9', startCol: 3, endCol: 5, startRow: 5, endRow: 8, colsSpan: 3, rowsSpan: 4, totalCells: 12, label: 'D6:F9 (3 cols × 4 filas = 12 celdas)' },
        { slotIndex: 3, rangeStr: 'A13:C16', startCol: 0, endCol: 2, startRow: 12, endRow: 15, colsSpan: 3, rowsSpan: 4, totalCells: 12, label: 'A13:C16 (3 cols × 4 filas = 12 celdas)' },
        { slotIndex: 4, rangeStr: 'D13:F16', startCol: 3, endCol: 5, startRow: 12, endRow: 15, colsSpan: 3, rowsSpan: 4, totalCells: 12, label: 'D13:F16 (3 cols × 4 filas = 12 celdas)' },
        { slotIndex: 5, rangeStr: 'A20:C23', startCol: 0, endCol: 2, startRow: 19, endRow: 22, colsSpan: 3, rowsSpan: 4, totalCells: 12, label: 'A20:C23 (3 cols × 4 filas = 12 celdas)' },
        { slotIndex: 6, rangeStr: 'D20:F23', startCol: 3, endCol: 5, startRow: 19, endRow: 22, colsSpan: 3, rowsSpan: 4, totalCells: 12, label: 'D20:F23 (3 cols × 4 filas = 12 celdas)' }
      ];
    } else {
      state.template.validatedPhotoSlots = [];
    }

    if (aiCard) aiCard.classList.remove('hidden');

    const slotsDetected = document.getElementById('ai-slots-detected');
    if (slotsDetected) {
      if (type === 'word') {
        slotsDetected.textContent = '4 Fotos por Página (Tabla Word)';
      } else if (isInvias) {
        slotsDetected.textContent = 'Formato Oficial INVIAS (4 Fotos / Página - Celdas A18:T39, U18:AN39, A41:T62, U41:AN62)';
      } else {
        slotsDetected.textContent = '6 Fotos por Página (6 rangos combinados de 12 celdas validados)';
      }
    }

    const multiCellSection = document.getElementById('ai-multicell-section');
    const multiCellBadge = document.getElementById('ai-multicell-count-badge');
    const multiCellList = document.getElementById('ai-multicell-list');
    if (multiCellSection && multiCellList) {
      if ((isInvias || type === 'excel') && state.template.validatedPhotoSlots.length > 0) {
        multiCellSection.classList.remove('hidden');
        if (multiCellBadge) {
          multiCellBadge.textContent = isInvias ? '4 slots INVIAS validados (440 celdas c/u)' : '6 slots validados';
        }
        multiCellList.innerHTML = state.template.validatedPhotoSlots.map(s => `
          <div class="flex items-center justify-between py-1 border-b border-slate-800/80 last:border-0">
            <span class="font-bold text-amber-300">[Slot #${s.slotIndex}] Rango ${s.rangeStr}:</span>
            <span class="text-slate-300">${s.colsSpan} cols × ${s.rowsSpan} filas <span class="text-emerald-400 font-bold">(${s.totalCells} celdas)</span></span>
          </div>
        `).join('');
      } else {
        multiCellSection.classList.add('hidden');
      }
    }

    const prevDetected = document.getElementById('ai-previous-photos');
    if (prevDetected) {
      prevDetected.textContent = isInvias
        ? `Plantilla: "FORMATO INVIAS" | Membrete institucional oficial protegido`
        : `Plantilla: "${state.template.documentTitle}" | Logos protegidos`;
    }

    const gridPreview = document.getElementById('ai-grid-preview');
    if (gridPreview) {
      if (type === 'word') {
        gridPreview.className = 'grid grid-cols-2 gap-2 text-[11px] font-mono';
        gridPreview.innerHTML = `
          <div class="p-2 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300">[Previa #1] Ocupada</div>
          <div class="p-2 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300">[Previa #2] Ocupada</div>
          <div class="p-2 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">[Slot #3] Disponible</div>
          <div class="p-2 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">[Slot #4] Disponible</div>
        `;
      } else {
        gridPreview.className = 'grid grid-cols-2 gap-1.5 text-[10px] font-mono';
        gridPreview.innerHTML = state.template.validatedPhotoSlots.map(s => `
          <div class="p-1.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-left">
            <div class="font-bold truncate text-[11px]">[Slot #${s.slotIndex}] ${s.rangeStr}</div>
            <div class="text-[9px] text-slate-300 opacity-90">${s.totalCells} celdas (${s.colsSpan}x${s.rowsSpan})</div>
            <div class="text-[9px] font-bold mt-0.5 text-emerald-400">Disponible</div>
          </div>
        `).join('');
      }
    }

    const headerPill = document.getElementById('header-template-name');
    if (headerPill) {
      headerPill.textContent = type === 'word' ? 'Word (4 fotos)' : (isInvias ? 'Excel INVIAS (4 fotos)' : 'Excel (6 fotos)');
    }

    if (typeof updateDirectDownloadView === 'function') updateDirectDownloadView();
    if (typeof setModalExportFormat === 'function') setModalExportFormat(targetExt, true);

    showToast(`Plantilla "${filename}" asignada (${state.template.slotsPerPage} fotos/página)`, 'ph-brain text-indigo-400');
  }, 700);
}
window.simulateAiScanning = simulateAiScanning;

// ==========================================
// 4. MESA DE TRABAJO (DRAG & DROP, ROTAR, CORTAR)
// ==========================================
function initCanvasModule() {
  document.getElementById('btn-toggle-multi-select').addEventListener('click', () => {
    state.isMultiSelectMode = !state.isMultiSelectMode;
    if (!state.isMultiSelectMode) state.selectedPhotoIds.clear();
    updateCanvasGrid();
  });

  const btnAddMore = document.getElementById('btn-add-more-photos');
  if (btnAddMore) {
    btnAddMore.addEventListener('click', () => {
      switchView('view-camera');
    });
  }
}

// ==========================================
// VISTA PREVIA AMPLIADA (LIGHTBOX MODAL)
// ==========================================
let currentLightboxIndex = -1;
function openPhotoLightbox(photo, globalIndex) {
  if (!photo) return;
  currentLightboxIndex = globalIndex !== undefined ? globalIndex : -1;
  const modal = document.getElementById('photo-lightbox-modal');
  const img = document.getElementById('lightbox-img');
  const title = document.getElementById('lightbox-photo-title');
  const tag = document.getElementById('lightbox-photo-tag');
  const note = document.getElementById('lightbox-photo-note');
  const rotBadge = document.getElementById('lightbox-photo-rot');

  if (!modal || !img) return;

  img.src = photo.url;
  // Vista grande: orientación final (rotación y espejo) sin recorte
  img.style.transform = `rotate(${Number(photo.rotation || 0)}deg) scale(${photo.flipH ? -1 : 1}, ${photo.flipV ? -1 : 1})`;

  if (title) {
    title.textContent = photo.title || `Foto #${(globalIndex !== undefined ? globalIndex : 0) + 1}`;
  }

  if (rotBadge) {
    if (photo.rotation && photo.rotation !== 0) {
      rotBadge.textContent = `⟳ ${photo.rotation}°`;
      rotBadge.classList.remove('hidden');
    } else {
      rotBadge.classList.add('hidden');
    }
  }

  if (tag) {
    tag.textContent = photo.isPreExisting ? 'Preexistente del Formato' : 'Nueva Evidencia';
    tag.className = photo.isPreExisting 
      ? 'text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30'
      : 'text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300';
  }

  if (note) {
    if (photo.note && photo.note.trim()) {
      note.textContent = photo.note;
      note.classList.remove('hidden');
    } else {
      note.classList.add('hidden');
    }
  }

  modal.classList.remove('hidden');
  initLightboxActionButtons();
}
window.openPhotoLightbox = openPhotoLightbox;

function closePhotoLightbox() {
  const modal = document.getElementById('photo-lightbox-modal');
  if (modal) {
    modal.classList.add('hidden');
    const img = document.getElementById('lightbox-img');
    if (img) img.src = '';
  }
}
window.closePhotoLightbox = closePhotoLightbox;

// Cerrar también con tecla Escape
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closePhotoLightbox();
    closeCropModal();
  }
});

// Botones de acción rápida dentro del Lightbox
function initLightboxActionButtons() {
  const lbRotBtn = document.getElementById('lightbox-btn-rotate');
  if (lbRotBtn && !lbRotBtn._hasBound) {
    lbRotBtn._hasBound = true;
    lbRotBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      rotateFromLightbox();
    });
  }

  const lbCropBtn = document.getElementById('lightbox-btn-crop');
  if (lbCropBtn && !lbCropBtn._hasBound) {
    lbCropBtn._hasBound = true;
    lbCropBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCropFromLightbox();
    });
  }
}

function rotateFromLightbox() {
  if (currentLightboxIndex >= 0 && currentLightboxIndex < state.photos.length) {
    const photo = state.photos[currentLightboxIndex];
    let r = (((photo.rotation || 0) + 90) % 360 + 360) % 360;
    if (r > 180) r -= 360;
    photo.rotation = r;
    delete photo.previewUrl;
    const img = document.getElementById('lightbox-img');
    if (img) img.style.transform = `rotate(${r}deg) scale(${photo.flipH ? -1 : 1}, ${photo.flipV ? -1 : 1})`;
    const rotBadge = document.getElementById('lightbox-photo-rot');
    if (rotBadge) {
      rotBadge.textContent = `⟳ ${photo.rotation}°`;
      rotBadge.classList.remove('hidden');
    }
    updateCanvasGrid();
    if (typeof updateDirectDownloadView === 'function') updateDirectDownloadView();
    scheduleOfflineSave();
    showToast(`Foto rotada a ${photo.rotation}°`, 'ph-arrow-clockwise text-blue-400');
  }
}
window.rotateFromLightbox = rotateFromLightbox;

function openCropFromLightbox() {
  if (currentLightboxIndex >= 0 && currentLightboxIndex < state.photos.length) {
    const idx = currentLightboxIndex;
    closePhotoLightbox();
    openCropModal(idx);
  }
}
window.openCropFromLightbox = openCropFromLightbox;

// ==========================================
// MODAL DE AJUSTE DE TAMAÑO, ENCUADRE Y ROTACIÓN
// ==========================================
let currentCropIndex = -1;
const CROP_FIELDS = ['rotation', 'scale', 'fitMode', 'offsetX', 'offsetY', 'flipH', 'flipV', 'lockAspect'];
let cropState = {
  rotation: 0,
  scale: 1.0,
  fitMode: 'fit',
  offsetX: 0,
  offsetY: 0,
  flipH: false,
  flipV: false,
  lockAspect: true
};

function getScaleLimits() {
  const min = Math.max(0.1, Math.min(1, (Number(state.config.minScalePct) || 50) / 100));
  const max = Math.max(1, Math.min(5, (Number(state.config.maxScalePct) || 250) / 100));
  return { min, max };
}

function clampCropScale(v) {
  const { min, max } = getScaleLimits();
  return Math.max(min, Math.min(max, v));
}

// Normaliza un ángulo a (-180, 180]
function normalizeAngle(deg) {
  let a = ((Number(deg) % 360) + 360) % 360;
  if (a > 180) a -= 360;
  return Math.round(a * 10) / 10;
}

let isDraggingCrop = false;
let cropDragStartX = 0;
let cropDragStartY = 0;
let cropInitialOffsetX = 0;
let cropInitialOffsetY = 0;
let cropListenersInitialized = false;

function initCropDragListeners() {
  if (cropListenersInitialized) return;
  const box = document.getElementById('crop-preview-box');
  if (!box) return;
  cropListenersInitialized = true;

  box.addEventListener('pointerdown', (e) => {
    isDraggingCrop = true;
    cropDragStartX = e.clientX;
    cropDragStartY = e.clientY;
    cropInitialOffsetX = cropState.offsetX || 0;
    cropInitialOffsetY = cropState.offsetY || 0;
  });

  window.addEventListener('pointermove', (e) => {
    if (!isDraggingCrop) return;
    const boxEl = document.getElementById('crop-preview-box');
    const boxW = (boxEl && boxEl.clientWidth) ? boxEl.clientWidth : 320;
    const boxH = (boxEl && boxEl.clientHeight) ? boxEl.clientHeight : 240;
    const deltaX = (e.clientX - cropDragStartX) / boxW;
    const deltaY = (e.clientY - cropDragStartY) / boxH;
    cropState.offsetX = Math.max(-1.5, Math.min(1.5, cropInitialOffsetX + deltaX));
    cropState.offsetY = Math.max(-1.5, Math.min(1.5, cropInitialOffsetY + deltaY));
    updateCropPreview();
  });

  // Rueda del ratón = zoom
  box.addEventListener('wheel', (e) => {
    e.preventDefault();
    adjustCropZoom(e.deltaY < 0 ? 5 : -5);
  }, { passive: false });

  const stopDrag = () => {
    isDraggingCrop = false;
  };

  window.addEventListener('pointerup', stopDrag);
  window.addEventListener('pointercancel', stopDrag);
}

function panCrop(dx, dy) {
  cropState.offsetX = Math.max(-1.5, Math.min(1.5, (cropState.offsetX || 0) + dx));
  cropState.offsetY = Math.max(-1.5, Math.min(1.5, (cropState.offsetY || 0) + dy));
  updateCropPreview();
}
window.panCrop = panCrop;

function centerCropPan() {
  cropState.offsetX = 0;
  cropState.offsetY = 0;
  updateCropPreview();
}
window.centerCropPan = centerCropPan;

function openCropModal(globalIndex) {
  if (globalIndex === undefined || globalIndex < 0 || globalIndex >= state.photos.length) return;
  currentCropIndex = globalIndex;
  const photo = state.photos[globalIndex];

  cropState.rotation = normalizeAngle(photo.rotation || 0);
  cropState.scale = photo.scale !== undefined ? photo.scale : 1.0;
  cropState.fitMode = photo.fitMode || 'fit';
  cropState.offsetX = photo.offsetX || 0;
  cropState.offsetY = photo.offsetY || 0;
  cropState.flipH = !!photo.flipH;
  cropState.flipV = !!photo.flipV;
  cropState.lockAspect = photo.lockAspect !== false;

  initCropDragListeners();

  const modal = document.getElementById('photo-crop-modal');
  const title = document.getElementById('crop-modal-photo-title');
  const img = document.getElementById('crop-preview-img');

  if (title) title.textContent = `${photo.title || ('Foto #' + (globalIndex + 1))} - ${photo.isPreExisting ? 'Preexistente' : 'Nueva'}`;
  const minInp = document.getElementById('crop-min-scale');
  const maxInp = document.getElementById('crop-max-scale');
  const uniInp = document.getElementById('crop-uniform-size');
  if (minInp) minInp.value = Math.round(getScaleLimits().min * 100);
  if (maxInp) maxInp.value = Math.round(getScaleLimits().max * 100);
  if (uniInp) uniInp.checked = state.config.uniformPhotoSize !== false;

  if (modal) modal.classList.remove('hidden');
  if (img) {
    img.onload = () => updateCropPreview();
    img.src = photo.url;
  }
  updateCropPreview();
}
window.openCropModal = openCropModal;

function closeCropModal() {
  const modal = document.getElementById('photo-crop-modal');
  if (modal) modal.classList.add('hidden');
  isDraggingCrop = false;
  currentCropIndex = -1;
}
window.closeCropModal = closeCropModal;

function setToolActive(id, active) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('is-active', !!active);
}

function updateCropPreview() {
  const img = document.getElementById('crop-preview-img');
  const box = document.getElementById('crop-preview-box');
  const scaleVal = cropState.scale !== undefined ? cropState.scale : 1.0;
  const { min, max } = getScaleLimits();

  const zoomLabel = document.getElementById('crop-zoom-label');
  const rotLabel = document.getElementById('crop-rot-label');
  const zoomSlider = document.getElementById('crop-zoom-slider');
  const rotSlider = document.getElementById('crop-rot-slider');
  const rotInput = document.getElementById('crop-rot-input');
  if (zoomLabel) zoomLabel.textContent = `${Math.round(scaleVal * 100)}%`;
  if (rotLabel) rotLabel.textContent = `${cropState.rotation || 0}°${cropState.flipH ? ' · espejo H' : ''}${cropState.flipV ? ' · espejo V' : ''}`;
  if (zoomSlider) {
    zoomSlider.min = Math.round(min * 100);
    zoomSlider.max = Math.round(max * 100);
    zoomSlider.value = Math.round(scaleVal * 100);
  }
  if (rotSlider) rotSlider.value = cropState.rotation || 0;
  if (rotInput && document.activeElement !== rotInput) rotInput.value = cropState.rotation || 0;

  setToolActive('btn-crop-fit', cropState.lockAspect && cropState.fitMode !== 'cover');
  setToolActive('btn-crop-cover', cropState.lockAspect && cropState.fitMode === 'cover');
  setToolActive('btn-crop-flip-h', cropState.flipH);
  setToolActive('btn-crop-flip-v', cropState.flipV);
  setToolActive('btn-crop-lock', cropState.lockAspect);
  setToolActive('btn-crop-grid', state.config.showCropGrid !== false);
  const lockIcon = document.getElementById('crop-lock-icon');
  const lockLabel = document.getElementById('crop-lock-label');
  if (lockIcon) lockIcon.className = `ph-bold ${cropState.lockAspect ? 'ph-lock' : 'ph-lock-open'} text-sky-400`;
  if (lockLabel) lockLabel.textContent = cropState.lockAspect ? 'Proporción fija' : 'Estirar';
  const grid = document.getElementById('crop-grid-overlay');
  if (grid) grid.classList.toggle('hidden', state.config.showCropGrid === false);

  if (!img || !box) return;
  const boxW = box.clientWidth || 320;
  const boxH = box.clientHeight || 240;
  applyPhotoLayoutToImg(img, cropState, boxW, boxH);
}
window.updateCropPreview = updateCropPreview;

function onCropZoomChange(val) {
  cropState.scale = clampCropScale(parseFloat(val) / 100);
  updateCropPreview();
}
window.onCropZoomChange = onCropZoomChange;

function adjustCropZoom(deltaPercent) {
  const currentPct = Math.round((cropState.scale !== undefined ? cropState.scale : 1.0) * 100);
  cropState.scale = clampCropScale((currentPct + deltaPercent) / 100);
  updateCropPreview();
}
window.adjustCropZoom = adjustCropZoom;

function onCropRotationChange(val) {
  const n = parseFloat(val);
  if (Number.isNaN(n)) return;
  cropState.rotation = normalizeAngle(n);
  updateCropPreview();
}
window.onCropRotationChange = onCropRotationChange;

// Auto-ajustar (fit) restablece tamaño y encuadre; Llenar (cover) cubre todo el marco
function setCropFitMode(mode) {
  cropState.fitMode = mode;
  cropState.lockAspect = true;
  cropState.scale = 1.0;
  cropState.offsetX = 0;
  cropState.offsetY = 0;
  updateCropPreview();
}
window.setCropFitMode = setCropFitMode;

function rotateCropModal(delta) {
  cropState.rotation = normalizeAngle((cropState.rotation || 0) + delta);
  updateCropPreview();
}
window.rotateCropModal = rotateCropModal;

function toggleCropFlip(axis) {
  cropState[axis] = !cropState[axis];
  updateCropPreview();
}
window.toggleCropFlip = toggleCropFlip;

function toggleCropLockAspect() {
  cropState.lockAspect = !cropState.lockAspect;
  if (!cropState.lockAspect) { cropState.offsetX = 0; cropState.offsetY = 0; cropState.scale = 1.0; }
  updateCropPreview();
}
window.toggleCropLockAspect = toggleCropLockAspect;

function toggleCropGrid() {
  state.config.showCropGrid = state.config.showCropGrid === false;
  scheduleOfflineSave();
  updateCropPreview();
}
window.toggleCropGrid = toggleCropGrid;

function onCropLimitsChange() {
  const minInp = document.getElementById('crop-min-scale');
  const maxInp = document.getElementById('crop-max-scale');
  const uniInp = document.getElementById('crop-uniform-size');
  if (minInp) state.config.minScalePct = Math.max(10, Math.min(100, Number(minInp.value) || 50));
  if (maxInp) state.config.maxScalePct = Math.max(100, Math.min(500, Number(maxInp.value) || 250));
  if (uniInp) state.config.uniformPhotoSize = !!uniInp.checked;
  cropState.scale = clampCropScale(cropState.scale || 1);
  scheduleOfflineSave();
  updateCropPreview();
}
window.onCropLimitsChange = onCropLimitsChange;

function resetCropModal() {
  const initRot = (currentCropIndex >= 0 && state.photos[currentCropIndex]) ? (state.photos[currentCropIndex].initialRotation || 0) : 0;
  cropState.rotation = initRot;
  cropState.scale = 1.0;
  cropState.fitMode = 'fit';
  cropState.offsetX = 0;
  cropState.offsetY = 0;
  cropState.flipH = false;
  cropState.flipV = false;
  cropState.lockAspect = true;
  updateCropPreview();
}
window.resetCropModal = resetCropModal;

function updatePhotoPreviewUrl(photo) {
  return Promise.resolve();
}
window.updatePhotoPreviewUrl = updatePhotoPreviewUrl;

function copyCropStateTo(photo) {
  CROP_FIELDS.forEach(k => { photo[k] = cropState[k]; });
  delete photo.previewUrl;
}

function afterCropChange(message) {
  closeCropModal();
  updateCanvasGrid();
  if (typeof updateDirectDownloadView === 'function') updateDirectDownloadView();
  scheduleOfflineSave();
  showToast(message, 'ph-check-circle text-emerald-400');
}

function saveCropModal() {
  if (currentCropIndex < 0 || currentCropIndex >= state.photos.length) {
    closeCropModal();
    return;
  }
  const photo = state.photos[currentCropIndex];
  copyCropStateTo(photo);
  afterCropChange(`Ajuste guardado: ${photo.rotation}°${photo.flipH || photo.flipV ? ', espejo' : ''}, ${Math.round(photo.scale * 100)}% de tamaño`);
}
window.saveCropModal = saveCropModal;

// Copia el ajuste actual a todas las fotos de la página visible (encaje uniforme rápido)
function applyCropToSelection() {
  if (currentCropIndex < 0) return;
  const per = state.template.slotsPerPage || 4;
  const start = (state.currentPage - 1) * per;
  const targets = state.photos.slice(start, start + per);
  targets.forEach(copyCropStateTo);
  afterCropChange(`Ajuste aplicado a ${targets.length} fotos de la página ${state.currentPage}`);
}
window.applyCropToSelection = applyCropToSelection;

// ==========================================
// RENDERIZADO DEL LIENZO / MESA DE TRABAJO
// ==========================================
function updateCanvasGrid() {
  const grid = document.getElementById('photos-grid-canvas');
  grid.innerHTML = '';

  const slotsPerPage = state.template.slotsPerPage || 4;
  const startIndex = (state.currentPage - 1) * slotsPerPage;
  const pagePhotos = state.photos.slice(startIndex, startIndex + slotsPerPage);

  // Resumen en subtítulo
  const totalPages = Math.ceil(state.photos.length / slotsPerPage) || 1;
  document.getElementById('canvas-summary-subtitle').textContent = 
    `${state.photos.length} Fotos | ${totalPages} Pág (Viendo P${state.currentPage})`;

  pagePhotos.forEach((photo, idx) => {
    const globalIndex = startIndex + idx;
    const card = document.createElement('div');
    card.className = `photo-slot-card relative rounded-xl bg-slate-800 border border-slate-700 p-2 flex flex-col space-y-1.5 cursor-grab active:cursor-grabbing hover:border-blue-500/60 transition ${
      state.selectedPhotoIds.has(photo.id) ? 'selected' : ''
    }`;
    card.draggable = true;
    card.dataset.index = globalIndex;
    card.dataset.id = photo.id;
    card.title = "Doble clic para ajustar la foto";

    // Etiqueta preexistente vs nueva y badges de ajuste
    const tagHtml = photo.isPreExisting
      ? `<span class="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] px-1.5 py-0.2 rounded font-medium">Preexistente</span>`
      : `<span class="bg-blue-500/20 text-blue-300 text-[9px] px-1.5 py-0.2 rounded font-medium">Nueva</span>`;

    const rotBadge = photo.rotation && photo.rotation !== 0 
      ? `<span class="bg-amber-500/20 text-amber-300 text-[9px] px-1.5 py-0.2 rounded font-mono font-medium">⟳${photo.rotation}°</span>` 
      : '';
    const zoomBadge = photo.scale && photo.scale !== 1.0 
      ? `<span class="bg-blue-500/20 text-blue-300 text-[9px] px-1.5 py-0.2 rounded font-mono font-medium">${Math.round(photo.scale * 100)}%</span>` 
      : '';

    const flipBadge = (photo.flipH || photo.flipV)
      ? `<span class="bg-fuchsia-500/20 text-fuchsia-300 text-[9px] px-1.5 py-0.2 rounded font-medium">Espejo</span>`
      : '';

    card.innerHTML = `
      <div class="flex items-center justify-between text-[11px]">
        <strong class="text-white font-mono">Foto #${globalIndex + 1}</strong>
        <div class="flex items-center gap-1">
          ${rotBadge}
          ${flipBadge}
          ${zoomBadge}
          ${tagHtml}
        </div>
      </div>

      <!-- Contenedor Imagen con Rotación, Escala y Botón de Lupa -->
      <div class="photo-img-wrapper w-full aspect-[4/3] bg-white rounded-lg overflow-hidden relative cursor-pointer group/img" title="Doble clic para agrandar">
        <img src="${photo.url}" alt="${photo.title}" class="card-photo-img pointer-events-none" draggable="false" />

        <!-- Botón de lupa para zoom rápido -->
        <button class="btn-quick-zoom absolute bottom-1 right-1 bg-black/70 hover:bg-black text-white/90 p-1 rounded text-xs transition" title="Ver en tamaño grande (Doble clic)">
          <i class="ph-bold ph-magnifying-glass-plus"></i>
        </button>

        ${state.isMultiSelectMode ? `
          <div class="absolute top-1.5 right-1.5 w-5 h-5 rounded-full ${state.selectedPhotoIds.has(photo.id) ? 'bg-emerald-500 text-white' : 'bg-black/60 text-white/50'} flex items-center justify-center text-xs">
            <i class="ph-bold ph-check"></i>
          </div>
        ` : ''}
      </div>

      <!-- Descripción y datos extraídos por IA -->
      <div class="text-[10px] text-slate-300 truncate" title="${photo.note || 'Sin descripción'}">
        ${photo.note || '<span class="text-slate-500 italic">Sin descripción</span>'}
      </div>
      <div class="min-h-[14px] flex">${window.AIExtract ? AIExtract.cardChips(photo) : ''}</div>

      <!-- Barra de Acciones Rápidas (Rotar, Ajustar Tamaño, Mover a Hoja, Eliminar) -->
      <div class="flex items-center justify-between pt-1 border-t border-slate-700/60 text-slate-400">
        <button type="button" draggable="false" onclick="event.stopPropagation(); rotateCardPhoto(${globalIndex})" class="btn-rotate p-1 hover:text-white rounded cursor-pointer" title="Rotar 90°">
          <i class="ph-bold ph-arrow-clockwise text-sm pointer-events-none"></i>
        </button>
        <button type="button" draggable="false" onclick="event.stopPropagation(); openCropModal(${globalIndex})" class="btn-crop p-1 hover:text-white rounded cursor-pointer" title="Ajustar tamaño y encuadre">
          <i class="ph-bold ph-crop text-sm pointer-events-none"></i>
        </button>
        <button type="button" draggable="false" onclick="event.stopPropagation(); AIExtract.openPanel(${globalIndex})" class="p-1 hover:text-violet-300 rounded text-violet-400/90 cursor-pointer" title="Datos extraídos por IA">
          <i class="ph-bold ph-sparkle text-sm pointer-events-none"></i>
        </button>
        <button type="button" draggable="false" onclick="event.stopPropagation(); openMovePageModal(${globalIndex})" class="btn-move-page p-1 hover:text-blue-300 rounded text-slate-400 cursor-pointer" title="Mover a otra hoja">
          <i class="ph-bold ph-files text-sm pointer-events-none"></i>
        </button>
        <button type="button" draggable="false" onclick="event.stopPropagation(); deletePhoto(${globalIndex})" class="btn-delete p-1 hover:text-red-400 rounded text-red-500/80 cursor-pointer" title="Eliminar">
          <i class="ph-bold ph-trash text-sm pointer-events-none"></i>
        </button>
      </div>
    `;

    // Doble clic abre el editor de ajuste (zoom, desplazamiento, giro, restablecer, guardar) — RQ-22
    card.addEventListener('dblclick', (e) => {
      e.preventDefault();
      openCropModal(globalIndex);
    });

    // Clic en el botón de lupa también abre el Lightbox
    const zoomBtn = card.querySelector('.btn-quick-zoom');
    if (zoomBtn) {
      zoomBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openPhotoLightbox(photo, globalIndex);
      });
    }

    // Selección múltiple
    card.addEventListener('click', () => {
      if (state.isMultiSelectMode) {
        if (state.selectedPhotoIds.has(photo.id)) {
          state.selectedPhotoIds.delete(photo.id);
        } else {
          state.selectedPhotoIds.add(photo.id);
        }
        updateCanvasGrid();
      }
    });

    // Drag & Drop Nativo
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragover', handleDragOver);
    card.addEventListener('dragleave', handleDragLeave);
    card.addEventListener('drop', handleDrop);
    card.addEventListener('dragend', handleDragEnd);

    grid.appendChild(card);
    layoutPhotoInBox(card.querySelector('.card-photo-img'), photo, card.querySelector('.photo-img-wrapper'));
  });

  if (!state.photos.length) {
    grid.innerHTML = `<div class="col-span-full py-10 text-center text-xs text-slate-500 space-y-2">
      <i class="ph-bold ph-images text-3xl text-slate-600"></i>
      <p>Este proyecto aún no tiene fotos.</p>
      <p>Usa <strong>Cámara</strong> o <strong>Galería</strong> para agregarlas.</p></div>`;
  }
  updateMultiSelectBar();
}

function rotateCardPhoto(globalIndex) {
  if (globalIndex >= 0 && globalIndex < state.photos.length) {
    const photo = state.photos[globalIndex];
    let r = (((photo.rotation || 0) + 90) % 360 + 360) % 360;
    if (r > 180) r -= 360;
    photo.rotation = r;
    delete photo.previewUrl;
    updateCanvasGrid();
    if (typeof updateDirectDownloadView === 'function') updateDirectDownloadView();
    scheduleOfflineSave();
    showToast(`Foto #${globalIndex + 1} rotada a ${photo.rotation}°`, 'ph-arrow-clockwise text-blue-400');
  }
}
window.rotateCardPhoto = rotateCardPhoto;

// ==========================================
// CONTROL DE MOVIMIENTO ENTRE HOJAS (INTER-PÁGINA)
// ==========================================
let dragSrcIndex = null;
let dragHoverTimer = null;

function handleDragStart(e) {
  dragSrcIndex = Number(this.dataset.index);
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragSrcIndex);

  // Resaltar visualmente la barra de hojas
  const bar = document.getElementById('pagination-container-bar');
  if (bar) {
    bar.classList.add('bg-blue-950/70', 'border-blue-500/50', 'ring-1', 'ring-blue-400/40');
  }
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  this.classList.add('drag-over');
}

function handleDragLeave() {
  this.classList.remove('drag-over');
}

function handleDrop(e) {
  e.stopPropagation();
  e.preventDefault();
  this.classList.remove('drag-over');

  const destIndex = Number(this.dataset.index);
  if (dragSrcIndex !== null && dragSrcIndex !== destIndex) {
    // Intercambiar posición de fotos
    const temp = state.photos[dragSrcIndex];
    state.photos[dragSrcIndex] = state.photos[destIndex];
    state.photos[destIndex] = temp;

    // Actualizar numeración correlativa
    state.photos.forEach((p, i) => p.title = `Foto #${i + 1}`);

    updateCanvasGrid();
    scheduleOfflineSave();
    showToast(`Fotos reordenadas (Foto #${dragSrcIndex + 1} ⇄ Foto #${destIndex + 1})`, 'ph-arrows-left-right text-blue-400');
  }
}

function handleDragEnd() {
  this.classList.remove('dragging');
  if (dragHoverTimer) {
    clearTimeout(dragHoverTimer);
    dragHoverTimer = null;
  }
  document.querySelectorAll('.photo-slot-card').forEach(c => c.classList.remove('drag-over'));
  document.querySelectorAll('.page-pill').forEach(p => {
    p.classList.remove('ring-2', 'ring-emerald-400', 'bg-emerald-600/40', 'scale-105');
  });

  const bar = document.getElementById('pagination-container-bar');
  if (bar) {
    bar.classList.remove('bg-blue-950/70', 'border-blue-500/50', 'ring-1', 'ring-blue-400/40');
  }
}

function movePhotoToPage(sourceIndex, targetPage) {
  if (sourceIndex === null || sourceIndex < 0 || sourceIndex >= state.photos.length) return;
  const slotsPerPage = state.template.slotsPerPage || 4;
  const totalPages = Math.ceil(state.photos.length / slotsPerPage) || 1;
  if (targetPage < 1 || targetPage > totalPages) return;

  const [movedPhoto] = state.photos.splice(sourceIndex, 1);

  // Insertar al inicio de la página de destino
  let targetIndex = (targetPage - 1) * slotsPerPage;
  if (targetIndex > state.photos.length) {
    targetIndex = state.photos.length;
  }

  state.photos.splice(targetIndex, 0, movedPhoto);

  // Actualizar numeración correlativa
  state.photos.forEach((p, i) => {
    p.title = `Foto #${i + 1}`;
  });

  state.currentPage = targetPage;
  renderPagination();
  updateCanvasGrid();
  scheduleOfflineSave();

  showToast(`Foto movida con éxito a P${targetPage}`, 'ph-check-circle text-emerald-400');
}
window.movePhotoToPage = movePhotoToPage;

// Modal para selección de hoja
let activePhotoIndexToMove = null;

function openMovePageModal(photoIndex) {
  activePhotoIndexToMove = photoIndex;
  const modal = document.getElementById('move-page-modal');
  const title = document.getElementById('move-page-photo-title');
  const container = document.getElementById('move-page-options');

  if (!modal || !container) return;

  const photo = state.photos[photoIndex];
  const slotsPerPage = state.template.slotsPerPage || 4;
  const totalPages = Math.ceil(state.photos.length / slotsPerPage) || 1;
  const currentPhotoPage = Math.floor(photoIndex / slotsPerPage) + 1;

  if (title) {
    title.textContent = `Mover "${photo.title}" (Actualmente en P${currentPhotoPage}):`;
  }

  container.innerHTML = '';
  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement('button');
    btn.className = `p-2 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
      i === currentPhotoPage
        ? 'bg-blue-600/20 border-blue-500 text-blue-300 ring-1 ring-blue-400'
        : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-white'
    }`;
    btn.innerHTML = `<i class="ph-bold ph-file-text text-xs"></i> P${i}`;
    btn.addEventListener('click', () => {
      closeMovePageModal();
      if (i !== currentPhotoPage) {
        movePhotoToPage(activePhotoIndexToMove, i);
      } else {
        showToast(`La foto ya se encuentra en P${i}`);
      }
    });
    container.appendChild(btn);
  }

  modal.classList.remove('hidden');
}
window.openMovePageModal = openMovePageModal;

function closeMovePageModal() {
  const modal = document.getElementById('move-page-modal');
  if (modal) modal.classList.add('hidden');
  activePhotoIndexToMove = null;
}
window.closeMovePageModal = closeMovePageModal;

// ==========================================
// SELECCIÓN MÚLTIPLE: retirar y mover en bloque (RQ-23)
// ==========================================
function updateMultiSelectBar() {
  const btn = document.getElementById('btn-toggle-multi-select');
  const label = document.getElementById('selected-count-label');
  const actions = document.getElementById('multi-select-actions');
  const n = state.selectedPhotoIds.size;
  if (btn) {
    btn.className = state.isMultiSelectMode
      ? 'px-2.5 py-1 rounded bg-emerald-600 text-white text-[11px] font-bold'
      : 'px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[11px] hover:text-white';
    btn.innerHTML = state.isMultiSelectMode ? '<i class="ph-bold ph-x"></i> Terminar' : '<i class="ph-bold ph-check-square-offset"></i> Seleccionar';
  }
  if (label) {
    label.textContent = state.isMultiSelectMode
      ? (n ? `${n} seleccionada${n === 1 ? '' : 's'}` : 'Toca fotos para seleccionarlas')
      : 'Doble clic para ajustar · arrastra para mover';
  }
  if (actions) {
    actions.classList.toggle('hidden', !state.isMultiSelectMode);
    actions.classList.toggle('flex', state.isMultiSelectMode);
    actions.querySelectorAll('button:not(:first-child), select').forEach(el => { el.disabled = n === 0; el.classList.toggle('opacity-40', n === 0); });
    const sel = document.getElementById('multi-move-target');
    if (sel) {
      const per = state.template.slotsPerPage || 4;
      const pages = Math.max(1, Math.ceil(state.photos.length / per));
      sel.innerHTML = '<option value="">Mover a…</option>' + Array.from({ length: pages }, (_, i) => `<option value="${i + 1}">Página ${i + 1}</option>`).join('');
    }
  }
}
window.updateMultiSelectBar = updateMultiSelectBar;

function renumberPhotos() {
  state.photos.forEach((p, i) => { p.title = `Foto #${i + 1}`; });
}

function refreshAfterPhotoSetChange() {
  const per = state.template.slotsPerPage || 4;
  const pages = Math.max(1, Math.ceil(state.photos.length / per));
  if (state.currentPage > pages) state.currentPage = pages;
  const badge = document.getElementById('canvas-badge-count');
  if (badge) badge.textContent = state.photos.length;
  updateCanvasGrid();
  renderPagination();
  if (typeof updateDirectDownloadView === 'function') updateDirectDownloadView();
  scheduleOfflineSave();
}

function selectAllOnPage() {
  const per = state.template.slotsPerPage || 4;
  const start = (state.currentPage - 1) * per;
  state.photos.slice(start, start + per).forEach(p => state.selectedPhotoIds.add(p.id));
  updateCanvasGrid();
}
window.selectAllOnPage = selectAllOnPage;

// Retira las fotos de la app. Nunca toca los archivos del dispositivo: se pueden volver a cargar.
function removeSelectedPhotos() {
  const n = state.selectedPhotoIds.size;
  if (!n) return;
  if (!confirm(`¿Retirar ${n} foto${n === 1 ? '' : 's'} del informe?\n\nSolo se quitan de la app; los archivos originales en tu dispositivo no se borran y puedes volver a cargarlos.`)) return;
  state.photos = state.photos.filter(p => !state.selectedPhotoIds.has(p.id));
  state.selectedPhotoIds.clear();
  renumberPhotos();
  refreshAfterPhotoSetChange();
  showToast(`${n} foto${n === 1 ? '' : 's'} retirada${n === 1 ? '' : 's'} de la app (no del dispositivo)`, 'ph-trash text-amber-400');
}
window.removeSelectedPhotos = removeSelectedPhotos;

// Mueve las seleccionadas, en su orden actual, al inicio de la página destino
function moveSelectedToPage(targetPage) {
  targetPage = Number(targetPage);
  if (!targetPage || !state.selectedPhotoIds.size) return;
  const per = state.template.slotsPerPage || 4;
  const moving = state.photos.filter(p => state.selectedPhotoIds.has(p.id));
  const rest = state.photos.filter(p => !state.selectedPhotoIds.has(p.id));
  const insertAt = Math.min((targetPage - 1) * per, rest.length);
  rest.splice(insertAt, 0, ...moving);
  state.photos = rest;
  renumberPhotos();
  state.currentPage = Math.min(targetPage, Math.max(1, Math.ceil(state.photos.length / per)));
  state.selectedPhotoIds.clear();
  refreshAfterPhotoSetChange();
  showToast(`${moving.length} foto${moving.length === 1 ? '' : 's'} movida${moving.length === 1 ? '' : 's'} a la página ${targetPage}`, 'ph-files text-blue-400');
}
window.moveSelectedToPage = moveSelectedToPage;

function deletePhoto(index) {
  const removed = state.photos.splice(index, 1)[0];
  state.photos.forEach((p, i) => p.title = `Foto #${i + 1}`);
  
  document.getElementById('canvas-badge-count').textContent = state.photos.length;
  updateCanvasGrid();
  renderPagination();
  if (typeof updateDirectDownloadView === 'function') updateDirectDownloadView();
  scheduleOfflineSave();
  showToast(`Foto retirada de la app (el archivo original sigue en tu dispositivo)`, 'ph-trash text-amber-400');
}

function renderPagination() {
  const container = document.getElementById('pagination-pills');
  if (!container) return;
  container.innerHTML = '';

  const slotsPerPage = state.template.slotsPerPage || 4;
  const totalPages = Math.ceil(state.photos.length / slotsPerPage) || 1;

  if (state.currentPage > totalPages) {
    state.currentPage = totalPages;
  }

  for (let i = 1; i <= totalPages; i++) {
    const pill = document.createElement('button');
    pill.className = `page-pill px-2.5 py-1 min-w-[34px] rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer flex items-center justify-center select-none ${
      i === state.currentPage 
        ? 'active bg-blue-600 text-white shadow-md shadow-blue-600/30 ring-2 ring-blue-400/50' 
        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:text-white'
    }`;
    pill.textContent = `P${i}`;
    pill.dataset.page = i;
    pill.title = `Página ${i} (Arrastra una foto aquí para moverla a P${i})`;

    // Clic normal para ver la página
    pill.addEventListener('click', () => {
      state.currentPage = i;
      renderPagination();
      updateCanvasGrid();
    });

    // ARRASTRAR Y SOLTAR DIRECTO EN LA HOJA
    pill.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      pill.classList.add('ring-2', 'ring-emerald-400', 'bg-emerald-600/40', 'scale-105');

      // Spring-loading: Si mantiene el arrastre sobre la píldora 400ms, cambia de hoja en vivo
      if (!dragHoverTimer && state.currentPage !== i) {
        dragHoverTimer = setTimeout(() => {
          state.currentPage = i;
          renderPagination();
          updateCanvasGrid();
          showToast(`Cambiando a P${i}... Suelta la foto en la celda deseada`, 'ph-arrow-fat-right text-blue-400');
          dragHoverTimer = null;
        }, 400);
      }
    });

    pill.addEventListener('dragleave', () => {
      pill.classList.remove('ring-2', 'ring-emerald-400', 'bg-emerald-600/40', 'scale-105');
      if (dragHoverTimer) {
        clearTimeout(dragHoverTimer);
        dragHoverTimer = null;
      }
    });

    pill.addEventListener('drop', (e) => {
      e.stopPropagation();
      e.preventDefault();
      pill.classList.remove('ring-2', 'ring-emerald-400', 'bg-emerald-600/40', 'scale-105');
      if (dragHoverTimer) {
        clearTimeout(dragHoverTimer);
        dragHoverTimer = null;
      }

      if (dragSrcIndex !== null) {
        movePhotoToPage(dragSrcIndex, i);
      }
    });

    container.appendChild(pill);
  }
}

// ==========================================
// 5. EXPORTACIÓN, NUBE Y COMPARTIR
// ==========================================
function initExportModule() {
  // Regenerar máscara de nombre
  const refreshBtn = document.getElementById('btn-refresh-filename');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      const now = new Date();
      const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
      const ext = getActiveExtension();
      const base = state.template && state.template.name ? state.template.name.replace(/\.[^/.]+$/, '') : 'REPORTE_FOTOGRAFICO';
      const code = state.currentProject.code || 'PROY';
      const filenameInput = document.getElementById('export-filename-input');
      if (filenameInput) filenameInput.value = `${code}_${base}_${dateStr}.${ext}`;
      showToast('Nombre actualizado según formato y fecha');
    });
  }

  // Selector de formatos en la vista principal con bloqueo estricto al formato de origen
  document.querySelectorAll('.btn-export-format').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.template) state.template.type = getActiveFormatType();
      const isWord = state.template && state.template.type === 'word';
      const targetFormat = isWord ? 'docx' : 'xlsx';
      const format = btn.dataset.format;
      if (format !== targetFormat) {
        showToast(`Formato bloqueado: El archivo de origen cargado es ${isWord ? 'Word (.docx)' : 'Excel (.xlsx)'}. Solo se permite descargar en su formato original.`, 'ph-lock-key text-amber-400');
        return;
      }
      setModalExportFormat(targetFormat, true);
    });
  });

  // Botón de Descarga Directa: no duplicar el evento si ya tiene onclick en HTML
  const downloadBtn = document.getElementById('btn-download-local');
  if (downloadBtn && !downloadBtn.getAttribute('onclick')) {
    downloadBtn.addEventListener('click', () => {
      handleDirectDownloadNow();
    });
  }

  // Atajos de teclado en el input del modal
  const modalInput = document.getElementById('modal-export-filename-input');
  if (modalInput) {
    modalInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmAndDownloadFromModal();
      } else if (e.key === 'Escape') {
        closeExportNameModal();
      }
    });
  }
  const modalTitle = document.getElementById('modal-export-title-input');
  if (modalTitle) {
    modalTitle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirmAndDownloadFromModal();
      } else if (e.key === 'Escape') {
        closeExportNameModal();
      }
    });
  }
}

// ==========================================
// MODAL DE PERSONALIZACIÓN DE NOMBRE AL DESCARGAR
// ==========================================
function openExportNameModal() {
  if (!state.photos || state.photos.length === 0) {
    showToast('No hay fotografías en la mesa de trabajo para descargar.', 'ph-warning text-amber-400');
    return;
  }

  const modal = document.getElementById('export-name-modal');
  const filenameInput = document.getElementById('modal-export-filename-input');
  const titleInput = document.getElementById('modal-export-title-input');
  const extBadge = document.getElementById('modal-export-ext-badge');
  if (!modal) return;

  const isWord = getActiveFormatType() === 'word';
  const targetExt = getActiveExtension();

  // Tomar el nombre actual de export-filename-input o generar uno inteligente
  let currentName = '';
  const mainExportInput = document.getElementById('export-filename-input');
  if (mainExportInput && mainExportInput.value) {
    currentName = mainExportInput.value.trim();
  }

  if (!currentName) {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const base = state.template.name ? state.template.name.replace(/\.[^/.]+$/, '') : 'REPORTE_FOTOGRAFICO';
    currentName = `${state.currentProject.code || 'PROY'}_${base}_${dateStr}.${targetExt}`;
  }

  // Separar extensión y nombre base asegurando coincidencia 1:1 con el formato subido
  let baseName = currentName.replace(/\.(docx|xlsx|pdf)$/i, '');

  if (filenameInput) filenameInput.value = baseName;
  if (extBadge) extBadge.textContent = `.${targetExt}`;

  // Título del formato
  if (titleInput) {
    titleInput.value = state.template.documentTitle || (state.template.name ? state.template.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ') : 'REGISTRO FOTOGRÁFICO');
  }

  // Sincronizar botones de formato dentro del modal y bloquear el formato no correspondiente
  setModalExportFormat(targetExt, true);

  modal.classList.remove('hidden');

  // Auto-enfocar y seleccionar el texto del nombre para edición inmediata
  setTimeout(() => {
    if (filenameInput) {
      filenameInput.focus();
      filenameInput.select();
    }
  }, 100);
}
window.openExportNameModal = openExportNameModal;

function closeExportNameModal() {
  const modal = document.getElementById('export-name-modal');
  if (modal) modal.classList.add('hidden');
}
window.closeExportNameModal = closeExportNameModal;

function setModalExportFormat(format, updateBadge = true) {
  const isWord = getActiveFormatType() === 'word';
  const targetFormat = getActiveExtension();

  // Si el usuario intenta seleccionar un formato no compatible con el subido, advertir y bloquear
  if (format !== targetFormat && !updateBadge) {
    showToast(`Formato bloqueado: El archivo de origen cargado es ${isWord ? 'Word (.docx)' : 'Excel (.xlsx)'}. Solo se permite descargar en su formato original.`, 'ph-lock-key text-amber-400');
    return;
  }

  const btnDocx = document.getElementById('modal-btn-format-docx');
  const btnXlsx = document.getElementById('modal-btn-format-xlsx');
  const extBadge = document.getElementById('modal-export-ext-badge');

  if (targetFormat === 'docx') {
    if (btnDocx) {
      btnDocx.classList.remove('hidden');
      btnDocx.className = 'py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-default bg-blue-600/20 border-blue-500 text-blue-300';
      btnDocx.title = 'Formato original activo: Word (.docx)';
    }
    if (btnXlsx) {
      btnXlsx.classList.add('hidden');
      btnXlsx.className = 'hidden py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 bg-slate-900 border-slate-800 text-slate-500 opacity-40 cursor-not-allowed';
      btnXlsx.title = 'Bloqueado: La plantilla cargada es Word (.docx)';
    }
    if (updateBadge && extBadge) extBadge.textContent = '.docx';
  } else {
    if (btnXlsx) {
      btnXlsx.classList.remove('hidden');
      btnXlsx.className = 'py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 cursor-default bg-emerald-600/20 border-emerald-500 text-emerald-300';
      btnXlsx.title = 'Formato original activo: Excel (.xlsx)';
    }
    if (btnDocx) {
      btnDocx.classList.add('hidden');
      btnDocx.className = 'hidden py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 bg-slate-900 border-slate-800 text-slate-500 opacity-40 cursor-not-allowed';
      btnDocx.title = 'Bloqueado: La plantilla cargada es Excel (.xlsx)';
    }
    if (updateBadge && extBadge) extBadge.textContent = '.xlsx';
  }

  // Sincronizar botones de formato en la vista principal (ocultar el no correspondiente)
  document.querySelectorAll('.btn-export-format').forEach(b => {
    if (b.dataset.format === targetFormat) {
      b.classList.remove('hidden');
      if (targetFormat === 'xlsx') {
        b.className = 'btn-export-format active p-3 rounded-xl bg-emerald-600/20 border-2 border-emerald-500 text-center font-bold text-emerald-300 cursor-default transition';
      } else {
        b.className = 'btn-export-format active p-3 rounded-xl bg-blue-600/20 border-2 border-blue-500 text-center font-bold text-blue-300 cursor-default transition';
      }
      b.title = `Formato original activo: ${targetFormat.toUpperCase()}`;
    } else {
      b.classList.add('hidden');
      b.className = 'btn-export-format hidden p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-center font-medium text-slate-500 opacity-40 cursor-not-allowed transition';
      b.title = `Bloqueado: La plantilla cargada es ${isWord ? 'Word (.docx)' : 'Excel (.xlsx)'}`;
    }
  });

  const mainFilenameInput = document.getElementById('export-filename-input');
  if (mainFilenameInput && mainFilenameInput.value) {
    let cur = mainFilenameInput.value.trim().replace(/\.(docx|xlsx|pdf)$/i, '');
    mainFilenameInput.value = `${cur}.${targetFormat}`;
  }
}
window.setModalExportFormat = setModalExportFormat;

function appendFilenameTag(tag) {
  const input = document.getElementById('modal-export-filename-input');
  if (!input) return;
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;

  if (tag === 'FECHA') {
    if (!input.value.includes(dateStr)) {
      input.value = `${input.value}_${dateStr}`;
    }
  } else if (tag === 'PROYECTO') {
    const code = state.currentProject.code || 'PROY';
    if (!input.value.startsWith(code)) {
      input.value = `${code}_${input.value}`;
    }
  } else if (tag === 'DILIGENCIADO') {
    if (!input.value.includes('DILIGENCIADO')) {
      input.value = `${input.value}_DILIGENCIADO`;
    }
  }
}
window.appendFilenameTag = appendFilenameTag;

function resetDefaultFilename() {
  const input = document.getElementById('modal-export-filename-input');
  if (!input) return;
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  const base = state.template.name ? state.template.name.replace(/\.[^/.]+$/, '') : 'REPORTE_FOTOGRAFICO';
  input.value = `${state.currentProject.code || 'PROY'}_${base}_${dateStr}`;
}
window.resetDefaultFilename = resetDefaultFilename;

async function confirmAndDownloadFromModal() {
  if (isDownloadingDirectReport) {
    console.warn('Descarga en curso desde modal, bloqueando ejecución duplicada.');
    return;
  }
  isDownloadingDirectReport = true;

  const filenameInput = document.getElementById('modal-export-filename-input');
  const titleInput = document.getElementById('modal-export-title-input');
  const extBadge = document.getElementById('modal-export-ext-badge');

  let rawName = filenameInput ? filenameInput.value.trim() : 'REPORTE_FOTOGRAFICO';
  if (!rawName) rawName = 'REPORTE_FOTOGRAFICO';

  // Sanitizar caracteres prohibidos en nombres de archivos
  rawName = rawName.replace(/[/\\:*?"<>|]/g, '_');
  rawName = rawName.replace(/\.(docx|xlsx|pdf)$/i, '');

  const isWord = getActiveFormatType() === 'word';
  const ext = getActiveExtension();
  const finalFilename = `${rawName}.${ext}`;

  // Actualizar el título de la plantilla si fue modificado
  if (titleInput && titleInput.value.trim()) {
    state.template.documentTitle = titleInput.value.trim();
  }

  // Sincronizar con el input principal de la vista
  const mainExportInput = document.getElementById('export-filename-input');
  if (mainExportInput) mainExportInput.value = finalFilename;

  closeExportNameModal();

  // Ejecutar descarga directa estrictamente en el formato de origen
  try {
    showToast(`Generando y descargando ${finalFilename}...`, 'ph-spinner animate-spin text-blue-400');
    if (ext === 'xlsx') {
      await generateRealExcelDocument(finalFilename, true);
    } else {
      await generateRealWordDocument(finalFilename, true);
    }
    showToast(`¡Reporte descargado exitosamente: ${finalFilename}!`, 'ph-check-circle text-emerald-400');
  } catch (err) {
    console.error('Error al descargar reporte:', err);
    showToast('Error al descargar: ' + (err.message || err), 'ph-x-circle text-red-400');
  } finally {
    setTimeout(() => {
      isDownloadingDirectReport = false;
    }, 2000);
  }
}
window.confirmAndDownloadFromModal = confirmAndDownloadFromModal;

// Helper para atajos de etiquetas en la vista principal
function appendMainFilenameTag(tag) {
  const input = document.getElementById('export-filename-input');
  if (!input) return;
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  const ext = getActiveExtension();
  let base = input.value.replace(/\.(docx|xlsx|pdf)$/i, '');

  if (tag === 'FECHA') {
    if (!base.includes(dateStr)) base = `${base}_${dateStr}`;
  } else if (tag === 'PROYECTO') {
    const code = state.currentProject.code || 'PROY';
    if (!base.startsWith(code)) base = `${code}_${base}`;
  } else if (tag === 'DILIGENCIADO') {
    if (!base.includes('DILIGENCIADO')) base = `${base}_DILIGENCIADO`;
  }
  input.value = `${base}.${ext}`;
}
window.appendMainFilenameTag = appendMainFilenameTag;

function updateDirectDownloadView() {
  const tmplNameElem = document.getElementById('direct-download-template-name');
  const summaryElem = document.getElementById('direct-download-summary');
  const filenameInput = document.getElementById('export-filename-input');
  const galleryElem = document.getElementById('direct-download-gallery-preview');

  const count = (state.photos && state.photos.length) ? state.photos.length : 0;
  if (tmplNameElem) {
    tmplNameElem.textContent = state.template ? (state.template.name || 'Formato Técnico') : 'INVIAS / Formato Técnico';
  }
  if (summaryElem) {
    summaryElem.textContent = `${count} ${count === 1 ? 'fotografía lista' : 'fotografías listas'} para descargar`;
  }

  if (state.template) state.template.type = getActiveFormatType();
  const isWord = state.template && state.template.type === 'word';
  const targetFormat = isWord ? 'docx' : 'xlsx';

  // Sincronizar y bloquear botones de formato según el tipo de archivo cargado (Word -> Word, Excel -> Excel)
  document.querySelectorAll('.btn-export-format').forEach(btn => {
    const fmt = btn.dataset.format;
    if (fmt === targetFormat) {
      btn.classList.remove('hidden', 'opacity-40', 'cursor-not-allowed');
      btn.classList.add('active');
      if (fmt === 'xlsx') {
        btn.className = 'btn-export-format active p-3 rounded-xl bg-emerald-600/20 border-2 border-emerald-500 text-center font-bold text-emerald-300 cursor-default transition';
      } else {
        btn.className = 'btn-export-format active p-3 rounded-xl bg-blue-600/20 border-2 border-blue-500 text-center font-bold text-blue-300 cursor-default transition';
      }
      btn.title = `Formato original activo: ${fmt.toUpperCase()}`;
    } else {
      btn.classList.remove('active');
      btn.classList.add('hidden');
      btn.className = 'btn-export-format hidden p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-center font-medium text-slate-500 opacity-40 cursor-not-allowed transition';
      btn.title = `Bloqueado: La plantilla cargada es ${isWord ? 'Word (.docx)' : 'Excel (.xlsx)'}`;
    }
  });

  // Sincronizar modal también para mantener coherencia 1:1 absoluta
  const modalExtBadge = document.getElementById('modal-export-ext-badge');
  if (modalExtBadge) modalExtBadge.textContent = `.${targetFormat}`;
  const modalDocxBtn = document.getElementById('modal-btn-format-docx');
  const modalXlsxBtn = document.getElementById('modal-btn-format-xlsx');
  if (targetFormat === 'docx') {
    if (modalDocxBtn) modalDocxBtn.classList.remove('hidden');
    if (modalXlsxBtn) modalXlsxBtn.classList.add('hidden');
  } else {
    if (modalXlsxBtn) modalXlsxBtn.classList.remove('hidden');
    if (modalDocxBtn) modalDocxBtn.classList.add('hidden');
  }

  if (filenameInput) {
    let curVal = filenameInput.value ? filenameInput.value.trim() : '';
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const base = state.template && state.template.name ? state.template.name.replace(/\.[^/.]+$/, '') : 'REPORTE_FOTOGRAFICO';
    const code = state.currentProject.code || 'PROY';

    if (!curVal) {
      filenameInput.value = `${code}_${base}_${dateStr}.${targetFormat}`;
    } else {
      curVal = curVal.replace(/\.(docx|xlsx|pdf)$/i, '');
      filenameInput.value = `${curVal}.${targetFormat}`;
    }
  }

  if (galleryElem) {
    if (!state.photos || state.photos.length === 0) {
      galleryElem.innerHTML = '<div class="col-span-full py-4 text-center text-xs text-slate-500">No hay fotos en la mesa de trabajo</div>';
      return;
    }

    galleryElem.innerHTML = state.photos.map((photo, i) => {
      const rot = Number(photo.rotation || 0);
      const rotBadge = rot !== 0
        ? `<span class="bg-blue-600 text-white px-1 py-0.5 rounded text-[9px] font-mono font-bold">⟳ ${rot}°</span>`
        : '';
      const zoomBadge = (photo.scale && photo.scale > 1.05)
        ? `<span class="bg-indigo-600 text-white px-1 py-0.5 rounded text-[9px] font-mono font-bold">${Math.round(photo.scale * 100)}%</span>`
        : '';

      return `
        <div class="bg-slate-900 border border-slate-800 rounded-lg p-1.5 flex flex-col space-y-1">
          <div class="flex items-center justify-between text-[10px]">
            <span class="font-mono text-slate-300 font-bold">Foto #${i + 1}</span>
            <div class="flex items-center gap-1">${rotBadge}${zoomBadge}</div>
          </div>
          <div class="dl-thumb-box w-full aspect-[4/3] bg-white rounded overflow-hidden relative" data-idx="${i}">
            <img src="${photo.url}" alt="${photo.title || ('Foto #' + (i + 1))}" class="pointer-events-none" />
          </div>
          <p class="text-[9px] text-slate-400 truncate" title="${photo.note || photo.title}">
            ${photo.note ? photo.note : (photo.title || 'Evidencia lista')}
          </p>
        </div>
      `;
    }).join('');
    galleryElem.querySelectorAll('.dl-thumb-box').forEach(box => {
      const ph = state.photos[Number(box.dataset.idx)];
      if (ph) layoutPhotoInBox(box.querySelector('img'), ph, box);
    });
  }
}
window.updateDirectDownloadView = updateDirectDownloadView;

let isDownloadingDirectReport = false;
async function handleDirectDownloadNow() {
  if (isDownloadingDirectReport) {
    console.warn('Descarga en curso, bloqueando ejecución duplicada.');
    return;
  }
  isDownloadingDirectReport = true;

  if (!state.photos || state.photos.length === 0) {
    showToast('No hay fotografías en la mesa de trabajo para descargar.', 'ph-warning text-amber-400');
    isDownloadingDirectReport = false;
    return;
  }

  if (state.template) state.template.type = getActiveFormatType();
  const isWord = state.template && state.template.type === 'word';
  const selectedFormat = isWord ? 'docx' : 'xlsx';

  const filenameInput = document.getElementById('export-filename-input');
  let filename = filenameInput ? filenameInput.value.trim() : '';

  if (!filename) {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const base = state.template && state.template.name ? state.template.name.replace(/\.[^/.]+$/, '') : 'REPORTE_FOTOGRAFICO';
    const code = state.currentProject.code || 'PROY';
    filename = `${code}_${base}_${dateStr}.${selectedFormat}`;
  }

  filename = filename.replace(/[/\\:*?"<>|]/g, '_');
  filename = filename.replace(/\.(docx|xlsx|pdf)$/i, '');
  filename = `${filename}.${selectedFormat}`;
  if (filenameInput) filenameInput.value = filename;

  showToast(`Generando y descargando ${filename}...`, 'ph-spinner animate-spin text-blue-400');

  try {
    if (selectedFormat === 'xlsx') {
      await generateRealExcelDocument(filename, true);
    } else {
      await generateRealWordDocument(filename, true);
    }
    showToast(`¡Reporte descargado exitosamente: ${filename}!`, 'ph-check-circle text-emerald-400');
  } catch (err) {
    console.error('Error al descargar reporte:', err);
    showToast('Error al descargar: ' + (err.message || err), 'ph-x-circle text-red-400');
  } finally {
    setTimeout(() => {
      isDownloadingDirectReport = false;
    }, 2000);
  }
}
window.handleDirectDownloadNow = handleDirectDownloadNow;

// ==========================================
// GENERACIÓN NATIVA DE DOCUMENTOS VÁLIDOS
// ==========================================
let cachedLogoImg = null;
let cachedLogoUrl = null;

function getLoadedLogoImage() {
  const url = state.config.logoUrl;
  if (!url) return Promise.resolve(null);
  if (cachedLogoImg && cachedLogoUrl === url && cachedLogoImg.complete && cachedLogoImg.naturalWidth > 0) {
    return Promise.resolve(cachedLogoImg);
  }
  return new Promise((resolve) => {
    const lImg = new Image();
    if (url.startsWith('http://') || url.startsWith('https://')) {
      lImg.crossOrigin = 'anonymous';
    }
    lImg.onload = () => {
      cachedLogoImg = lImg;
      cachedLogoUrl = url;
      resolve(lImg);
    };
    lImg.onerror = () => {
      console.warn('No se pudo cargar la imagen del logo para exportación:', url);
      resolve(null);
    };
    lImg.src = url;
    setTimeout(() => resolve(null), 1200);
  });
}

function fitCanvasText(ctx, text, maxWidth) {
  if (!text) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 3 && ctx.measureText(truncated + '...').width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + '...';
}

function drawLogoOnCanvas(ctx, logoImg, x, y, w, h, opacity, scale) {
  ctx.save();
  ctx.globalAlpha = opacity;

  // Fondo sutil con bordes redondeados para excelente contraste y legibilidad
  ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
  const radius = Math.round(6 * scale);
  const p = Math.round(4 * scale);
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x - p, y - p, w + p * 2, h + p * 2, radius);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    ctx.fillRect(x - p, y - p, w + p * 2, h + p * 2);
  }

  if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
    ctx.drawImage(logoImg, x, y, w, h);
  } else {
    ctx.fillStyle = '#1e40af';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.max(10, Math.round(h * 0.38))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LOGO', x + w / 2, y + h / 2);
  }
  ctx.restore();
}

// ==========================================
// MODELO ÚNICO DE AJUSTE DE FOTO (vista previa = exportación)
// ==========================================
// Calcula cómo se dibuja una foto dentro de un marco W×H a partir de sus ajustes:
// rotación libre (grados), espejo H/V, escala de usuario, modo fit/cover, bloqueo de
// proporciones y desplazamiento. Lo usan la mesa, el modal de ajuste y el render de
// exportación, para que lo que se ve sea exactamente lo que sale en Word/Excel.
function computePhotoLayout(photo, W, H, nw, nh) {
  nw = nw || W; nh = nh || H;
  const rot = Number(photo.rotation || 0);
  const rad = (rot * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const sn = Math.abs(Math.sin(rad));
  const userScale = photo.scale !== undefined ? Number(photo.scale) : 1.0;
  const lockAspect = photo.lockAspect !== false;
  const mode = photo.fitMode || 'fit';
  let w, h, comp;
  if (!lockAspect) {
    // Proporciones libres: la foto se estira para llenar el marco exacto
    w = W; h = H;
    comp = Math.min(W / (w * c + h * sn), H / (w * sn + h * c));
  } else if (mode === 'cover') {
    const s0 = Math.max(W / nw, H / nh);
    w = nw * s0; h = nh * s0;
    // Escala mínima para que la foto rotada siga cubriendo todo el marco
    comp = Math.max((W * c + H * sn) / w, (W * sn + H * c) / h);
  } else {
    const s0 = Math.min(W / nw, H / nh);
    w = nw * s0; h = nh * s0;
    // Escala para que la foto rotada quepa completa en el marco
    comp = Math.min(W / (w * c + h * sn), H / (w * sn + h * c));
  }
  const k = comp * userScale;
  return {
    drawW: w * k,
    drawH: h * k,
    tx: (photo.offsetX || 0) * W,
    ty: (photo.offsetY || 0) * H,
    rot,
    sx: photo.flipH ? -1 : 1,
    sy: photo.flipV ? -1 : 1
  };
}
window.computePhotoLayout = computePhotoLayout;

// ¿La foto tiene algún ajuste que obligue a re-renderizarla?
function photoHasAdjustments(photo) {
  const rot = ((Number(photo.rotation || 0) % 360) + 360) % 360;
  return rot !== 0 || !!photo.flipH || !!photo.flipV || photo.lockAspect === false ||
    (photo.fitMode || 'fit') !== 'fit' || Math.abs((photo.scale !== undefined ? photo.scale : 1) - 1) > 0.01 ||
    Math.abs(photo.offsetX || 0) > 0.001 || Math.abs(photo.offsetY || 0) > 0.001;
}
window.photoHasAdjustments = photoHasAdjustments;

// Aplica el modelo de ajuste a un <img> dentro de una caja (vista previa en la mesa y el modal)
function applyPhotoLayoutToImg(img, photo, boxW, boxH) {
  const run = () => {
    const L = computePhotoLayout(photo, boxW, boxH, img.naturalWidth, img.naturalHeight);
    img.style.maxWidth = 'none';
    img.style.maxHeight = 'none';
    img.style.objectFit = 'fill';
    img.style.width = `${L.drawW}px`;
    img.style.height = `${L.drawH}px`;
    img.style.position = 'absolute';
    img.style.left = `${(boxW - L.drawW) / 2}px`;
    img.style.top = `${(boxH - L.drawH) / 2}px`;
    img.style.transformOrigin = 'center center';
    img.style.transform = `translate(${L.tx}px, ${L.ty}px) rotate(${L.rot}deg) scale(${L.sx}, ${L.sy})`;
  };
  if (img.complete && img.naturalWidth) run(); else img.addEventListener('load', run, { once: true });
}
window.applyPhotoLayoutToImg = applyPhotoLayoutToImg;

// Igual que applyPhotoLayoutToImg pero mide la caja en vivo (sirve aunque la vista esté oculta al renderizar)
function layoutPhotoInBox(img, photo, box) {
  const relayout = () => {
    if (box.clientWidth > 0 && box.clientHeight > 0) applyPhotoLayoutToImg(img, photo, box.clientWidth, box.clientHeight);
  };
  relayout();
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(relayout);
    ro.observe(box);
  }
}
window.layoutPhotoInBox = layoutPhotoInBox;

async function prepareStampedImageBytes(photo) {
  return new Promise((resolve) => {
    let finished = false;
    const safeResolve = (res) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(res);
    };

    const timer = setTimeout(() => {
      console.warn('Timeout al cargar imagen para export:', photo ? photo.title : 'foto');
      safeResolve({
        bytes: getFallback1x1Png(),
        width: 1600,
        height: 1200,
        aspectRatio: 4 / 3
      });
    }, 12000);

    const img = new Image();
    
    // Sólo crossOrigin si es URL http/https externa. Para blob: y data: NUNCA poner crossOrigin (evita bloqueos CORS en Chrome).
    if (photo.url && (photo.url.startsWith('http://') || photo.url.startsWith('https://'))) {
      img.crossOrigin = 'anonymous';
    }

    const renderWatermarkAndResolve = async () => {
      try {
        const naturalW = img.naturalWidth || 1200;
        const naturalH = img.naturalHeight || 900;

        const shouldStamp = (photo.source === 'camera') && (photo.hasWatermark === true) && (state.config.masterToggle === true);
        // RQ-19: con "tamaño uniforme" activo todas las fotos pasan por el mismo lienzo 4:3
        const uniform = state.config.uniformPhotoSize !== false;

        // Sin ajustes, sin estampado y sin tamaño uniforme: entregar los bytes originales intactos
        if (!photoHasAdjustments(photo) && !shouldStamp && !uniform) {
          if (photo.url && photo.url.startsWith('data:')) {
            const rawBytes = dataUrlToUint8Array(photo.url);
            if (rawBytes) {
              safeResolve({
                bytes: rawBytes,
                width: naturalW,
                height: naturalH,
                aspectRatio: naturalW / naturalH
              });
              return;
            }
          } else if (photo.url && photo.url.startsWith('blob:')) {
            try {
              const res = await fetch(photo.url);
              const ab = await res.arrayBuffer();
              safeResolve({
                bytes: new Uint8Array(ab),
                width: naturalW,
                height: naturalH,
                aspectRatio: naturalW / naturalH
              });
              return;
            } catch (e) {
              console.warn('Fallback al leer blob:', e);
            }
          }
        }

        // Lienzo técnico 4:3 (1600×1200): mismo tamaño para todas las fotos del informe
        const canvasW = 1600;
        const canvasH = 1200;
        const L = computePhotoLayout(photo, canvasW, canvasH, naturalW, naturalH);

        const canvas = document.createElement('canvas');
        canvas.width = canvasW;
        canvas.height = canvasH;
        const ctx = canvas.getContext('2d');

        // Limpieza de fondo: blanco neutral técnico si queda margen
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvasW, canvasH);

        ctx.save();
        ctx.translate(canvasW / 2 + L.tx, canvasH / 2 + L.ty);
        ctx.rotate((L.rot * Math.PI) / 180);
        ctx.scale(L.sx, L.sy);

        try {
          ctx.drawImage(img, -L.drawW / 2, -L.drawH / 2, L.drawW, L.drawH);
        } catch (e) {
          console.warn('Error al dibujar imagen en canvas, usando fallback:', e);
          drawTechnicalFallback(ctx, canvas, photo);
        }
        ctx.restore();

        // Cargar imagen del logo si está activo
        let logoImg = null;
        if (state.config.showLogo && state.config.logoUrl) {
          try {
            logoImg = await getLoadedLogoImage();
          } catch (e) {
            console.warn(e);
          }
        }

        // REGLA ESTRICTA DE ESTAMPADO:
        // Sólo si la foto fue tomada por la app y con switch activo
        if (shouldStamp) {
          const cfg = photo.watermarkConfig || state.config;
          const scale = canvas.height / 720;
          const wmPos = cfg.watermarkPosition || 'bottom-full';
          const fontFamily = cfg.fontFamily || 'sans-serif';
          const fontSizeChoice = cfg.fontSize || 'normal';
          const textColor = cfg.textColor || '#FFFFFF';
          const textOpacity = cfg.textOpacity !== undefined ? Number(cfg.textOpacity) : 1.0;
          const bgOpacity = cfg.opacity !== undefined ? Number(cfg.opacity) : 0.65;
          const showLocation = cfg.showLocation !== undefined ? cfg.showLocation : true;
          const department = photo.department || cfg.department || 'Antioquia';
          const municipality = photo.municipality || cfg.municipality || 'Medellín';
          const showDate = cfg.showDate !== undefined ? cfg.showDate : true;
          const dateFormat = cfg.dateFormat || 'DD/MM/YYYY_24H';
          const showGps = cfg.showGps !== undefined ? cfg.showGps : true;
          const gpsFormat = photo.gpsFormat || cfg.gpsFormat || 'CTM12';
          const showMap = cfg.showMap !== undefined ? cfg.showMap : true;
          const mapZoom = photo.mapZoom || cfg.mapZoom || 16;

          // Tipografía y escalado de fuentes
          let canvasFont = 'sans-serif';
          if (fontFamily === 'monospace') canvasFont = 'monospace';
          else if (fontFamily === 'condensed') canvasFont = 'Impact, "Arial Narrow", sans-serif';
          else if (fontFamily === 'serif') canvasFont = 'Georgia, serif';

          let sizeMultiplier = 1.0;
          if (fontSizeChoice === 'small') sizeMultiplier = 0.85;
          else if (fontSizeChoice === 'large') sizeMultiplier = 1.15;

          // Geometría del bloque agrupado (conserva todos los textos reunidos en una tarjeta o cintillo)
          let bannerX = 0;
          let bannerY = 0;
          let bannerW = canvas.width;
          let bannerH = Math.max(120, Math.round(canvas.height * 0.16));
          let isCard = false;

          const margin = Math.round(24 * scale);
          if (wmPos === 'bottom-left') {
            bannerW = Math.round(canvas.width * 0.68);
            bannerH = Math.max(130, Math.round(canvas.height * 0.175));
            bannerX = margin;
            bannerY = canvas.height - bannerH - margin;
            isCard = true;
          } else if (wmPos === 'bottom-right') {
            bannerW = Math.round(canvas.width * 0.68);
            bannerH = Math.max(130, Math.round(canvas.height * 0.175));
            bannerX = canvas.width - bannerW - margin;
            bannerY = canvas.height - bannerH - margin;
            isCard = true;
          } else if (wmPos === 'top-left') {
            bannerW = Math.round(canvas.width * 0.68);
            bannerH = Math.max(130, Math.round(canvas.height * 0.175));
            bannerX = margin;
            bannerY = margin;
            isCard = true;
          } else if (wmPos === 'top-right') {
            bannerW = Math.round(canvas.width * 0.68);
            bannerH = Math.max(130, Math.round(canvas.height * 0.175));
            bannerX = canvas.width - bannerW - margin;
            bannerY = margin;
            isCard = true;
          } else {
            // 'bottom-full'
            bannerW = canvas.width;
            bannerH = Math.max(120, Math.round(canvas.height * 0.16));
            bannerX = 0;
            bannerY = canvas.height - bannerH;
            isCard = false;
          }

          // Dibujar fondo de tarjeta o cintillo
          ctx.save();
          ctx.fillStyle = `rgba(15, 23, 42, ${bgOpacity})`;
          const cardRadius = Math.round(12 * scale);
          if (isCard) {
            if (ctx.roundRect) {
              ctx.beginPath();
              ctx.roundRect(bannerX, bannerY, bannerW, bannerH, cardRadius);
              ctx.fill();
              ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
              ctx.lineWidth = Math.max(1, Math.round(1.5 * scale));
              ctx.stroke();
            } else {
              ctx.fillRect(bannerX, bannerY, bannerW, bannerH);
            }
            // Línea superior decorativa azul
            ctx.fillStyle = '#2563eb';
            if (ctx.roundRect) {
              ctx.beginPath();
              ctx.roundRect(bannerX, bannerY, bannerW, Math.max(3, Math.round(4 * scale)), [cardRadius, cardRadius, 0, 0]);
              ctx.fill();
            } else {
              ctx.fillRect(bannerX, bannerY, bannerW, Math.max(3, Math.round(4 * scale)));
            }
          } else {
            // Cintillo completo inferior
            ctx.fillRect(bannerX, bannerY, bannerW, bannerH);
            ctx.fillStyle = '#2563eb';
            ctx.fillRect(bannerX, bannerY, bannerW, Math.max(3, Math.round(4 * scale)));
          }
          ctx.restore();

          const padding = Math.round(16 * scale);

          // Mini-mapa dentro del bloque agrupado (Dual: Procedural Vectorial o Tile Cartográfico)
          let mapW = 0;
          if (showMap) {
            mapW = Math.round(bannerH - padding * 2);
            const mapX = bannerX + padding;
            const mapY = bannerY + padding;

            ctx.save();
            ctx.translate(mapX, mapY);

            const mapImg = document.getElementById('overlay-map-img');
            if (mapImg && mapImg.complete && mapImg.naturalWidth > 0 && !mapImg.classList.contains('hidden')) {
              try {
                ctx.drawImage(mapImg, 0, 0, mapW, mapW);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
                ctx.lineWidth = 1;
                ctx.strokeRect(0, 0, mapW, mapW);
              } catch (e) {
                drawProceduralMiniMap(ctx, photo.lat || cfg.lat || 6.2442, photo.lon || cfg.lon || -75.5812, mapZoom, mapW, mapW);
              }
            } else {
              drawProceduralMiniMap(ctx, photo.lat || cfg.lat || 6.2442, photo.lon || cfg.lon || -75.5812, mapZoom, mapW, mapW);
            }

            // Etiqueta de Zoom en el mini-mapa
            const zoomBadgeH = Math.round(14 * scale);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(0, mapW - zoomBadgeH, mapW, zoomBadgeH);
            ctx.fillStyle = '#60a5fa';
            ctx.font = `bold ${Math.max(8, Math.round(9 * scale))}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`Z${mapZoom}`, mapW / 2, mapW - zoomBadgeH / 2);

            // Marcador GPS (Punto rojo con aro blanco)
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc(mapW / 2, (mapW - zoomBadgeH) / 2, Math.max(4, Math.round(5 * scale)), 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = Math.max(1, Math.round(1.5 * scale));
            ctx.stroke();
            ctx.restore();
          }

          // Parámetros y Dimensiones del Logo
          const logoPos = cfg.logoPosition || 'top-right';
          const logoBaseH = Number(cfg.logoSize) || 44;
          const logoTargetH = Math.round(logoBaseH * scale);
          let logoTargetW = Math.round(logoTargetH * 2.2);
          if (logoImg && logoImg.naturalWidth && logoImg.naturalHeight) {
            logoTargetW = Math.round(logoTargetH * (logoImg.naturalWidth / logoImg.naturalHeight));
          }
          const logoOpacity = cfg.logoOpacity !== undefined ? Number(cfg.logoOpacity) : 0.9;

          // Delimitación de texto para CERO SOLAPAMIENTO
          let textStartX = bannerX + padding + (mapW > 0 ? mapW + padding : 0);
          let textEndX = bannerX + bannerW - padding;

          if (cfg.showLogo) {
            if (logoPos === 'banner-left') {
              const logoX = textStartX;
              const logoY = bannerY + Math.round((bannerH - logoTargetH) / 2);
              drawLogoOnCanvas(ctx, logoImg, logoX, logoY, logoTargetW, logoTargetH, logoOpacity, scale);
              textStartX = logoX + logoTargetW + padding;
            } else if (logoPos === 'banner-right') {
              const logoX = textEndX - logoTargetW;
              const logoY = bannerY + Math.round((bannerH - logoTargetH) / 2);
              drawLogoOnCanvas(ctx, logoImg, logoX, logoY, logoTargetW, logoTargetH, logoOpacity, scale);
              textEndX = logoX - padding;
            } else {
              // Posición flotante con salvaguarda anti-solapamiento:
              // Si el logo está en la misma esquina que la tarjeta agrupada, desplazarlo para evitar sobreposición
              let floatX = canvas.width - padding - logoTargetW;
              let floatY = padding;

              if (logoPos === 'top-left') {
                floatX = padding;
                floatY = (wmPos === 'top-left') ? bannerY + bannerH + padding : padding;
              } else if (logoPos === 'top-center') {
                floatX = Math.round((canvas.width - logoTargetW) / 2);
                floatY = padding;
              } else if (logoPos === 'bottom-right') {
                floatX = canvas.width - padding - logoTargetW;
                floatY = (wmPos === 'bottom-right' || wmPos === 'bottom-full') ? bannerY - padding - logoTargetH : canvas.height - padding - logoTargetH;
              } else {
                // top-right
                floatX = canvas.width - padding - logoTargetW;
                floatY = (wmPos === 'top-right') ? bannerY + bannerH + padding : padding;
              }

              drawLogoOnCanvas(ctx, logoImg, floatX, floatY, logoTargetW, logoTargetH, logoOpacity, scale);
            }
          }

          // Ancho máximo disponible para los textos dentro del bloque
          const maxTextW = Math.max(100, textEndX - textStartX);

          // Color unificado para todos los textos del estampado (por defecto blanco #FFFFFF)
          const activeTextColor = textColor || '#FFFFFF';

          // Preparar líneas activas de metadatos agrupados
          const lines = [];

          // 1. Título del Proyecto
          lines.push({
            text: state.currentProject.name.toUpperCase(),
            font: `bold ${Math.round(15 * scale * sizeMultiplier)}px ${canvasFont}`,
            weight: 'bold'
          });

          // 2. Municipio y Departamento
          if (showLocation) {
            lines.push({
              text: `📍 UBICACIÓN: ${municipality}, ${department}`,
              font: `bold ${Math.round(12.5 * scale * sizeMultiplier)}px ${canvasFont}`,
              weight: 'bold'
            });
          }

          // 3. Fecha / Hora
          if (showDate) {
            lines.push({
              text: getFormattedDateTime(dateFormat),
              font: `${Math.round(12 * scale * sizeMultiplier)}px ${canvasFont}`,
              weight: 'normal'
            });
          }

          // 4. Coordenadas GPS (CTM12, EPSG:3116, UTM, etc.)
          if (showGps) {
            const coordsStr = photo.coords || getFormattedCoordinates(gpsFormat);
            lines.push({
              text: coordsStr,
              font: `bold ${Math.round(12 * scale * sizeMultiplier)}px ${canvasFont}`,
              weight: 'bold'
            });
          }

          // 5. Nota de referencia de campo
          if (photo.note) {
            lines.push({
              text: `"${photo.note}"`,
              font: `italic ${Math.round(11 * scale * sizeMultiplier)}px ${canvasFont}`,
              weight: 'normal'
            });
          }

          // Renderizar líneas verticalmente espaciadas con la opacidad y color configurados
          ctx.save();
          ctx.globalAlpha = textOpacity;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';

          const lineCount = lines.length;
          const usableH = bannerH - padding * 1.5;
          const lineStep = usableH / Math.max(1, lineCount);

          lines.forEach((line, lIdx) => {
            const lineY = bannerY + padding * 0.8 + lineStep * (lIdx + 0.5);
            ctx.font = line.font;
            ctx.fillStyle = activeTextColor;
            ctx.fillText(fitCanvasText(ctx, line.text, maxTextW), textStartX, lineY);
          });
          ctx.restore();
        }

        try {
          const dUrl = canvas.toDataURL('image/jpeg', 0.92);
          const raw = dataUrlToUint8Array(dUrl);
          if (raw) {
            safeResolve({
              bytes: raw,
              width: canvasW,
              height: canvasH,
              aspectRatio: canvasW / canvasH
            });
            return;
          }
        } catch (toDataUrlErr) {
          console.warn('toDataURL no disponible, usando toBlob fallback:', toDataUrlErr);
        }

        if (typeof canvas.toBlob === 'function') {
          canvas.toBlob((blob) => {
            if (!blob) {
              safeResolve({
                bytes: getFallback1x1Png(),
                width: canvasW,
                height: canvasH,
                aspectRatio: canvasW / canvasH
              });
              return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
              safeResolve({
                bytes: new Uint8Array(reader.result),
                width: canvasW,
                height: canvasH,
                aspectRatio: canvasW / canvasH
              });
            };
            reader.readAsArrayBuffer(blob);
          }, 'image/jpeg', 0.92);
        }
      } catch (err) {
        console.error('Error procesando imagen para estampa:', err);
        safeResolve({
          bytes: getFallback1x1Png(),
          width: 1600,
          height: 1200,
          aspectRatio: 4 / 3
        });
      }
    };

    img.onload = renderWatermarkAndResolve;
    img.onerror = () => {
      console.warn('img.onerror en prepareStampedImageBytes para', photo.url);
      const canvas = document.createElement('canvas');
      canvas.width = 1600;
      canvas.height = 1200;
      const ctx = canvas.getContext('2d');
      drawTechnicalFallback(ctx, canvas, photo);
      try {
        const dUrl = canvas.toDataURL('image/jpeg', 0.90);
        safeResolve({ bytes: dataUrlToUint8Array(dUrl) || getFallback1x1Png(), width: 1600, height: 1200, aspectRatio: 4 / 3 });
      } catch (_) {
        safeResolve({ bytes: getFallback1x1Png(), width: 1600, height: 1200, aspectRatio: 4 / 3 });
      }
    };

    img.src = photo.url;
    if (img.complete && img.naturalWidth > 0) {
      renderWatermarkAndResolve();
    }
  });
}

function drawTechnicalFallback(ctx, canvas, photo) {
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(150, 150, canvas.width - 300, canvas.height - 300);
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 2;
  ctx.strokeRect(150, 150, canvas.width - 300, canvas.height - 300);

  ctx.fillStyle = '#60a5fa';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('EVIDENCIA FOTOGRÁFICA', canvas.width / 2, 270);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(photo.title || 'Foto de Inspección', canvas.width / 2, 320);
}

function getFallback1x1Png() {
  return new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,0,0,0,10,73,68,65,84,120,156,99,0,1,0,0,5,0,1,13,10,45,180,0,0,0,0,73,69,78,68,174,66,96,130]);
}

async function generateRealWordDocument(filename, triggerDownload = true) {
  try {
    if (!window.docx && !window.JSZip) {
      showToast('Error: Librerías de Word no disponibles', 'ph-x-circle text-red-400');
      return;
    }

    if (!state.photos || state.photos.length === 0) {
      showToast('No hay fotografías en la mesa de trabajo para exportar.', 'ph-warning text-amber-400');
      return;
    }

    showToast('Procesando imágenes en alta resolución...', 'ph-spinner animate-spin text-blue-400');

    const processedImages = [];
    for (let i = 0; i < state.photos.length; i++) {
      const imgData = await prepareStampedImageBytes(state.photos[i]);
      processedImages.push({
        photo: state.photos[i],
        bytes: imgData.bytes,
        width: imgData.width,
        height: imgData.height,
        aspectRatio: imgData.aspectRatio,
        num: i + 1
      });
    }

    // SI EL USUARIO CARGÓ SU PROPIA PLANTILLA WORD (.docx):
    // INYECTAR DIRECTAMENTE EN SU FORMATO SIN TOCAR LOGOS, ENCABEZADOS NI TEXTOS
    const isWord = getActiveFormatType() === 'word';
    if (state.template.hasUserTemplate && state.template.rawBuffer && isWord) {
      await injectPhotosIntoUserDocx(state.template.rawBuffer, processedImages, filename);
      return;
    }

    // SI ES DEMO O NO CARGÓ PLANTILLA PROPIA:
    // GENERAR CUADRÍCULA LIMPIA CON SÓLO LAS FOTOS (SIN TEXTOS ADICIONALES NI FIRMAS)
    await generateCleanDemoWordDocument(processedImages, filename, triggerDownload);
  } catch (err) {
    console.error('Error al generar Word:', err);
    showToast('Error al generar Word: ' + (err.message || err), 'ph-x-circle text-red-400');
  }
}

async function injectPhotosIntoUserDocx(rawBuffer, processedImages, filename) {
  try {
    showToast('Inyectando fotografías directamente en tu plantilla...', 'ph-gear text-indigo-400');

    const zip = await window.JSZip.loadAsync(rawBuffer);

    // 1. Proteger estrictamente membretes y logos en Encabezados y Pies de página
    const protectedMedia = new Set();
    const relRegex = /<Relationship[^>]+Id="([^"]+)"[^>]+Target="([^"]+)"[^>]*>/g;

    for (const f of Object.keys(zip.files)) {
      if ((f.startsWith('word/_rels/header') || f.startsWith('word/_rels/footer')) && f.endsWith('.rels')) {
        const xml = await zip.file(f).async('text');
        let match;
        while ((match = relRegex.exec(xml)) !== null) {
          let target = match[2];
          if (target.startsWith('../')) target = target.substring(3);
          if (target.startsWith('media/')) target = 'word/' + target;
          else if (!target.startsWith('word/media/')) target = 'word/media/' + target.split('/').pop();
          protectedMedia.add(target);
        }
      }
    }

    // 2. Leer document.xml y document.xml.rels
    let docXmlStr = await zip.file('word/document.xml').async('text');
    let relsXmlStr = await zip.file('word/_rels/document.xml.rels').async('text');

    // Asegurar compatibilidad MIME para jpeg en [Content_Types].xml
    if (zip.file('[Content_Types].xml')) {
      let ctStr = await zip.file('[Content_Types].xml').async('text');
      if (!ctStr.includes('Extension="jpeg"')) {
        ctStr = ctStr.replace('</Types>', '<Default Extension="jpeg" ContentType="image/jpeg"/></Types>');
        zip.file('[Content_Types].xml', ctStr);
      }
    }

    // Mapear IDs de relación de document.xml.rels
    const docRels = {};
    let rMatch;
    while ((rMatch = relRegex.exec(relsXmlStr)) !== null) {
      let target = rMatch[2];
      if (target.startsWith('../')) target = target.substring(3);
      if (!target.startsWith('word/')) {
        if (target.startsWith('media/')) target = 'word/' + target;
        else target = 'word/' + target;
      }
      docRels[rMatch[1]] = target;
    }

    // 3. Inspeccionar tablas en document.xml y blindar LOGOS de los SLOTS DE FOTOS
    const tblRegex = /<w:tbl[\s\S]*?<\/w:tbl>/g;
    const tables = docXmlStr.match(tblRegex) || [];

    const photoSlots = [];
    let mainPhotoTable = null;
    let mainTableIdx = -1;

    tables.forEach((tbl, tIdx) => {
      const rowRegex = /<w:tr[\s\S]*?<\/w:tr>/g;
      const rows = tbl.match(rowRegex) || [];

      rows.forEach((row, rIdx) => {
        const rowText = row.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        const isHeaderRow = (rIdx <= 3) && /REV\.|FORMATO|CÓDIGO|VERSIÓN|FECHA DE ELABORACIÓN|AUTOVÍA|NIT|EMPRESA|CONSORCIO|S\.A\.S|S\.A\.|REGISTRO FOTOGRÁFICO|HOJA \d|PÁGINA/i.test(rowText);

        const drawingRegex = /<w:drawing[\s\S]*?<\/w:drawing>/g;
        const drawings = row.match(drawingRegex) || [];

        drawings.forEach((dw) => {
          const blipMatch = dw.match(/<a:blip[^>]+r:embed="([^"]+)"/);
          const extentMatch = dw.match(/<wp:extent[^>]+cx="(\d+)"[^>]+cy="(\d+)"/);
          if (blipMatch) {
            const rId = blipMatch[1];
            const target = docRels[rId];
            const cx = extentMatch ? parseInt(extentMatch[1]) : 0;
            const cy = extentMatch ? parseInt(extentMatch[2]) : 0;

            // Protección estricta: Si está en fila de membrete o sus dimensiones son de logo
            const isLogo = isHeaderRow || protectedMedia.has(target) || (cx < 1800000 && cy < 1200000 && rIdx <= 2);

            if (isLogo) {
              protectedMedia.add(target);
            } else {
              photoSlots.push({ tIdx, rIdx, rId, target, cx, cy, origDw: dw });
              mainPhotoTable = tbl;
              mainTableIdx = tIdx;
            }
          }
        });
      });
    });

    const now = Date.now();

    // Función para actualizar contador de páginas únicamente en la fila de conteo (ej. "1 de 1" -> "2 de 3")
    function updatePageCounter(tblXml, curPage, maxPages) {
      const rowRegex = /<w:tr[\s\S]*?<\/w:tr>/g;
      return tblXml.replace(rowRegex, (rowXml) => {
        if (/<w:t[^>]*>\s*de\s*<\/w:t>/i.test(rowXml)) {
          return rowXml.replace(/(<w:t[^>]*>)\d+(<\/w:t>[\s\S]*?<w:t[^>]*>\s*de\s*<\/w:t>[\s\S]*?<w:t[^>]*>)\d+(<\/w:t>)/,
            `$1${curPage}$2${maxPages}$3`);
        }
        return rowXml;
      });
    }

    // CASO A: La plantilla tiene slots gráficos existentes (en una o múltiples tablas)
    if (photoSlots.length > 0) {
      // TAMAÑO 100% UNIFORME: Tomar referencia de tamaño de un slot válido
      const validSlot = photoSlots.find(s => s.cx > 500000 && s.cy > 500000);
      const standardCx = validSlot ? validSlot.cx : 2800000;
      const standardCy = validSlot ? validSlot.cy : 2100000;

      const initialFilled = Math.min(photoSlots.length, processedImages.length);

      // Inyectar fielmente cada foto en su respectivo slot a lo largo de TODO el documento
      for (let i = 0; i < initialFilled; i++) {
        const slot = photoSlots[i];
        const imgItem = processedImages[i];

        const cellAR = standardCx / standardCy;
        const imgAR = imgItem.aspectRatio || (imgItem.width / imgItem.height) || cellAR;
        let finalCx = standardCx;
        let finalCy = standardCy;
        if (imgAR >= cellAR) {
          finalCx = standardCx;
          finalCy = Math.max(100000, Math.round(standardCx / imgAR));
        } else {
          finalCy = standardCy;
          finalCx = Math.max(100000, Math.round(standardCy * imgAR));
        }

        const newImgFileName = `user_photo_${now}_s${i + 1}.jpeg`;
        zip.file(`word/media/${newImgFileName}`, imgItem.bytes);
        if (slot.target) {
          zip.file(slot.target, imgItem.bytes);
        }

        const newRId = `rId_photo_${now}_s${i + 1}`;
        const newRel = `<Relationship Id="${newRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${newImgFileName}"/>`;
        relsXmlStr = relsXmlStr.replace('</Relationships>', `${newRel}\n</Relationships>`);

        let newDw = slot.origDw;
        newDw = newDw.replace(`r:embed="${slot.rId}"`, `r:embed="${newRId}"`);
        if (slot.cx && slot.cy) {
          newDw = newDw.replace(new RegExp(`cx="${slot.cx}"`, 'g'), `cx="${finalCx}"`);
          newDw = newDw.replace(new RegExp(`cy="${slot.cy}"`, 'g'), `cy="${finalCy}"`);
        }
        newDw = newDw.replace(/<wp:extent\s+cx="\d+"\s+cy="\d+"/g, `<wp:extent cx="${finalCx}" cy="${finalCy}"`);
        newDw = newDw.replace(/<a:ext\s+cx="\d+"\s+cy="\d+"/g, `<a:ext cx="${finalCx}" cy="${finalCy}"`);
        // ELIMINAR CUALQUIER rot="..." o VML rotation para evitar que Word rote doblemente la foto ya renderizada
        newDw = newDw.replace(/\s+rot="[^"]*"/g, '');
        newDw = newDw.replace(/rotation:\s*[^;"]*;?/g, '');

        // Reemplazar la definición de dibujo directamente en document.xml
        docXmlStr = docXmlStr.replace(slot.origDw, newDw);
      }

      // SI HAY MÁS FOTOS QUE LOS ESPACIOS ORIGINALES: CLONAR EL FORMATO COMPLETO EN HOJAS NUEVAS
      if (processedImages.length > photoSlots.length && mainPhotoTable) {
        const remainingPhotos = processedImages.slice(photoSlots.length);
        const slotsInMainTable = photoSlots.filter(s => s.tIdx === mainTableIdx);
        const slotsPerClonedPage = slotsInMainTable.length > 0 ? slotsInMainTable.length : 4;
        const extraPages = Math.ceil(remainingPhotos.length / slotsPerClonedPage);
        const totalPages = 1 + extraPages;

        let additionalPagesXml = '';

        for (let p = 1; p <= extraPages; p++) {
          const pageNum = 1 + p;
          const pagePhotos = remainingPhotos.slice((p - 1) * slotsPerClonedPage, p * slotsPerClonedPage);

          let pageTblXml = mainPhotoTable;
          pageTblXml = updatePageCounter(pageTblXml, pageNum, totalPages);

          for (let sIdx = 0; sIdx < slotsPerClonedPage; sIdx++) {
            const origSlot = slotsInMainTable[sIdx];
            if (origSlot && sIdx < pagePhotos.length) {
              const photoItem = pagePhotos[sIdx];
              const cellAR = standardCx / standardCy;
              const imgAR = photoItem.aspectRatio || (photoItem.width / photoItem.height) || cellAR;
              let finalCx = standardCx;
              let finalCy = standardCy;
              if (imgAR >= cellAR) {
                finalCx = standardCx;
                finalCy = Math.max(100000, Math.round(standardCx / imgAR));
              } else {
                finalCy = standardCy;
                finalCx = Math.max(100000, Math.round(standardCy * imgAR));
              }

              const newImgFileName = `cloned_photo_${now}_p${pageNum}_s${sIdx + 1}.jpeg`;
              zip.file(`word/media/${newImgFileName}`, photoItem.bytes);

              const newRId = `rId_cloned_${now}_p${pageNum}_s${sIdx + 1}`;
              const newRel = `<Relationship Id="${newRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${newImgFileName}"/>`;
              relsXmlStr = relsXmlStr.replace('</Relationships>', `${newRel}\n</Relationships>`);

              let newDw = origSlot.origDw;
              newDw = newDw.replace(`r:embed="${origSlot.rId}"`, `r:embed="${newRId}"`);
              if (origSlot.cx && origSlot.cy) {
                newDw = newDw.replace(new RegExp(`cx="${origSlot.cx}"`, 'g'), `cx="${finalCx}"`);
                newDw = newDw.replace(new RegExp(`cy="${origSlot.cy}"`, 'g'), `cy="${finalCy}"`);
              }
              newDw = newDw.replace(/<wp:extent\s+cx="\d+"\s+cy="\d+"/g, `<wp:extent cx="${finalCx}" cy="${finalCy}"`);
              newDw = newDw.replace(/<a:ext\s+cx="\d+"\s+cy="\d+"/g, `<a:ext cx="${finalCx}" cy="${finalCy}"`);
              newDw = newDw.replace(/\s+rot="[^"]*"/g, '');
              newDw = newDw.replace(/rotation:\s*[^;"]*;?/g, '');
              pageTblXml = pageTblXml.replace(origSlot.origDw, newDw);
            }
          }

          const pageBreakXml = `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:r><w:br w:type="page"/></w:r></w:p>`;
          additionalPagesXml += pageBreakXml + pageTblXml;
        }

        docXmlStr = docXmlStr.replace(mainPhotoTable, updatePageCounter(mainPhotoTable, 1, totalPages) + additionalPagesXml);
      }
    } else {
    // CASO B: Plantilla en blanco con celdas de tabla vacías
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(docXmlStr, 'text/xml');
    const allCells = xmlDoc.getElementsByTagName('w:tc');
    const photoCandidateCells = [];

    for (let i = 0; i < allCells.length; i++) {
      const cell = allCells[i];
      const drawings = cell.getElementsByTagName('w:drawing');
      const picts = cell.getElementsByTagName('w:pict');
      if (drawings.length > 0 || picts.length > 0) continue;

      const textContent = cell.textContent.trim().toLowerCase();
      const isKeywordSlot = /foto|imagen|evidencia|registro|insertar|espacio|fotograf/i.test(textContent);
      const isEmptySlot = textContent.length === 0;

      if (isKeywordSlot || isEmptySlot) {
        photoCandidateCells.push(cell);
      }
    }

    const standardCx = 2800000;
    const standardCy = 2100000;
    const cellAR = standardCx / standardCy;

    for (let i = 0; i < processedImages.length; i++) {
      const imgItem = processedImages[i];
      const imgAR = imgItem.aspectRatio || (imgItem.width / imgItem.height) || cellAR;
      let finalCx = standardCx;
      let finalCy = standardCy;
      if (imgAR >= cellAR) {
        finalCx = standardCx;
        finalCy = Math.max(100000, Math.round(standardCx / imgAR));
      } else {
        finalCy = standardCy;
        finalCx = Math.max(100000, Math.round(standardCy * imgAR));
      }

      const imgFileName = `user_photo_${now}_${i + 1}.jpeg`;
      zip.file(`word/media/${imgFileName}`, imgItem.bytes);

      const rId = `rId_photo_${now}_${i + 1}`;
      const relTag = `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${imgFileName}"/>`;
      relsXmlStr = relsXmlStr.replace('</Relationships>', `${relTag}</Relationships>`);

      const drawingPStr = `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:pPr><w:jc w:val="center"/></w:pPr>
        <w:r>
          <w:drawing>
            <wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
              <wp:extent cx="${finalCx}" cy="${finalCy}"/>
              <wp:docPr id="${2000 + i}" name="Foto_${i + 1}"/>
              <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
                <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                  <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                    <pic:nvPicPr>
                      <pic:cNvPr id="${2000 + i}" name="Foto_${i + 1}"/>
                      <pic:cNvPicPr/>
                    </pic:nvPicPr>
                    <pic:blipFill>
                      <a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
                      <a:stretch><a:fillRect/></a:stretch>
                    </pic:blipFill>
                    <pic:spPr>
                      <a:xfrm><a:off x="0" y="0"/><a:ext cx="${finalCx}" cy="${finalCy}"/></a:xfrm>
                      <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                    </pic:spPr>
                  </pic:pic>
                </a:graphicData>
              </a:graphic>
            </wp:inline>
          </w:drawing>
        </w:r>
      </w:p>`;

      const drawingDoc = parser.parseFromString(drawingPStr, 'text/xml');
      const importedNode = xmlDoc.importNode(drawingDoc.documentElement, true);

      if (i < photoCandidateCells.length) {
        const targetCell = photoCandidateCells[i];
        const tcPr = targetCell.getElementsByTagName('w:tcPr')[0];
        while (targetCell.firstChild) {
          targetCell.removeChild(targetCell.firstChild);
        }
        if (tcPr) targetCell.appendChild(tcPr);
        targetCell.appendChild(importedNode);
      }
    }

    const serializer = new XMLSerializer();
    docXmlStr = serializer.serializeToString(xmlDoc);
  }

  zip.file('word/document.xml', docXmlStr);
  zip.file('word/_rels/document.xml.rels', relsXmlStr);

  const finalBlob = await zip.generateAsync({ 
    type: 'blob', 
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
  });

  const downloadUrl = URL.createObjectURL(finalBlob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  const safeName = filename.toLowerCase().endsWith('.docx') ? filename : `${filename}.docx`;
  a.download = safeName;
  if (typeof window !== 'undefined' && typeof window.onReportGenerated === 'function') window.onReportGenerated(finalBlob, safeName);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);

  showToast(`¡Reporte generado (${safeName})! Todas las fotos uniformes y logos preservados.`, 'ph-check-circle text-emerald-400');
  } catch (err) {
    console.error('Error al inyectar fotos en Word:', err);
    showToast('Error al procesar plantilla Word: ' + (err.message || err), 'ph-x-circle text-red-400');
  }
}

async function generateCleanDemoWordDocument(processedImages, filename, triggerDownload = true) {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, WidthType, AlignmentType } = window.docx;

  const photoTableRows = [];

  for (let i = 0; i < processedImages.length; i += 2) {
    const item1 = processedImages[i];
    const item2 = processedImages[i + 1];

    const boxW = 280;
    const boxH = 210;
    const cellAR = boxW / boxH;

    const calcSize = (item) => {
      const ar = item.aspectRatio || (item.width / item.height) || cellAR;
      let targetW = boxW;
      let targetH = boxH;
      if (ar >= cellAR) {
        targetW = boxW;
        targetH = Math.max(10, Math.round(boxW / ar));
      } else {
        targetH = boxH;
        targetW = Math.max(10, Math.round(boxH * ar));
      }
      return { width: targetW, height: targetH };
    };

    const size1 = calcSize(item1);
    const cell1Children = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            data: item1.bytes,
            transformation: size1
          })
        ]
      })
    ];

    let cell2Children;
    if (item2) {
      const size2 = calcSize(item2);
      cell2Children = [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              data: item2.bytes,
              transformation: size2
            })
          ]
        })
      ];
    } else {
      cell2Children = [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: '' })]
        })
      ];
    }

    photoTableRows.push(
      new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: cell1Children,
            margins: { top: 80, bottom: 80, left: 80, right: 80 }
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: cell2Children,
            margins: { top: 80, bottom: 80, left: 80, right: 80 }
          })
        ]
      })
    );
  }

  const photoTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: photoTableRows
  });

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 720, bottom: 720, left: 720, right: 720 }
        }
      },
      children: [
        new Paragraph({
          children: [
            new TextRun({ text: state.template.documentTitle || 'REGISTRO FOTOGRÁFICO', bold: true, size: 24, color: '1E3A8A' })
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 180 }
        }),
        photoTable
      ]
    }]
  });

  const finalBlob = await Packer.toBlob(doc);
  const safeName = filename.toLowerCase().endsWith('.docx') ? filename : `${filename}.docx`;
  if (typeof window !== 'undefined' && typeof window.onReportGenerated === 'function') window.onReportGenerated(finalBlob, safeName);
  if (triggerDownload) {
    const downloadUrl = URL.createObjectURL(finalBlob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
    showToast(`¡Reporte limpio descargado (${safeName})!`, 'ph-check-circle text-emerald-400');
  }
  return finalBlob;
}

async function generateRealExcelDocument(filename, triggerDownload = true) {
  try {
    if (!window.XLSX && !window.JSZip) {
      showToast('Error: Librerías de Excel no disponibles', 'ph-x-circle text-red-400');
      return null;
    }

    if (!state.photos || state.photos.length === 0) {
      showToast('No hay fotografías en la mesa de trabajo para exportar.', 'ph-warning text-amber-400');
      return null;
    }

    showToast('Procesando imágenes en alta resolución para reporte Excel...', 'ph-spinner animate-spin text-emerald-400');

    const processedImages = [];
    for (let i = 0; i < state.photos.length; i++) {
      const imgData = await prepareStampedImageBytes(state.photos[i]);
      processedImages.push({
        photo: state.photos[i],
        bytes: imgData.bytes,
        width: imgData.width,
        height: imgData.height,
        aspectRatio: imgData.aspectRatio,
        num: i + 1
      });
    }

    // SI EL USUARIO CARGÓ SU PROPIA PLANTILLA EXCEL (.xlsx):
    // INYECTAR DIRECTAMENTE EN SU FORMATO SIN TOCAR LOGOS, ENCABEZADOS NI FÓRMULAS
    const isExcel = getActiveFormatType() === 'excel';
    if (state.template.hasUserTemplate && state.template.rawBuffer && isExcel) {
      return await injectPhotosIntoUserXlsx(state.template.rawBuffer, processedImages, filename, triggerDownload);
    }

    // SI ES DEMO O NO CARGÓ PLANTILLA PROPIA:
    // GENERAR REPORTE EXCEL LIMPIO Y TÉCNICO CON LAS FOTOGRAFÍAS REALES INSERTADAS
    return await generateCleanDemoExcelDocument(processedImages, filename, triggerDownload);
  } catch (err) {
    console.error('Error al generar Excel:', err);
    showToast('Error al generar Excel: ' + (err.message || err), 'ph-x-circle text-red-400');
    return null;
  }
}

async function injectPhotosIntoUserXlsx(rawBuffer, processedImages, filename, triggerDownload = true) {
  try {
    showToast('Inyectando fotografías directamente en tu plantilla Excel...', 'ph-file-xls text-emerald-400');
    const zip = await window.JSZip.loadAsync(rawBuffer);
    const now = Date.now();

    // 1. Asegurar tipos de contenido en [Content_Types].xml
    if (zip.file('[Content_Types].xml')) {
      let ct = await zip.file('[Content_Types].xml').async('text');
      if (!ct.includes('Extension="jpeg"')) {
        ct = ct.replace('</Types>', '<Default Extension="jpeg" ContentType="image/jpeg"/></Types>');
      }
      if (!ct.includes('Extension="jpg"')) {
        ct = ct.replace('</Types>', '<Default Extension="jpg" ContentType="image/jpeg"/></Types>');
      }
      if (!ct.includes('drawing1.xml')) {
        ct = ct.replace('</Types>', '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>');
      }
      zip.file('[Content_Types].xml', ct);
    }

    // 2. Extraer casillas multicelda validadas de la plantilla y contexto INVIAS
    const validatedSlots = (state.template && state.template.validatedPhotoSlots && state.template.validatedPhotoSlots.length > 0)
      ? state.template.validatedPhotoSlots
      : [];

    const isInvias = (state.template && state.template.isInvias) ||
      (validatedSlots.some(s => s.rangeStr === 'A18:T39' || s.rangeStr === 'U18:AN39' || (s.startRow >= 17 && s.colsSpan >= 18))) ||
      (state.template && state.template.documentTitle && /invias/i.test(state.template.documentTitle)) ||
      (filename && /invias/i.test(filename));

    // 3. Proteger logos existentes en dibujos si ya existen y remover fotos previas
    const protectedRIds = new Set();
    let drawingXml = '';
    let drawingRelsXml = '';
    const hasDrawing = !!zip.file('xl/drawings/drawing1.xml');

    if (hasDrawing) {
      drawingXml = await zip.file('xl/drawings/drawing1.xml').async('text');
      if (zip.file('xl/drawings/_rels/drawing1.xml.rels')) {
        drawingRelsXml = await zip.file('xl/drawings/_rels/drawing1.xml.rels').async('text');
      } else {
        drawingRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n</Relationships>`;
      }

      // Proteger logos institucionales por nombre o tamaño pequeño en encabezado
      const anchorRegex = /<xdr:(?:twoCellAnchor|oneCellAnchor)[\s\S]*?<\/xdr:(?:twoCellAnchor|oneCellAnchor)>/g;
      const anchors = drawingXml.match(anchorRegex) || [];
      anchors.forEach((anc, pIdx) => {
        const blipMatch = anc.match(/<a:blip[^>]+r:embed="([^"]+)"/);
        const nameMatch = anc.match(/<xdr:cNvPr[^>]+name="([^"]+)"/);
        const name = nameMatch ? nameMatch[1].toLowerCase() : '';
        const extMatch = anc.match(/<a:ext[^>]+cx="(\d+)"[^>]+cy="(\d+)"/);
        const cx = extMatch ? parseInt(extMatch[1]) : 0;
        const cy = extMatch ? parseInt(extMatch[2]) : 0;
        const fromRowMatch = anc.match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/);
        const ancRow = fromRowMatch ? parseInt(fromRowMatch[1]) : 999;
        const isProtectedLogo = blipMatch && (
          name.includes('logo') ||
          (cx < 2000000 && cy < 1500000 && pIdx === 0 && ancRow < 4) ||
          (isInvias && ancRow <= 16)
        );
        if (isProtectedLogo) {
          protectedRIds.add(blipMatch[1]);
        }
      });

      // Limpiar fotos previas que no sean logos para no duplicarlas
      drawingXml = drawingXml.replace(anchorRegex, (anc) => {
        const blipMatch = anc.match(/<a:blip[^>]+r:embed="([^"]+)"/);
        if (blipMatch && protectedRIds.has(blipMatch[1])) {
          return anc; // Conservar logo intacto
        }
        return '';
      });
    } else {
      drawingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">\n</xdr:wsDr>`;
      drawingRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n</Relationships>`;
    }

    // 4. Inyectar imágenes en xl/media/ y generar anclas fijadas exactamente al área multicelda
    let newAnchors = '';
    const boxW = 3200000;
    const boxH = 2400000;
    const boxAR = boxW / boxH;

    for (let i = 0; i < processedImages.length; i++) {
      const imgItem = processedImages[i];
      const imgFileName = `user_photo_${now}_${i + 1}.jpeg`;
      zip.file(`xl/media/${imgFileName}`, imgItem.bytes);

      const rId = `rId_photo_${now}_${i + 1}`;
      const relTag = `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${imgFileName}"/>`;
      drawingRelsXml = drawingRelsXml.replace('</Relationships>', `${relTag}\n</Relationships>`);

      let fromCol, fromRow, toCol, toRow;

      if (i < validatedSlots.length) {
        // Enlace exacto al rango de celdas combinadas validado
        const slot = validatedSlots[i];
        fromCol = slot.startCol;
        fromRow = slot.startRow;
        // En OpenXML twoCellAnchor, toCol y toRow representan el límite exterior (col+1, row+1)
        toCol = slot.endCol + 1;
        toRow = slot.endRow + 1;
      } else if (validatedSlots.length > 0) {
        // Si hay más fotos que slots validados preconfigurados:
        // Proyectar cuadrícula proporcional debajo del último bloque
        const lastSlot = validatedSlots[validatedSlots.length - 1];
        const firstSlot = validatedSlots[0];
        const spanCols = (lastSlot.endCol - lastSlot.startCol + 1) || (isInvias ? 20 : 3);
        const spanRows = (lastSlot.endRow - lastSlot.startRow + 1) || (isInvias ? 22 : 4);

        const slotsInFirstRow = validatedSlots.filter(s => s.startRow === firstSlot.startRow).length || 2;
        const overflowIdx = i - validatedSlots.length;
        const colPos = overflowIdx % slotsInFirstRow;
        const rowPos = Math.floor(overflowIdx / slotsInFirstRow);

        const refSlot = validatedSlots[colPos % validatedSlots.length];
        fromCol = refSlot ? refSlot.startCol : (colPos * (spanCols + 1));
        toCol = fromCol + spanCols;

        // Distancia o cadencia vertical real entre bloques de fotos (en INVIAS es 23 filas: 22 de foto + 1 de metadato)
        const rowStride = (validatedSlots.length >= 4 && validatedSlots[2].startRow > validatedSlots[0].startRow)
          ? (validatedSlots[2].startRow - validatedSlots[0].startRow)
          : (isInvias ? 23 : (spanRows + 2));

        const baseRow = lastSlot.startRow + rowStride;
        fromRow = baseRow + (rowPos * rowStride);
        toRow = fromRow + spanRows;
      } else if (isInvias) {
        // Distribución oficial INVIAS si no hay datos multicelda (2 fotos por fila desde fila 18)
        const rowBlock = Math.floor(i / 2);
        const colPos = i % 2;
        fromCol = colPos === 0 ? 0 : 20;
        toCol = fromCol + 20;
        fromRow = 17 + (rowBlock * 23);
        toRow = fromRow + 22;
      } else {
        // Distribución estándar si no hay datos multicelda (2 columnas desde fila 5)
        const rowBlock = Math.floor(i / 2) * 6;
        const colIdx = (i % 2 === 0) ? 0 : 3;
        fromCol = colIdx;
        toCol = colIdx + 3;
        fromRow = 5 + rowBlock;
        toRow = fromRow + 5;
      }

      // REGLA ESTRICTA INVIAS: Hasta la fila 17 no debe ponerse fotos en el formato INVIAS
      // Todas las fotos deben ubicarse estrictamente a partir de la fila 18 (0-indexed fromRow >= 17)
      if (isInvias && fromRow < 17) {
        const rowBlock = Math.floor(i / 2);
        const colPos = i % 2;
        fromCol = colPos === 0 ? 0 : 20;
        toCol = fromCol + 20;
        fromRow = 17 + (rowBlock * 23);
        toRow = fromRow + 22;
      }

      // Dimensiones proporcionales para evitar distorsión de aspecto
      const ar = imgItem.aspectRatio || (imgItem.width / imgItem.height) || boxAR;
      let finalCx = boxW;
      let finalCy = boxH;
      if (ar >= boxAR) {
        finalCx = boxW;
        finalCy = Math.max(100000, Math.round(boxW / ar));
      } else {
        finalCy = boxH;
        finalCx = Math.max(100000, Math.round(boxH * ar));
      }

      newAnchors += `  <xdr:twoCellAnchor editAs="twoCell">\n`;
      newAnchors += `    <xdr:from><xdr:col>${fromCol}</xdr:col><xdr:colOff>10000</xdr:colOff><xdr:row>${fromRow}</xdr:row><xdr:rowOff>10000</xdr:rowOff></xdr:from>\n`;
      newAnchors += `    <xdr:to><xdr:col>${toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>\n`;
      newAnchors += `    <xdr:pic>\n`;
      newAnchors += `      <xdr:nvPicPr><xdr:cNvPr id="${1000 + i}" name="Evidencia_${i + 1}"/><xdr:cNvPicPr/></xdr:nvPicPr>\n`;
      newAnchors += `      <xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>\n`;
      newAnchors += `      <xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${finalCx}" cy="${finalCy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>\n`;
      newAnchors += `    </xdr:pic>\n`;
      newAnchors += `    <xdr:clientData/>\n`;
      newAnchors += `  </xdr:twoCellAnchor>\n`;
    }

    drawingXml = drawingXml.replace('</xdr:wsDr>', `${newAnchors}</xdr:wsDr>`);

    zip.file('xl/drawings/drawing1.xml', drawingXml);
    zip.file('xl/drawings/_rels/drawing1.xml.rels', drawingRelsXml);

    // 5. Conectar el dibujo en xl/worksheets/_rels/sheet1.xml.rels
    let sheetRelsXml = '';
    if (zip.file('xl/worksheets/_rels/sheet1.xml.rels')) {
      sheetRelsXml = await zip.file('xl/worksheets/_rels/sheet1.xml.rels').async('text');
      if (!sheetRelsXml.includes('drawing1.xml')) {
        sheetRelsXml = sheetRelsXml.replace('</Relationships>', '<Relationship Id="rIdDrawing1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>\n</Relationships>');
      }
    } else {
      sheetRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n  <Relationship Id="rIdDrawing1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>\n</Relationships>`;
    }
    zip.file('xl/worksheets/_rels/sheet1.xml.rels', sheetRelsXml);

    // 6. Actualizar textos de celdas de descripción/metadatos e insertar etiqueta <drawing> si no existe
    if (zip.file('xl/worksheets/sheet1.xml')) {
      let s1Xml = await zip.file('xl/worksheets/sheet1.xml').async('text');

      // Actualizar descripciones de cada fotografía en las celdas inferiores de la hoja
      for (let i = 0; i < processedImages.length; i++) {
        const imgItem = processedImages[i];
        let metaRow, metaColLetter;
        if (i < validatedSlots.length) {
          const s = validatedSlots[i];
          metaRow = s.endRow + 2; // Fila 1-indexada directamente debajo de la foto (ej. fila 40 para A18:T39)
          metaColLetter = s.startCol === 0 ? 'A' : (s.startCol >= 20 ? 'U' : 'D');
        } else {
          const sIndex = i % 2;
          const block = Math.floor(i / 2);
          metaRow = 18 + (block * 23) + 22;
          metaColLetter = sIndex === 0 ? 'A' : 'U';
        }
        const cellRef = `${metaColLetter}${metaRow}`;
        const pNote = imgItem.photo.note || `Registro Fotográfico #${i + 1}`;
        const pMeta = imgItem.photo.meta || null;
        const pCoords = imgItem.photo.coords || (pMeta && pMeta.lat != null ? `${pMeta.lat.toFixed(6)}, ${pMeta.lon.toFixed(6)}` : `${state.config.municipality || 'COLOMBIA'}, CTM12`);
        // Fecha real de captura (EXIF/OCR) si la IA la extrajo; si no, la fecha de generación
        const pDate = pMeta && pMeta.capturedAt && window.MetadataCore ? MetadataCore.formatDateEs(pMeta.capturedAt) : new Date().toLocaleDateString('es-CO');
        const descText = `DESCRIPCIÓN: ${pNote} | COORDENADAS: ${pCoords} | FECHA: ${pDate}`;
        const safeText = descText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const cellRegex = new RegExp(`<c r="${cellRef}"[^>]*>[\\s\\S]*?<\\/c>`);
        if (s1Xml.match(cellRegex)) {
          s1Xml = s1Xml.replace(cellRegex, `<c r="${cellRef}" t="str"><v>${safeText}</v></c>`);
        }
      }

      if (!s1Xml.includes('<drawing')) {
        if (s1Xml.includes('<legacyDrawing')) {
          s1Xml = s1Xml.replace('<legacyDrawing', '<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdDrawing1"/><legacyDrawing');
        } else if (s1Xml.includes('<tableParts')) {
          s1Xml = s1Xml.replace('<tableParts', '<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdDrawing1"/><tableParts');
        } else if (s1Xml.includes('<extLst')) {
          s1Xml = s1Xml.replace('<extLst', '<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdDrawing1"/><extLst');
        } else {
          s1Xml = s1Xml.replace('</worksheet>', '<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdDrawing1"/></worksheet>');
        }
      }
      zip.file('xl/worksheets/sheet1.xml', s1Xml);
    }

    // 7. Registrar drawing1.xml y extensiones de imagen en [Content_Types].xml (garantiza compatibilidad 100% en Excel)
    if (zip.file('[Content_Types].xml')) {
      let ctXml = await zip.file('[Content_Types].xml').async('text');
      if (!ctXml.includes('drawing1.xml')) {
        ctXml = ctXml.replace('</Types>', '  <Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>\n</Types>');
      }
      if (!ctXml.includes('Extension="jpeg"')) {
        ctXml = ctXml.replace('</Types>', '  <Default Extension="jpeg" ContentType="image/jpeg"/>\n</Types>');
      }
      if (!ctXml.includes('Extension="jpg"')) {
        ctXml = ctXml.replace('</Types>', '  <Default Extension="jpg" ContentType="image/jpeg"/>\n</Types>');
      }
      if (!ctXml.includes('Extension="png"')) {
        ctXml = ctXml.replace('</Types>', '  <Default Extension="png" ContentType="image/png"/>\n</Types>');
      }
      zip.file('[Content_Types].xml', ctXml);
    }

    const finalBlob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const safeName = filename.toLowerCase().endsWith('.xlsx') ? filename : `${filename}.xlsx`;
    if (typeof window !== 'undefined' && typeof window.onReportGenerated === 'function') window.onReportGenerated(finalBlob, safeName);
    if (triggerDownload) {
      const downloadUrl = URL.createObjectURL(finalBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = safeName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      showToast(`¡Reporte Excel (${safeName}) generado! Fotografías inyectadas en tu plantilla.`, 'ph-check-circle text-emerald-400');
    }
    return finalBlob;
  } catch (err) {
    console.error('Error al inyectar fotos en Excel:', err);
    showToast('Error al inyectar fotos en plantilla Excel: ' + (err.message || err), 'ph-x-circle text-red-400');
    return null;
  }
}

async function generateCleanDemoExcelDocument(processedImages, filename, triggerDownload = true) {
  try {
    showToast('Generando reporte Excel con fotografías y coordenadas...', 'ph-file-xls text-emerald-400');

    const wb = window.XLSX.utils.book_new();
    const wsData = [
      ['INFORME TÉCNICO DE REGISTRO FOTOGRÁFICO', '', '', '', '', ''],
      [`PROYECTO: ${state.currentProject.name}`, '', `FECHA: ${new Date().toLocaleDateString('es-CO')}`, '', `MUNICIPIO: ${state.config.municipality || 'Medellín'}, ${state.config.department || 'Antioquia'}`, ''],
      [`CONTRATISTA: Interconexión Eléctrica S.A.S.`, '', `CÓDIGO: ${state.currentProject.code || 'PROY-01'}`, '', `TOTAL FOTOS: ${processedImages.length}`, ''],
      ['', '', '', '', '', ''],
      ['ÍTEM', 'REGISTRO FOTOGRÁFICO (EVIDENCIA)', 'DESCRIPCIÓN / HALLAZGO TÉCNICO', 'COORDENADAS TÉCNICAS', 'FECHA Y HORA', 'ESTADO']
    ];

    const rowHeights = [
      { hpt: 26 }, // Title
      { hpt: 20 }, // Proy
      { hpt: 20 }, // Contractor
      { hpt: 12 }, // Spacer
      { hpt: 24 }  // Header
    ];

    const photoSpans = [];

    processedImages.forEach((imgItem, idx) => {
      const p = imgItem.photo;
      const startRow = wsData.length;
      const mun = p.municipality || state.config.municipality || 'Medellín';
      const dep = p.department || state.config.department || 'Antioquia';
      const coordsStr = p.coords || getFormattedCoordinates(p.gpsFormat || state.config.gpsFormat);
      const dateTimeStr = getFormattedDateTime(state.config.dateFormat);
      const noteStr = `${p.title || `Evidencia #${idx + 1}`}\n\n${p.note || 'Sin hallazgo registrado'}\n\nUbicación: ${mun}, ${dep}`;

      // Fila principal del ítem
      wsData.push([
        idx + 1,
        '', // Columna B reservada para la foto
        noteStr,
        coordsStr,
        dateTimeStr,
        p.isPreExisting ? 'Preexistente' : 'Conforme'
      ]);
      rowHeights.push({ hpt: 36 });

      // 4 filas adicionales para dar altura física a la imagen en Excel
      for (let r = 0; r < 4; r++) {
        wsData.push(['', '', '', '', '', '']);
        rowHeights.push({ hpt: 36 });
      }

      // Fila separadora
      wsData.push(['', '', '', '', '', '']);
      rowHeights.push({ hpt: 14 });

      photoSpans.push({
        startRow: startRow,
        endRow: startRow + 5,
        col: 1 // Columna B (0-based)
      });
    });

    const ws = window.XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
      { wch: 8 },   // A: ÍTEM
      { wch: 46 },  // B: FOTOGRAFÍA
      { wch: 44 },  // C: DESCRIPCIÓN
      { wch: 36 },  // D: COORDENADAS
      { wch: 22 },  // E: FECHA
      { wch: 14 }   // F: ESTADO
    ];
    ws['!rows'] = rowHeights;

    window.XLSX.utils.book_append_sheet(wb, ws, 'Evidencias');

    const wbout = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const zip = await window.JSZip.loadAsync(wbout);

    // Configurar Drawing OpenXML en el ZIP
    let drawingRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n`;
    let drawingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">\n`;

    const boxW = 3200000;
    const boxH = 2400000;
    const boxAR = boxW / boxH;

    photoSpans.forEach((span, i) => {
      const imgItem = processedImages[i];
      const imgName = `image_${i + 1}.jpeg`;
      zip.file(`xl/media/${imgName}`, imgItem.bytes);

      const rId = `rIdImg_${i + 1}`;
      drawingRelsXml += `  <Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${imgName}"/>\n`;

      const ar = imgItem.aspectRatio || (imgItem.width / imgItem.height) || boxAR;
      let finalCx = boxW;
      let finalCy = boxH;
      if (ar >= boxAR) {
        finalCx = boxW;
        finalCy = Math.max(100000, Math.round(boxW / ar));
      } else {
        finalCy = boxH;
        finalCx = Math.max(100000, Math.round(boxH * ar));
      }

      drawingXml += `  <xdr:twoCellAnchor editAs="twoCell">\n`;
      drawingXml += `    <xdr:from><xdr:col>${span.col}</xdr:col><xdr:colOff>10000</xdr:colOff><xdr:row>${span.startRow}</xdr:row><xdr:rowOff>10000</xdr:rowOff></xdr:from>\n`;
      drawingXml += `    <xdr:to><xdr:col>${span.col + 1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${span.endRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>\n`;
      drawingXml += `    <xdr:pic>\n`;
      drawingXml += `      <xdr:nvPicPr><xdr:cNvPr id="${i + 2}" name="Evidencia_${i + 1}"/><xdr:cNvPicPr/></xdr:nvPicPr>\n`;
      drawingXml += `      <xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>\n`;
      drawingXml += `      <xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${finalCx}" cy="${finalCy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>\n`;
      drawingXml += `    </xdr:pic>\n`;
      drawingXml += `    <xdr:clientData/>\n`;
      drawingXml += `  </xdr:twoCellAnchor>\n`;
    });

    drawingRelsXml += `</Relationships>`;
    drawingXml += `</xdr:wsDr>`;

    zip.file('xl/drawings/_rels/drawing1.xml.rels', drawingRelsXml);
    zip.file('xl/drawings/drawing1.xml', drawingXml);

    const sheetRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n  <Relationship Id="rIdDrawing1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>\n</Relationships>`;
    zip.file('xl/worksheets/_rels/sheet1.xml.rels', sheetRels);

    let ct = await zip.file('[Content_Types].xml').async('text');
    if (!ct.includes('Extension="jpeg"')) {
      ct = ct.replace('</Types>', '<Default Extension="jpeg" ContentType="image/jpeg"/></Types>');
    }
    if (!ct.includes('Extension="jpg"')) {
      ct = ct.replace('</Types>', '<Default Extension="jpg" ContentType="image/jpeg"/></Types>');
    }
    if (!ct.includes('drawing1.xml')) {
      ct = ct.replace('</Types>', '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>');
    }
    zip.file('[Content_Types].xml', ct);

    let s1 = await zip.file('xl/worksheets/sheet1.xml').async('text');
    if (s1.includes('<tableParts')) {
      s1 = s1.replace('<tableParts', '<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdDrawing1"/><tableParts');
    } else if (s1.includes('<extLst')) {
      s1 = s1.replace('<extLst', '<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdDrawing1"/><extLst');
    } else {
      s1 = s1.replace('</worksheet>', '<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdDrawing1"/></worksheet>');
    }
    zip.file('xl/worksheets/sheet1.xml', s1);

    const finalBlob = await zip.generateAsync({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    const safeName = filename.toLowerCase().endsWith('.xlsx') ? filename : `${filename}.xlsx`;
    if (typeof window !== 'undefined' && typeof window.onReportGenerated === 'function') window.onReportGenerated(finalBlob, safeName);
    if (triggerDownload) {
      const downloadUrl = URL.createObjectURL(finalBlob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = safeName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
      showToast(`¡Reporte Excel (${safeName}) generado con fotografías y coordenadas!`, 'ph-check-circle text-emerald-400');
    }
    return finalBlob;
  } catch (err) {
    console.error('Error al generar Excel con fotos:', err);
    showToast('Error al generar Excel: ' + (err.message || err), 'ph-x-circle text-red-400');
    return null;
  }
}

// ==========================================
// DESCARGA DIRECTA ACTIVA (SIN NUBE EXTERNA)
// ==========================================


// Cola de sincronización con la nube: la procesa modules/cloud.js (persistente en IndexedDB)
function processSyncQueue() {
  if (window.Cloud) Cloud.processQueue();
}

// ==========================================
// 6. UTILIDADES (TOAST NOTIFY)
// ==========================================
let toastTimer = null;
function showToast(message, iconClass = 'ph-check-circle text-emerald-400') {
  const toast = document.getElementById('toast-notify');
  const msgElem = document.getElementById('toast-msg');
  const iconElem = document.getElementById('toast-icon');

  msgElem.textContent = message;
  iconElem.className = `ph-bold ${iconClass} text-lg`;

  toast.classList.remove('opacity-0', '-translate-y-20', 'pointer-events-none');
  toast.classList.add('opacity-100', 'translate-y-0');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('opacity-100', 'translate-y-0');
    toast.classList.add('opacity-0', '-translate-y-20', 'pointer-events-none');
  }, 2800);
}
window.showToast = showToast;
window.takePhoto = takePhoto;
window.handleGalleryImport = handleGalleryImport;
window.applyConfigFromInputs = applyConfigFromInputs;
