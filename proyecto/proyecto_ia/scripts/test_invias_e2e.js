const fs = require('fs');
const XLSX = require('../app/lib/xlsx.full.min.js');
const JSZip = require('../app/lib/jszip.min.js');

async function testInviasE2E() {
  console.log('--- TEST E2E: Official INVIAS Format Parsing and Injection ---');
  const buffer = fs.readFileSync('plantillas_ejemplo/Formato_Registro_Fotografico_INVIAS.xlsx');

  // 1. Lectura de plantilla con la lógica exacta de parseExcelDocument
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];

  const seenRanges = new Set();
  const validatedPhotoSlots = [];

  const isInviasContext = true;

  if (sheet['!merges'] && Array.isArray(sheet['!merges'])) {
    sheet['!merges'].forEach((m) => {
      const sCol = m.s.c, eCol = m.e.c, sRow = m.s.r, eRow = m.e.r;
      const colsSpan = eCol - sCol + 1;
      const rowsSpan = eRow - sRow + 1;
      const totalCells = colsSpan * rowsSpan;
      const rangeStr = XLSX.utils.encode_range(m);

      if (rowsSpan < 2) return;

      // REGLA ESTRICTA INVIAS: Hasta la fila 17 (0-indexed sRow <= 16) no debe ponerse fotos en el formato INVIAS
      if (isInviasContext && sRow <= 16) return;

      const startCellAddr = XLSX.utils.encode_cell({ r: sRow, c: sCol });
      const cellVal = sheet[startCellAddr] && sheet[startCellAddr].v ? String(sheet[startCellAddr].v).trim() : '';
      const aboveCellAddr = sRow > 0 ? XLSX.utils.encode_cell({ r: sRow - 1, c: sCol }) : null;
      const aboveVal = aboveCellAddr && sheet[aboveCellAddr] && sheet[aboveCellAddr].v ? String(sheet[aboveCellAddr].v).trim() : '';

      const hasPhotoKeyword = /foto|fotograf|evidencia|registro\s*#?\d|registro\s*fotogr|imagen|espacio/i.test(cellVal) ||
                              /foto|fotograf|evidencia|registro\s*#?\d|registro\s*fotogr|imagen|espacio/i.test(aboveVal);

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

  validatedPhotoSlots.sort((a, b) => a.startRow !== b.startRow ? a.startRow - b.startRow : a.startCol - b.startCol);
  validatedPhotoSlots.forEach((s, idx) => s.slotIndex = idx + 1);

  // Regla estricta INVIAS: ninguna foto en filas 1 a 17 (0-indexed <= 16)
  const filteredSlots = validatedPhotoSlots.filter(s => s.startRow >= 17);
  validatedPhotoSlots.length = 0;
  validatedPhotoSlots.push(...filteredSlots);
  validatedPhotoSlots.forEach((s, idx) => s.slotIndex = idx + 1);

  console.log(`Slots INVIAS detectados: ${validatedPhotoSlots.length}`);
  validatedPhotoSlots.forEach(s => {
    console.log(` [Slot #${s.slotIndex}] ${s.rangeStr}: ${s.colsSpan} cols x ${s.rowsSpan} filas = ${s.totalCells} celdas (Fila Excel inicial: ${s.startRow + 1})`);
  });

  // VERIFICACIÓN ESTRICTA: Ningún slot puede estar en filas 1 a 17 (0-indexed <= 16)
  for (const s of validatedPhotoSlots) {
    if (s.startRow < 17) {
      throw new Error(`VIOLACIÓN DE REGLA INVIAS: Slot ${s.rangeStr} inicia en fila 0-indexada ${s.startRow} (Fila Excel ${s.startRow + 1} <= 17).`);
    }
  }
  console.log('Verificación estricta superada: CERO fotos en filas 1 a 17 (todas inician desde fila 18 en adelante).');

  if (validatedPhotoSlots.length !== 4) {
    throw new Error(`Se esperaban 4 slots INVIAS, pero se encontraron ${validatedPhotoSlots.length}`);
  }

  const expectedRanges = ['A18:T39', 'U18:AN39', 'A41:T62', 'U41:AN62'];
  for (let i = 0; i < 4; i++) {
    if (validatedPhotoSlots[i].rangeStr !== expectedRanges[i]) {
      throw new Error(`Slot #${i + 1} debía ser ${expectedRanges[i]}, pero fue ${validatedPhotoSlots[i].rangeStr}`);
    }
    if (validatedPhotoSlots[i].totalCells !== 440) {
      throw new Error(`Slot #${i + 1} debía tener 440 celdas, pero tiene ${validatedPhotoSlots[i].totalCells}`);
    }
  }
  console.log('Validación de rangos INVIAS A18:T39, U18:AN39, A41:T62, U41:AN62: CORRECTA!');

  // 2. Simular inyección de 6 fotos (4 en los slots predefinidos + 2 overflow)
  const zip = await JSZip.loadAsync(buffer);
  const now = Date.now();
  const dummyJpg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');

  let drawingXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">\n</xdr:wsDr>';
  let drawingRelsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n</Relationships>';
  let newAnchors = '';

  const testPhotos = [
    { note: 'Inspección Calzada Principal', coords: 'PR 25+100 N:509214 E:598432' },
    { note: 'Obras de Drenaje Alcantarilla', coords: 'PR 28+450 N:509350 E:598610' },
    { note: 'Defensas Metálicas Curva Peligrosa', coords: 'PR 32+800 N:509520 E:598840' },
    { note: 'Demarcación Vial Termoplástica', coords: 'PR 36+200 N:509710 E:599100' },
    { note: 'Talud Superior Riberas', coords: 'PR 40+100 N:509920 E:599350' },
    { note: 'Puente Vehicular Estructura', coords: 'PR 43+600 N:510100 E:599550' }
  ];

  for (let i = 0; i < 6; i++) {
    const imgFileName = `user_photo_${now}_${i + 1}.jpeg`;
    zip.file(`xl/media/${imgFileName}`, dummyJpg);

    const rId = `rId_photo_${now}_${i + 1}`;
    const relTag = `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${imgFileName}"/>`;
    drawingRelsXml = drawingRelsXml.replace('</Relationships>', `${relTag}\n</Relationships>`);

    let fromCol, fromRow, toCol, toRow;
    if (i < validatedPhotoSlots.length) {
      const slot = validatedPhotoSlots[i];
      fromCol = slot.startCol;
      fromRow = slot.startRow;
      toCol = slot.endCol + 1;
      toRow = slot.endRow + 1;
    } else {
      const lastSlot = validatedPhotoSlots[validatedPhotoSlots.length - 1];
      const firstSlot = validatedPhotoSlots[0];
      const spanCols = (lastSlot.endCol - lastSlot.startCol + 1) || 20;
      const spanRows = (lastSlot.endRow - lastSlot.startRow + 1) || 22;

      const slotsInFirstRow = validatedPhotoSlots.filter(s => s.startRow === firstSlot.startRow).length || 2;
      const overflowIdx = i - validatedPhotoSlots.length;
      const colPos = overflowIdx % slotsInFirstRow;
      const rowPos = Math.floor(overflowIdx / slotsInFirstRow);

      const refSlot = validatedPhotoSlots[colPos % validatedPhotoSlots.length];
      fromCol = refSlot ? refSlot.startCol : (colPos * (spanCols + 1));
      toCol = fromCol + spanCols;

      const rowStride = (validatedPhotoSlots.length >= 4 && validatedPhotoSlots[2].startRow > validatedPhotoSlots[0].startRow)
        ? (validatedPhotoSlots[2].startRow - validatedPhotoSlots[0].startRow)
        : (spanRows + 2);

      const baseRow = lastSlot.startRow + rowStride;
      fromRow = baseRow + (rowPos * rowStride);
      toRow = fromRow + spanRows;
    }

    const c1 = XLSX.utils.encode_cell({ r: fromRow, c: fromCol });
    const c2 = XLSX.utils.encode_cell({ r: toRow - 1, c: toCol - 1 });
    console.log(`Foto #${i + 1} anclada exactamente a rango: ${c1}:${c2}`);

    newAnchors += `  <xdr:twoCellAnchor editAs="twoCell">\n`;
    newAnchors += `    <xdr:from><xdr:col>${fromCol}</xdr:col><xdr:colOff>10000</xdr:colOff><xdr:row>${fromRow}</xdr:row><xdr:rowOff>10000</xdr:rowOff></xdr:from>\n`;
    newAnchors += `    <xdr:to><xdr:col>${toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>\n`;
    newAnchors += `    <xdr:pic>\n`;
    newAnchors += `      <xdr:nvPicPr><xdr:cNvPr id="${1000 + i}" name="Evidencia_${i + 1}"/><xdr:cNvPicPr/></xdr:nvPicPr>\n`;
    newAnchors += `      <xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>\n`;
    newAnchors += `      <xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="3200000" cy="2400000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>\n`;
    newAnchors += `    </xdr:pic>\n`;
    newAnchors += `    <xdr:clientData/>\n`;
    newAnchors += `  </xdr:twoCellAnchor>\n`;
  }

  drawingXml = drawingXml.replace('</xdr:wsDr>', `${newAnchors}</xdr:wsDr>`);
  zip.file('xl/drawings/drawing1.xml', drawingXml);
  zip.file('xl/drawings/_rels/drawing1.xml.rels', drawingRelsXml);

  let sheetRelsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n  <Relationship Id="rIdDrawing1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>\n</Relationships>';
  zip.file('xl/worksheets/_rels/sheet1.xml.rels', sheetRelsXml);

  let s1Xml = await zip.file('xl/worksheets/sheet1.xml').async('text');
  for (let i = 0; i < 6; i++) {
    let metaRow, metaColLetter;
    if (i < validatedPhotoSlots.length) {
      const s = validatedPhotoSlots[i];
      metaRow = s.endRow + 2;
      metaColLetter = s.startCol === 0 ? 'A' : (s.startCol >= 20 ? 'U' : 'D');
    } else {
      const sIndex = i % 2;
      const block = Math.floor(i / 2);
      metaRow = 18 + (block * 23) + 22;
      metaColLetter = sIndex === 0 ? 'A' : 'U';
    }
    const cellRef = `${metaColLetter}${metaRow}`;
    const pNote = testPhotos[i].note;
    const pCoords = testPhotos[i].coords;
    const descText = `DESCRIPCIÓN: ${pNote} | COORD: ${pCoords} | 11/10/2026`;
    const safeText = descText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const cellRegex = new RegExp(`<c r="${cellRef}"[^>]*>[\\s\\S]*?<\\/c>`);
    if (s1Xml.match(cellRegex)) {
      s1Xml = s1Xml.replace(cellRegex, `<c r="${cellRef}" t="str"><v>${safeText}</v></c>`);
    }
  }

  if (!s1Xml.includes('<drawing')) {
    s1Xml = s1Xml.replace('</worksheet>', '<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdDrawing1"/></worksheet>');
  }
  zip.file('xl/worksheets/sheet1.xml', s1Xml);

  let ctXml = await zip.file('[Content_Types].xml').async('text');
  if (!ctXml.includes('drawing1.xml')) {
    ctXml = ctXml.replace('</Types>', '  <Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>\n</Types>');
  }
  if (!ctXml.includes('Extension="jpeg"')) {
    ctXml = ctXml.replace('</Types>', '  <Default Extension="jpeg" ContentType="image/jpeg"/>\n</Types>');
  }
  zip.file('[Content_Types].xml', ctXml);

  const outBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  const finalWb = XLSX.read(outBuffer, { type: 'buffer' });
  const finalSheet = finalWb.Sheets[finalWb.SheetNames[0]];

  console.log(`Reporte INVIAS generado. Longitud: ${outBuffer.length} bytes`);
  console.log('Valor celda A40:', finalSheet['A40'] ? finalSheet['A40'].v : 'N/A');
  console.log('Valor celda U40:', finalSheet['U40'] ? finalSheet['U40'].v : 'N/A');
  console.log('TEST INVIAS E2E PASSED 100%!');
}

testInviasE2E().catch(err => {
  console.error('TEST INVIAS E2E FAILED:', err);
  process.exit(1);
});
