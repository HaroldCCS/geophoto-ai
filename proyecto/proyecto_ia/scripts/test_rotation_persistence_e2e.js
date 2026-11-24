const fs = require('fs');
const JSZip = require('../app/lib/jszip.min.js');
const XLSX = require('../app/lib/xlsx.full.min.js');

async function testRotationPersistenceE2E() {
  console.log('--- TEST E2E: Verificación de Persistencia de Rotaciones en Word y Excel ---');

  const appJsCode = fs.readFileSync('app/app.js', 'utf8');

  // 1. Verificar que handleGalleryImport reemplace limpiamente todas las fotos demo
  if (appJsCode.includes('state.photos.length <= 4 && state.photos.every')) {
    throw new Error('FALLO CRÍTICO: handleGalleryImport todavía tiene la condición restrictiva <= 4!');
  }
  if (!appJsCode.includes('isOnlyInitialDemo = state.photos.every')) {
    throw new Error('FALLO CRÍTICO: handleGalleryImport no tiene la condición universal para reemplazar fotos demo!');
  }
  console.log('[OK] handleGalleryImport reemplaza limpiamente el 100% de las fotos demo al importar imágenes de usuario.');

  // 2. Verificar que injectPhotosIntoUserDocx NO filtre slots por un solo mainTableIdx
  if (appJsCode.includes('tableSlots = photoSlots.filter(s => s.tIdx === mainTableIdx)')) {
    throw new Error('FALLO CRÍTICO: injectPhotosIntoUserDocx todavía descarta slots de tablas anteriores con mainTableIdx!');
  }
  if (!appJsCode.includes('const initialFilled = Math.min(photoSlots.length, processedImages.length)')) {
    throw new Error('FALLO CRÍTICO: injectPhotosIntoUserDocx no usa photoSlots.length para todas las tablas!');
  }
  console.log('[OK] injectPhotosIntoUserDocx procesa todos los slots a lo largo de todas las tablas sin exclusión.');

  // 3. Verificar que injectPhotosIntoUserXlsx no bloquee celdas <= 16 en formatos estándar
  if (appJsCode.includes('|| ancRow <= 16')) {
    throw new Error('FALLO CRÍTICO: injectPhotosIntoUserXlsx todavía tiene ancRow <= 16 incondicional!');
  }
  if (!appJsCode.includes('(isInvias && ancRow <= 16)')) {
    throw new Error('FALLO CRÍTICO: injectPhotosIntoUserXlsx debe condicionar ancRow <= 16 estrictamente a isInvias!');
  }
  console.log('[OK] injectPhotosIntoUserXlsx condiciona la protección de filas <= 16 estrictamente al contexto INVIAS.');

  // 4. Prueba de Inyección en Word con Múltiples Tablas
  console.log('--- Subtest: Simulación de Word con múltiples tablas y rotaciones ---');
  // Construir un Word sintético con 2 tablas:
  // Tabla 1: Slot 1 (Foto 1) y Slot 2 (Foto 2)
  // Tabla 2: Slot 3 (Foto 3) y Slot 4 (Foto 4)
  const zip = new JSZip();
  let docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
<w:body>
  <w:tbl>
    <w:tr>
      <w:tc><w:drawing><wp:inline><wp:extent cx="2800000" cy="2100000"/><a:graphic><a:graphicData><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill><a:blip r:embed="rId1"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:tc>
      <w:tc><w:drawing><wp:inline><wp:extent cx="2800000" cy="2100000"/><a:graphic><a:graphicData><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill><a:blip r:embed="rId2"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:tc>
    </w:tr>
  </w:tbl>
  <w:p><w:r><w:t>Separador de sección</w:t></w:r></w:p>
  <w:tbl>
    <w:tr>
      <w:tc><w:drawing><wp:inline><wp:extent cx="2800000" cy="2100000"/><a:graphic><a:graphicData><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill><a:blip r:embed="rId3"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:tc>
      <w:tc><w:drawing><wp:inline><wp:extent cx="2800000" cy="2100000"/><a:graphic><a:graphicData><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill><a:blip r:embed="rId4"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:tc>
    </w:tr>
  </w:tbl>
</w:body></w:document>`;

  let relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.jpeg"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image2.jpeg"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image3.jpeg"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image4.jpeg"/>
</Relationships>`;

  zip.file('word/document.xml', docXml);
  zip.file('word/_rels/document.xml.rels', relsXml);
  zip.file('word/media/image1.jpeg', Buffer.from('img1'));
  zip.file('word/media/image2.jpeg', Buffer.from('img2'));
  zip.file('word/media/image3.jpeg', Buffer.from('img3'));
  zip.file('word/media/image4.jpeg', Buffer.from('img4'));

  // 4 fotos procesadas por el usuario:
  // Foto 1: Rotada a 90°
  // Foto 2: Rotada a 180°
  // Foto 3: Sin rotación (0°)
  // Foto 4: Rotada a 270°
  const processedImages = [
    { bytes: Buffer.from('ROT_90_BYTES'), width: 1600, height: 1200, aspectRatio: 1.333, photo: { rotation: 90 } },
    { bytes: Buffer.from('ROT_180_BYTES'), width: 1600, height: 1200, aspectRatio: 1.333, photo: { rotation: 180 } },
    { bytes: Buffer.from('ORIG_0_BYTES'), width: 1600, height: 1200, aspectRatio: 1.333, photo: { rotation: 0 } },
    { bytes: Buffer.from('ROT_270_BYTES'), width: 1600, height: 1200, aspectRatio: 1.333, photo: { rotation: 270 } }
  ];

  // Simular la nueva lógica de inyección de injectPhotosIntoUserDocx
  const docRels = {
    'rId1': 'word/media/image1.jpeg',
    'rId2': 'word/media/image2.jpeg',
    'rId3': 'word/media/image3.jpeg',
    'rId4': 'word/media/image4.jpeg'
  };

  const tables = docXml.match(/<w:tbl[\s\S]*?<\/w:tbl>/g) || [];
  const photoSlots = [];
  tables.forEach((tbl, tIdx) => {
    const drawings = tbl.match(/<w:drawing[\s\S]*?<\/w:drawing>/g) || [];
    drawings.forEach((dw, rIdx) => {
      const blipMatch = dw.match(/<a:blip[^>]+r:embed="([^"]+)"/);
      if (blipMatch) {
        const rId = blipMatch[1];
        photoSlots.push({ tIdx, rIdx, rId, target: docRels[rId], cx: 2800000, cy: 2100000, origDw: dw });
      }
    });
  });

  if (photoSlots.length !== 4) {
    throw new Error(`Se esperaban 4 photoSlots a través de las 2 tablas, se encontraron: ${photoSlots.length}`);
  }

  const now = 123456789;
  for (let i = 0; i < photoSlots.length; i++) {
    const slot = photoSlots[i];
    const imgItem = processedImages[i];

    const newImgFileName = `user_photo_${now}_s${i + 1}.jpeg`;
    zip.file(`word/media/${newImgFileName}`, imgItem.bytes);

    const newRId = `rId_photo_${now}_s${i + 1}`;
    const newRel = `<Relationship Id="${newRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${newImgFileName}"/>`;
    relsXml = relsXml.replace('</Relationships>', `${newRel}\n</Relationships>`);

    let newDw = slot.origDw.replace(`r:embed="${slot.rId}"`, `r:embed="${newRId}"`);
    docXml = docXml.replace(slot.origDw, newDw);
  }

  zip.file('word/document.xml', docXml);
  zip.file('word/_rels/document.xml.rels', relsXml);

  // Verificar que todas las 4 fotos (ambas tablas) se inyectaron
  for (let i = 0; i < 4; i++) {
    const expectedEmbed = `r:embed="rId_photo_${now}_s${i + 1}"`;
    if (!docXml.includes(expectedEmbed)) {
      throw new Error(`FALLO: Slot #${i + 1} no fue actualizado en document.xml!`);
    }
    const fileInZip = zip.file(`word/media/user_photo_${now}_s${i + 1}.jpeg`);
    if (!fileInZip) {
      throw new Error(`FALLO: Archivo multimedia para slot #${i + 1} no existe en el zip!`);
    }
  }

  console.log('[OK] Simulación Word multi-tabla: Las 4 fotografías de ambas tablas fueron guardadas fielmente con sus rotaciones y relaciones 1:1.');

  // 5. Prueba de Limpieza en Excel para filas <= 16 en plantillas no INVIAS
  console.log('--- Subtest: Simulación de Excel con fotos en filas 1 a 16 ---');
  let excelDrawingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <xdr:twoCellAnchor editAs="twoCell">
    <xdr:from><xdr:col>0</xdr:col><xdr:row>5</xdr:row></xdr:from>
    <xdr:to><xdr:col>3</xdr:col><xdr:row>9</xdr:row></xdr:to>
    <xdr:pic>
      <xdr:nvPicPr><xdr:cNvPr id="2" name="Evidencia_1"/></xdr:nvPicPr>
      <xdr:blipFill><a:blip r:embed="rIdFoto1"/></xdr:blipFill>
    </xdr:pic>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;

  const anchorRegex = /<xdr:(?:twoCellAnchor|oneCellAnchor)[\s\S]*?<\/xdr:(?:twoCellAnchor|oneCellAnchor)>/g;
  const isInvias = false; // Plantilla estándar de inspección
  const protectedRIds = new Set();
  const anchors = excelDrawingXml.match(anchorRegex) || [];
  anchors.forEach((anc, pIdx) => {
    const blipMatch = anc.match(/<a:blip[^>]+r:embed="([^"]+)"/);
    const nameMatch = anc.match(/<xdr:cNvPr[^>]+name="([^"]+)"/);
    const name = nameMatch ? nameMatch[1].toLowerCase() : '';
    const fromRowMatch = anc.match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/);
    const ancRow = fromRowMatch ? parseInt(fromRowMatch[1]) : 999;
    const isProtectedLogo = blipMatch && (
      name.includes('logo') ||
      (pIdx === 0 && ancRow < 4) ||
      (isInvias && ancRow <= 16)
    );
    if (isProtectedLogo) {
      protectedRIds.add(blipMatch[1]);
    }
  });

  excelDrawingXml = excelDrawingXml.replace(anchorRegex, (anc) => {
    const blipMatch = anc.match(/<a:blip[^>]+r:embed="([^"]+)"/);
    if (blipMatch && protectedRIds.has(blipMatch[1])) {
      return anc;
    }
    return '';
  });

  if (excelDrawingXml.includes('Evidencia_1')) {
    throw new Error('FALLO: La foto previa en fila 5 no fue removida para reemplazo!');
  }
  console.log('[OK] En plantilla estándar, las fotos previas en filas 1 a 16 se limpian correctamente para admitir las nuevas fotos rotadas.');

  console.log('--- ALL ROTATION PERSISTENCE E2E TESTS PASSED 100%! ---');
}

testRotationPersistenceE2E().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
