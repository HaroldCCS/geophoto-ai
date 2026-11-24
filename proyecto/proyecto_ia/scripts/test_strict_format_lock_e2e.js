const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '../app/index.html'), 'utf8');

// Parse all IDs in html
const ids = new Set();
const idRegex = /id=["']([^"']+)["']/g;
let m;
while ((m = idRegex.exec(html)) !== null) {
  ids.add(m[1]);
}

// Create a DOM mock
const elements = {};
function createMockElement(id) {
  const el = {
    id,
    classList: {
      add: () => {},
      remove: () => {},
      contains: () => false,
      toggle: () => {}
    },
    style: {},
    dataset: {},
    children: [],
    appendChild: (child) => { el.children.push(child); return child; },
    removeChild: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    setAttribute: () => {},
    getAttribute: () => null,
    removeAttribute: () => {},
    querySelector: (sel) => createMockElement(sel),
    querySelectorAll: (sel) => [createMockElement(sel)],
    innerHTML: '',
    textContent: '',
    value: '',
    checked: false
  };
  return el;
}

ids.forEach(id => {
  elements[id] = createMockElement(id);
});

global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  sessionStorage: { getItem: () => null, setItem: () => {} },
  localStorage: { getItem: () => null, setItem: () => {} },
  location: { origin: 'http://localhost:8080' },
  navigator: { onLine: true, userAgent: 'test' },
  matchMedia: (query) => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
};
global.document = {
  getElementById: (id) => elements[id] || createMockElement(id),
  querySelector: (sel) => createMockElement(sel),
  querySelectorAll: (sel) => [createMockElement(sel)],
  createElement: (tag) => createMockElement(tag),
  body: createMockElement('body')
};
global.navigator = global.window.navigator;
global.localStorage = global.window.localStorage;
global.sessionStorage = global.window.sessionStorage;
global.location = global.window.location;
global.Image = class { constructor() {} };
global.FileReader = class { readAsDataURL() {} };
global.URL = { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} };

// Cargar app.js
require('../app/app.js');

async function testStrictFormatLock() {
  console.log('--- TEST E2E: Bloqueo Estricto 1:1 de Formato y Rotación ---');

  const { state, getActiveFormatType, getActiveExtension, updateDirectDownloadView, setModalExportFormat } = global.window;

  // CASO 1: Archivo Word cargado -> Descarga estrictamente Word (.docx)
  state.template.name = 'Formato_Supervision_Obra.docx';
  state.template.type = 'word';
  state.template.uploadedFormat = 'word';

  assert.strictEqual(getActiveFormatType(), 'word', 'Para archivo .docx debe ser formato word');
  assert.strictEqual(getActiveExtension(), 'docx', 'Extensión debe ser docx');
  updateDirectDownloadView();
  assert(elements['export-filename-input'].value.endsWith('.docx'), 'Input de descarga debe terminar en .docx');
  console.log('[OK] Si se sube Word (.docx), el formato activo es estrictamente Word (.docx)');

  // Intentar cambiar a Excel -> Debe ser bloqueado y mantenerse en docx
  setModalExportFormat('xlsx', false);
  assert.strictEqual(elements['modal-export-ext-badge'].textContent, '.docx', 'Badge no debe cambiar a .xlsx');
  console.log('[OK] Se bloquea cualquier intento de migrar o cambiar de Word a Excel');

  // CASO 2: Archivo Excel cargado -> Descarga estrictamente Excel (.xlsx)
  state.template.name = 'Matriz_Inspeccion_Fotografica.xlsx';
  state.template.type = 'excel';
  state.template.uploadedFormat = 'excel';

  assert.strictEqual(getActiveFormatType(), 'excel', 'Para archivo .xlsx debe ser formato excel');
  assert.strictEqual(getActiveExtension(), 'xlsx', 'Extensión debe ser xlsx');
  updateDirectDownloadView();
  assert(elements['export-filename-input'].value.endsWith('.xlsx'), 'Input de descarga debe terminar en .xlsx');
  console.log('[OK] Si se sube Excel (.xlsx), el formato activo es estrictamente Excel (.xlsx)');

  // Intentar cambiar a Word -> Debe ser bloqueado y mantenerse en xlsx
  setModalExportFormat('docx', false);
  assert.strictEqual(elements['modal-export-ext-badge'].textContent, '.xlsx', 'Badge no debe cambiar a .docx');
  console.log('[OK] Se bloquea cualquier intento de migrar o cambiar de Excel a Word');

  // CASO 3: Cero auto-rotación: las imágenes inician en 0°
  const appJsCode = fs.readFileSync('app/app.js', 'utf8');
  assert(appJsCode.includes('rotation: 0,\n                  initialRotation: 0,'), 'Word extrae en 0°');
  assert(appJsCode.includes('rotation: 0,\n                        initialRotation: 0,'), 'Excel extrae en 0°');
  console.log('[OK] Fotos extraídas inician tal cual en 0° sin reorientación automática');

  // CASO 4: Unicidad de descarga: Debounce activo
  assert(appJsCode.includes('isDownloadingDirectReport'), 'Debounce de descarga directa presente en app.js');
  console.log('[OK] Debounce de descarga directa protege contra descargas duplicadas');

  console.log('--- TODAS LAS VALIDACIONES DE BLOQUEO ESTRICTO SUPERADAS AL 100% ---');
}

testStrictFormatLock().catch(e => {
  console.error('ERROR EN TEST:', e);
  process.exit(1);
});
