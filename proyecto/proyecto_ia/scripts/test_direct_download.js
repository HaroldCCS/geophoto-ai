const fs = require('fs');

async function testDirectDownloadModule() {
  console.log('--- TEST: Direct Download Module Verification ---');

  const html = fs.readFileSync('app/index.html', 'utf8');
  const js = fs.readFileSync('app/app.js', 'utf8');

  // 1. Confirmar que no hay residuos de Google Drive o scripts externos innecesarios en index.html
  if (html.includes('accounts.google.com/gsi/client')) {
    throw new Error('Google Identity Services script todavía está presente en index.html');
  }
  if (html.includes('modal-gdrive-sync')) {
    throw new Error('modal-gdrive-sync todavía está presente en index.html');
  }
  if (html.includes('btn-sync-onedrive')) {
    throw new Error('btn-sync-onedrive todavía está presente en index.html');
  }
  console.log('[OK] index.html libre de módulos de nube y Google Drive');

  // 2. Confirmar que la vista de Descarga Directa está configurada
  if (!html.includes('id="view-export"')) {
    throw new Error('No se encontró la vista id="view-export"');
  }
  if (!html.includes('id="btn-download-local"')) {
    throw new Error('No se encontró el botón id="btn-download-local"');
  }
  if (!html.includes('handleDirectDownloadNow()')) {
    throw new Error('btn-download-local no tiene asignado handleDirectDownloadNow()');
  }
  if (!html.includes('id="export-filename-input"')) {
    throw new Error('No se encontró el input id="export-filename-input"');
  }
  console.log('[OK] Vista de Descarga Directa presente con todos sus elementos principales');

  // 3. Confirmar funciones exportadas en app.js
  const requiredFns = [
    'handleDirectDownloadNow',
    'confirmAndDownloadFromModal',
    'appendMainFilenameTag',
    'updateDirectDownloadView',
    'openExportNameModal',
    'closeExportNameModal',
    'setModalExportFormat'
  ];

  for (const fn of requiredFns) {
    if (!js.includes(`window.${fn} = ${fn}`) && !js.includes(`function ${fn}`)) {
      throw new Error(`Función requerida no encontrada en app.js: ${fn}`);
    }
  }
  console.log('[OK] Todas las funciones de Descarga Directa presentes en app.js');

  // 4. Confirmar que la pestaña inferior dice "Descargar"
  if (!html.includes('<span class="text-[10px] mt-0.5 font-medium pointer-events-none">Descargar</span>')) {
    throw new Error('La pestaña inferior debe llamarse "Descargar"');
  }
  console.log('[OK] Pestaña de navegación inferior configurada como "Descargar"');

  console.log('--- TEST DIRECT DOWNLOAD PASSED 100% ---');
}

testDirectDownloadModule().catch(err => {
  console.error('TEST DIRECT DOWNLOAD FAILED:', err);
  process.exit(1);
});
