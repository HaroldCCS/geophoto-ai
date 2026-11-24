const fs = require('fs');
const XLSX = require('../app/lib/xlsx.full.min.js');
const JSZip = require('../app/lib/jszip.min.js');

async function testE2E() {
  console.log('--- TEST E2E: Parse and Inject Excel Template ---');
  const buffer = fs.readFileSync('plantillas_ejemplo/Inspeccion_Obra_6Fotos.xlsx');

  // 1. Simular lectura y análisis de plantilla (como en parseExcelDocument)
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellStyles: true });
  const sheetName = wb.SheetNames[0];
  const firstSheet = wb.Sheets[sheetName];

  const seenRanges = new Set();
  const validatedPhotoSlots = [];

  if (firstSheet['!merges'] && Array.isArray(firstSheet['!merges'])) {
    firstSheet['!merges'].forEach((m) => {
      const sCol = m.s.c, eCol = m.e.c, sRow = m.s.r, eRow = m.e.r;
      const colsSpan = eCol - sCol + 1;
      const rowsSpan = eRow - sRow + 1;
      const totalCells = colsSpan * rowsSpan;
      const rangeStr = XLSX.utils.encode_range(m);

      if (rowsSpan < 2) return;

      const startCellAddr = XLSX.utils.encode_cell({ r: sRow, c: sCol });
      const cellVal = firstSheet[startCellAddr] && firstSheet[startCellAddr].v ? String(firstSheet[startCellAddr].v).trim() : '';
      const aboveCellAddr = sRow > 0 ? XLSX.utils.encode_cell({ r: sRow - 1, c: sCol }) : null;
      const aboveVal = aboveCellAddr && firstSheet[aboveCellAddr] && firstSheet[aboveCellAddr].v ? String(firstSheet[aboveCellAddr].v).trim() : '';

      const hasPhotoKeyword = /foto|fotograf|evidencia|registro\s*#?\d|registro\s*fotogr|imagen|espacio/i.test(cellVal) ||
                              /foto|fotograf|evidencia|registro\s*#?\d|registro\s*fotogr|imagen|espacio/i.test(aboveVal);

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

  console.log(`Slots validados encontrados: ${validatedPhotoSlots.length}`);
  validatedPhotoSlots.forEach(s => {
    console.log(` - Slot #${s.slotIndex} [${s.rangeStr}]: ${s.colsSpan} cols x ${s.rowsSpan} filas = ${s.totalCells} celdas (${s.keyword})`);
  });

  if (validatedPhotoSlots.length !== 6) {
    throw new Error(`Esperaba 6 slots validados, pero encontré ${validatedPhotoSlots.length}`);
  }

  // 2. Simular inyección de 6 fotos en las celdas validadas
  const zip = await JSZip.loadAsync(buffer);
  const now = Date.now();
  const dummyJpg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');

  let drawingXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">\n</xdr:wsDr>';
  let drawingRelsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n</Relationships>';
  let newAnchors = '';

  for (let i = 0; i < 6; i++) {
    const slot = validatedPhotoSlots[i];
    const imgFileName = `user_photo_${now}_${i + 1}.jpeg`;
    zip.file(`xl/media/${imgFileName}`, dummyJpg);

    const rId = `rId_photo_${now}_${i + 1}`;
    const relTag = `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${imgFileName}"/>`;
    drawingRelsXml = drawingRelsXml.replace('</Relationships>', `${relTag}\n</Relationships>`);

    const fromCol = slot.startCol;
    const fromRow = slot.startRow;
    const toCol = slot.endCol + 1;
    const toRow = slot.endRow + 1;

    newAnchors += `  <xdr:twoCellAnchor editAs="oneCell">\n`;
    newAnchors += `    <xdr:from><xdr:col>${fromCol}</xdr:col><xdr:colOff>15000</xdr:colOff><xdr:row>${fromRow}</xdr:row><xdr:rowOff>15000</xdr:rowOff></xdr:from>\n`;
    newAnchors += `    <xdr:to><xdr:col>${toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>\n`;
    newAnchors += `    <xdr:pic>\n`;
    newAnchors += `      <xdr:nvPicPr><xdr:cNvPr id="${1000 + i}" name="Evidencia_${i + 1}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>\n`;
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
  if (!s1Xml.includes('<drawing')) {
    s1Xml = s1Xml.replace('</worksheet>', '<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdDrawing1"/></worksheet>');
    zip.file('xl/worksheets/sheet1.xml', s1Xml);
  }

  let ctXml = await zip.file('[Content_Types].xml').async('text');
  if (!ctXml.includes('drawing1.xml')) {
    ctXml = ctXml.replace('</Types>', '  <Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>\n</Types>');
  }
  if (!ctXml.includes('Extension="jpeg"')) {
    ctXml = ctXml.replace('</Types>', '  <Default Extension="jpeg" ContentType="image/jpeg"/>\n</Types>');
  }
  zip.file('[Content_Types].xml', ctXml);

  const outBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  const verifiedWb = XLSX.read(outBuffer, { type: 'buffer' });
  console.log(`Excel generado con éxito. Hojas: ${verifiedWb.SheetNames.join(', ')}`);
  console.log(`Tamaño archivo generado: ${outBuffer.length} bytes`);
  console.log('TEST E2E PASSED PERFECTLY!');
}

testE2E().catch(err => {
  console.error('TEST E2E FAILED:', err);
  process.exit(1);
});
