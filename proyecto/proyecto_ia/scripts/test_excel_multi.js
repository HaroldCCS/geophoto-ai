const fs = require('fs');
const JSZip = require('../app/lib/jszip.min.js');
const XLSX = require('../app/lib/xlsx.full.min.js');

async function testMulti() {
  const wb = XLSX.utils.book_new();
  const wsData = [
    ['INFORME TÉCNICO DE REGISTRO FOTOGRÁFICO', '', '', '', '', ''],
    ['PROYECTO: SUBESTACIÓN SUR 115kV', '', 'FECHA: 11/10/2026', '', 'MUNICIPIO: Medellín, Antioquia', ''],
    ['', '', '', '', '', ''],
    ['ÍTEM', 'REGISTRO FOTOGRÁFICO (EVIDENCIA)', 'DETALLES / DESCRIPCIÓN', 'COORDENADAS TÉCNICAS', 'FECHA Y HORA', 'ESTADO']
  ];

  // We have 2 photos
  const photos = [
    {
      id: 'FOTO-001',
      title: 'Excavación manual para cimentación',
      note: 'Profundidad alcanzada de 1.80m conforme al diseño estructural.',
      coords: 'N 6° 15\' 24.3" W 75° 34\' 18.2" (CTM12: N: 5,023,410 E: 4,812,305)',
      date: '11/10/2026 10:45:12'
    },
    {
      id: 'FOTO-002',
      title: 'Armado de acero estructural',
      note: 'Colocación de parrilla inferior con varilla #5 y separadores de 5cm.',
      coords: 'N 6° 15\' 25.1" W 75° 34\' 19.0" (CTM12: N: 5,023,430 E: 4,812,320)',
      date: '11/10/2026 11:20:00'
    }
  ];

  const rowHeights = [
    { hpt: 26 }, // Title
    { hpt: 20 }, // Project info
    { hpt: 12 }, // Spacer
    { hpt: 24 }  // Header
  ];

  // For each photo, we reserve rows: row for photo start
  // Let's say each photo block occupies 6 rows in the sheet
  const photoRowSpans = [];

  photos.forEach((p, idx) => {
    const startRowIdx = wsData.length; // 0-based
    wsData.push([
      idx + 1,
      '', // Column B will contain the drawing
      `${p.title}\n\n${p.note}`,
      p.coords,
      p.date,
      'Conforme'
    ]);
    rowHeights.push({ hpt: 35 });

    // Additional 4 empty rows to give physical height for the photo
    for (let r = 0; r < 4; r++) {
      wsData.push(['', '', '', '', '', '']);
      rowHeights.push({ hpt: 35 });
    }

    // Spacer row
    wsData.push(['', '', '', '', '', '']);
    rowHeights.push({ hpt: 12 });

    photoRowSpans.push({
      startRow: startRowIdx,
      endRow: startRowIdx + 5,
      col: 1 // Column B (0-based is 1)
    });
  });

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [
    { wch: 8 },   // A: ÍTEM
    { wch: 44 },  // B: FOTO
    { wch: 42 },  // C: DETALLES
    { wch: 34 },  // D: COORDENADAS
    { wch: 22 },  // E: FECHA
    { wch: 14 }   // F: ESTADO
  ];
  ws['!rows'] = rowHeights;

  XLSX.utils.book_append_sheet(wb, ws, 'Evidencias');
  const outBuf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

  // Now inject images using JSZip
  const zip = await JSZip.loadAsync(outBuf);

  // Sample JPEG 1x1
  const sampleJpg = Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
    0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
    0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
    0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20,
    0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27,
    0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
    0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
    0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3F,
    0x00, 0xBF, 0x80, 0xFF, 0xD9
  ]);

  let drawingRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n`;
  let drawingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">\n`;

  photoRowSpans.forEach((span, i) => {
    const imgName = `image${i + 1}.jpeg`;
    zip.file(`xl/media/${imgName}`, sampleJpg);

    const rId = `rIdImg${i + 1}`;
    drawingRelsXml += `  <Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${imgName}"/>\n`;

    // Standard photo dimensions in EMUs: width ~320px (3048000 EMUs), height ~240px (2286000 EMUs)
    const cx = 3048000;
    const cy = 2286000;

    drawingXml += `  <xdr:twoCellAnchor editAs="oneCell">\n`;
    drawingXml += `    <xdr:from><xdr:col>${span.col}</xdr:col><xdr:colOff>60000</xdr:colOff><xdr:row>${span.startRow}</xdr:row><xdr:rowOff>60000</xdr:rowOff></xdr:from>\n`;
    drawingXml += `    <xdr:to><xdr:col>${span.col + 1}</xdr:col><xdr:colOff>-60000</xdr:colOff><xdr:row>${span.endRow}</xdr:row><xdr:rowOff>-60000</xdr:rowOff></xdr:to>\n`;
    drawingXml += `    <xdr:pic>\n`;
    drawingXml += `      <xdr:nvPicPr><xdr:cNvPr id="${i + 2}" name="Foto_${i + 1}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>\n`;
    drawingXml += `      <xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>\n`;
    drawingXml += `      <xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>\n`;
    drawingXml += `    </xdr:pic>\n`;
    drawingXml += `    <xdr:clientData/>\n`;
    drawingXml += `  </xdr:twoCellAnchor>\n`;
  });

  drawingRelsXml += `</Relationships>`;
  drawingXml += `</xdr:wsDr>`;

  zip.file('xl/drawings/_rels/drawing1.xml.rels', drawingRelsXml);
  zip.file('xl/drawings/drawing1.xml', drawingXml);

  // sheet1.xml.rels
  const sheetRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n  <Relationship Id="rIdDrawing1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>\n</Relationships>`;
  zip.file('xl/worksheets/_rels/sheet1.xml.rels', sheetRels);

  // Update [Content_Types].xml
  let ct = await zip.file('[Content_Types].xml').async('string');
  if (!ct.includes('Extension="jpeg"')) {
    ct = ct.replace('</Types>', '<Default Extension="jpeg" ContentType="image/jpeg"/></Types>');
  }
  if (!ct.includes('drawing1.xml')) {
    ct = ct.replace('</Types>', '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>');
  }
  zip.file('[Content_Types].xml', ct);

  // Update sheet1.xml
  let s1 = await zip.file('xl/worksheets/sheet1.xml').async('string');
  if (s1.includes('<tableParts')) {
    s1 = s1.replace('<tableParts', '<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdDrawing1"/><tableParts');
  } else if (s1.includes('<extLst')) {
    s1 = s1.replace('<extLst', '<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdDrawing1"/><extLst');
  } else {
    s1 = s1.replace('</worksheet>', '<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdDrawing1"/></worksheet>');
  }
  zip.file('xl/worksheets/sheet1.xml', s1);

  const finalBuf = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync('scripts/test_multi_output.xlsx', finalBuf);
  console.log('Successfully written scripts/test_multi_output.xlsx! Size:', finalBuf.length);
}

testMulti().catch(console.error);
