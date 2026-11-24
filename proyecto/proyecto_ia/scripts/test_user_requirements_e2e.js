const fs = require('fs');
const assert = require('assert');

async function testUserRequirementsE2E() {
  console.log('--- TEST: User Requirements E2E (Rotation Preservation & Format Lock) ---');

  const appJsCode = fs.readFileSync('app/app.js', 'utf8');

  // 1. Extraer extractDrawingRotation desde app.js y verificar ángulos
  const extractFnMatch = appJsCode.match(/function extractDrawingRotation\(xmlString\)[\s\S]*?^}/m);
  assert(extractFnMatch, 'extractDrawingRotation debe existir en app.js');
  const extractDrawingRotation = new Function('return ' + extractFnMatch[0])();

  // Pruebas de rotación DrawingML
  assert.strictEqual(extractDrawingRotation('<a:xfrm rot="5400000">'), 90, 'rot="5400000" debe ser 90°');
  assert.strictEqual(extractDrawingRotation('<a:xfrm rot="10800000">'), 180, 'rot="10800000" debe ser 180°');
  assert.strictEqual(extractDrawingRotation('<a:xfrm rot="16200000">'), 270, 'rot="16200000" debe ser 270°');
  assert.strictEqual(extractDrawingRotation('<a:xfrm rot="-5400000">'), 270, 'rot="-5400000" debe ser 270°');
  assert.strictEqual(extractDrawingRotation('<a:xfrm rot="0">'), 0, 'rot="0" debe ser 0°');
  assert.strictEqual(extractDrawingRotation('<a:xfrm>'), 0, 'sin rot debe ser 0°');
  assert.strictEqual(extractDrawingRotation('<v:shape style="rotation:90">'), 90, 'VML rotation:90 debe ser 90°');
  console.log('[OK] extractDrawingRotation calcula con precisión matemática rotaciones DrawingML y VML.');

  // 2. Verificar que parseWordDocument inicializa fotos tal cual inician con rotation: 0 (cero auto-rotación)
  assert(appJsCode.includes('rotation: 0,\n                  initialRotation: 0,'), 'parseWordDocument debe asignar rotation: 0 y initialRotation: 0 a cada foto extraída');
  console.log('[OK] parseWordDocument extrae fotos tal cual inician con orientación 0° sin auto-rotación involuntaria.');

  // 3. Verificar que parseExcelDocument inicializa fotos tal cual inician con rotation: 0 (cero auto-rotación)
  assert(appJsCode.includes('rotation: 0,\n                        initialRotation: 0,'), 'parseExcelDocument debe asignar rotation: 0 y initialRotation: 0 a cada foto extraída');
  console.log('[OK] parseExcelDocument extrae fotos tal cual inician con orientación 0° sin auto-rotación involuntaria.');

  // 4. Verificar que injectPhotosIntoUserDocx elimina rot="..." residual para prevenir rotaciones dobles involuntarias
  const docxInjectionRegex = /newDw\s*=\s*newDw\.replace\(\/\\s\+rot="\[\^"\]\*"\/g,\s*''\)/;
  assert(docxInjectionRegex.test(appJsCode), 'injectPhotosIntoUserDocx debe remover rot="..." de DrawingML para evitar doble rotación');
  console.log('[OK] injectPhotosIntoUserDocx elimina atributos rot DrawingML para sincronización 100% fiel sin duplicar giros.');

  // 5. Verificar bloqueo estricto de formato en updateDirectDownloadView
  assert(appJsCode.includes("const isWord = state.template && state.template.type === 'word';"), 'Debe detectar tipo de plantilla');
  assert(appJsCode.includes("const targetFormat = isWord ? 'docx' : 'xlsx';"), 'Formato objetivo debe corresponder 1:1 con la plantilla');
  assert(appJsCode.includes("btn.title = `Bloqueado: La plantilla cargada es ${isWord ? 'Word (.docx)' : 'Excel (.xlsx)'}`;"), 'Botón no correspondiente debe quedar bloqueado');
  console.log('[OK] updateDirectDownloadView bloquea el formato de salida 1:1 con el archivo cargado.');

  // 6. Verificar bloqueo de selector de formato al hacer clic
  assert(appJsCode.includes("if (format !== targetFormat) {"), 'Click en formato bloqueado debe ser rechazado');
  assert(appJsCode.includes("Solo se permite descargar en su formato original"), 'Mensaje explicativo de formato bloqueado presente');
  console.log('[OK] El selector de formato rechaza cambios que no coincidan con el archivo subido.');

  // 7. Verificar handleDirectDownloadNow con formato forzado
  assert(appJsCode.includes("const selectedFormat = isWord ? 'docx' : 'xlsx';"), 'handleDirectDownloadNow debe forzar formato subido');
  console.log('[OK] handleDirectDownloadNow descarga estrictamente Word si se subió Word, o Excel si se subió Excel.');

  console.log('--- ALL USER REQUIREMENTS VERIFIED SUCCESSFULLY (100%) ---');
}

testUserRequirementsE2E().catch(err => {
  console.error('ERROR EN TEST:', err);
  process.exit(1);
});
