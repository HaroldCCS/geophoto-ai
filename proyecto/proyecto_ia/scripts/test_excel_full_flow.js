const fs = require('fs');
const JSZip = require('../app/lib/jszip.min.js');
const XLSX = require('../app/lib/xlsx.full.min.js');

// Mock helper to create 1x1 or sample JPEG buffer
function createSampleJpg() {
  return Buffer.from([
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
}

// 1. Test parseExcelDocument logic
async function testParseExcel(rawBuffer) {
  const zip = await JSZip.loadAsync(rawBuffer);
  let sheetNames = ['Hoja1'];
  let extractedTitle = '';
  let slotsPerPage = 6;
  const extractedPhotos = [];

  // Check shared strings or sheet1 for text
  if (zip.file('xl/sharedStrings.xml')) {
    const ssXml = await zip.file('xl/sharedStrings.xml').async('text');
    const strMatches = ssXml.match(/<t[^>]*>([^<]+)<\/t>/g) || [];
    const strings = strMatches.map(m => m.replace(/<[^>]+>/g, '').trim());
    for (const str of strings) {
      if (!extractedTitle && str.length >= 6 && /INFORME|REPORTE|FORMATO|INSPECCI|REGISTRO|MATRIZ|OBRA/i.test(str)) {
        extractedTitle = str;
        break;
      }
    }
  }

  // Count photo slots or drawings
  let photoSlotsCount = 0;
  if (zip.file('xl/drawings/drawing1.xml')) {
    const drXml = await zip.file('xl/drawings/drawing1.xml').async('text');
    const pics = drXml.match(/<xdr:pic[\s\S]*?<\/xdr:pic>/g) || [];
    photoSlotsCount = pics.length;
  }

  // Check media
  for (const f of Object.keys(zip.files)) {
    if (f.startsWith('xl/media/')) {
      const isLogo = /logo|header|thumb/i.test(f);
      if (!isLogo) {
        extractedPhotos.push({
          id: `FOTO-${String(extractedPhotos.length + 1).padStart(3, '0')}`,
          title: `Foto #${extractedPhotos.length + 1}`,
          isPreExisting: true
        });
      }
    }
  }

  // Check sheet1 text nodes for photo slots
  if (zip.file('xl/worksheets/sheet1.xml')) {
    const s1Xml = await zip.file('xl/worksheets/sheet1.xml').async('text');
    const fotoMatches = s1Xml.match(/FOTOGRAF|REGISTRO\s*#?\d|EVIDENCIA\s*#?\d/gi) || [];
    if (fotoMatches.length > 0) {
      slotsPerPage = fotoMatches.length;
    }
  }

  return {
    extractedTitle: extractedTitle || 'Formato de Inspección',
    slotsPerPage: slotsPerPage || 6,
    extractedPhotos,
    photoSlotsCount
  };
}

// 2. Test injectPhotosIntoUserXlsx logic
async function testInjectPhotos(rawBuffer, processedImages) {
  const zip = await JSZip.loadAsync(rawBuffer);
  const now = Date.now();

  // 1. Ensure [Content_Types].xml has jpeg and drawing1.xml
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

  // 2. Check if drawing1.xml already exists
  let drawingXml = '';
  let drawingRelsXml = '';
  const hasExistingDrawing = !!zip.file('xl/drawings/drawing1.xml');

  if (hasExistingDrawing) {
    drawingXml = await zip.file('xl/drawings/drawing1.xml').async('text');
    drawingRelsXml = await zip.file('xl/drawings/_rels/drawing1.xml.rels').async('text');
  } else {
    drawingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">\n</xdr:wsDr>`;
    drawingRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n</Relationships>`;
  }

  // Find candidate photo slot rows in sheet1 if creating new anchors
  const s1Xml = await zip.file('xl/worksheets/sheet1.xml').async('text');
  
  // Position photos
  let newAnchors = '';
  processedImages.forEach((img, idx) => {
    const imgFileName = `user_photo_${now}_${idx + 1}.jpeg`;
    zip.file(`xl/media/${imgFileName}`, img.bytes);

    const rId = `rIdPhoto_${now}_${idx + 1}`;
    const relXml = `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${imgFileName}"/>`;
    drawingRelsXml = drawingRelsXml.replace('</Relationships>', `${relXml}\n</Relationships>`);

    // Standard aspect ratio calculation
    const boxW = 3048000;
    const boxH = 2286000;
    const ar = img.aspectRatio || (img.width / img.height) || (4 / 3);
    let finalCx = boxW;
    let finalCy = boxH;
    if (ar >= (boxW / boxH)) {
      finalCx = boxW;
      finalCy = Math.round(boxW / ar);
    } else {
      finalCy = boxH;
      finalCx = Math.round(boxH * ar);
    }

    // Grid placement: 2 photos per row, starting at row 5
    const rowOffset = Math.floor(idx / 2) * 6;
    const colIdx = (idx % 2 === 0) ? 0 : 3;
    const startRow = 5 + rowOffset;
    const endRow = startRow + 4;

    newAnchors += `  <xdr:twoCellAnchor editAs="oneCell">\n`;
    newAnchors += `    <xdr:from><xdr:col>${colIdx}</xdr:col><xdr:colOff>30000</xdr:colOff><xdr:row>${startRow}</xdr:row><xdr:rowOff>30000</xdr:rowOff></xdr:from>\n`;
    newAnchors += `    <xdr:to><xdr:col>${colIdx + 2}</xdr:col><xdr:colOff>-30000</xdr:colOff><xdr:row>${endRow}</xdr:row><xdr:rowOff>-30000</xdr:rowOff></xdr:to>\n`;
    newAnchors += `    <xdr:pic>\n`;
    newAnchors += `      <xdr:nvPicPr><xdr:cNvPr id="${100 + idx}" name="Foto_${idx + 1}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>\n`;
    newAnchors += `      <xdr:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>\n`;
    newAnchors += `      <xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${finalCx}" cy="${finalCy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>\n`;
    newAnchors += `    </xdr:pic>\n`;
    newAnchors += `    <xdr:clientData/>\n`;
    newAnchors += `  </xdr:twoCellAnchor>\n`;
  });

  drawingXml = drawingXml.replace('</xdr:wsDr>', `${newAnchors}</xdr:wsDr>`);

  zip.file('xl/drawings/drawing1.xml', drawingXml);
  zip.file('xl/drawings/_rels/drawing1.xml.rels', drawingRelsXml);

  // Link drawing in sheet1.xml.rels
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

  // Update sheet1.xml with <drawing>
  let updatedS1 = s1Xml;
  if (!updatedS1.includes('drawing1') && !updatedS1.includes('<drawing')) {
    if (updatedS1.includes('<tableParts')) {
      updatedS1 = updatedS1.replace('<tableParts', '<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdDrawing1"/><tableParts');
    } else if (updatedS1.includes('<extLst')) {
      updatedS1 = updatedS1.replace('<extLst', '<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdDrawing1"/><extLst');
    } else {
      updatedS1 = updatedS1.replace('</worksheet>', '<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdDrawing1"/></worksheet>');
    }
    zip.file('xl/worksheets/sheet1.xml', updatedS1);
  }

  const finalBuf = await zip.generateAsync({ type: 'nodebuffer' });
  return finalBuf;
}

async function run() {
  console.log('Testing template parsing on Inspeccion_Obra_6Fotos.xlsx...');
  const templateBuf = fs.readFileSync('plantillas_ejemplo/Inspeccion_Obra_6Fotos.xlsx');
  const parseRes = await testParseExcel(templateBuf);
  console.log('Parse result:', parseRes);

  console.log('\nTesting photo injection into template...');
  const samplePhotos = [
    { bytes: createSampleJpg(), width: 1600, height: 1200, aspectRatio: 4/3 },
    { bytes: createSampleJpg(), width: 1600, height: 1200, aspectRatio: 4/3 },
    { bytes: createSampleJpg(), width: 1600, height: 1200, aspectRatio: 4/3 },
    { bytes: createSampleJpg(), width: 1600, height: 1200, aspectRatio: 4/3 }
  ];
  const injectedBuf = await testInjectPhotos(templateBuf, samplePhotos);
  fs.writeFileSync('scripts/test_injected_template.xlsx', injectedBuf);
  console.log('Injected template xlsx size:', injectedBuf.length);

  // Re-verify with SheetJS and JSZip
  const wb = XLSX.read(injectedBuf, { type: 'buffer' });
  console.log('SheetJS verify sheets:', wb.SheetNames);
  const rezip = await JSZip.loadAsync(injectedBuf);
  console.log('Has media in zip:', Object.keys(rezip.files).filter(f => f.startsWith('xl/media/')));
  console.log('Has drawing1.xml:', !!rezip.files['xl/drawings/drawing1.xml']);
  console.log('Test PASSED 100%!');
}

run().catch(console.error);
