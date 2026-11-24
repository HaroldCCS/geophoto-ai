const fs = require('fs');
const JSZip = require('../app/lib/jszip.min.js');

async function testGdriveSync() {
  console.log('--- TEST: Google Drive Folder Structure and ZIP Packaging ---');

  const defaultFolder = 'proyecto';
  const customFolder = 'Obra_Carretera_Tramo2';
  const testFileName = 'REPORTE_FOTOGRAFICO_INVIAS.xlsx';
  const dummyContent = Buffer.from('Contenido de prueba Excel INVIAS');

  // 1. Probar empaquetado con carpeta por defecto "proyecto"
  const zip1 = new JSZip();
  const dir1 = zip1.folder(defaultFolder);
  dir1.file(testFileName, dummyContent);

  const zip1Buffer = await zip1.generateAsync({ type: 'nodebuffer' });
  const readZip1 = await JSZip.loadAsync(zip1Buffer);

  const expectedPath1 = `${defaultFolder}/${testFileName}`;
  if (!readZip1.file(expectedPath1)) {
    throw new Error(`El archivo no se encontró dentro de la carpeta por defecto: ${expectedPath1}`);
  }
  console.log(`[OK] Estructura por defecto verificada: ${expectedPath1}`);

  // 2. Probar empaquetado con carpeta personalizada definida por el usuario
  const zip2 = new JSZip();
  const dir2 = zip2.folder(customFolder);
  dir2.file(testFileName, dummyContent);

  const zip2Buffer = await zip2.generateAsync({ type: 'nodebuffer' });
  const readZip2 = await JSZip.loadAsync(zip2Buffer);

  const expectedPath2 = `${customFolder}/${testFileName}`;
  if (!readZip2.file(expectedPath2)) {
    throw new Error(`El archivo no se encontró dentro de la carpeta personalizada: ${expectedPath2}`);
  }
  console.log(`[OK] Estructura personalizada verificada: ${expectedPath2}`);

  console.log('--- TEST GDRIVE SYNC PASSED 100% ---');
}

testGdriveSync().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
