const fs = require('fs');
const JSZip = require('../app/lib/jszip.min.js');
const XLSX = require('../app/lib/xlsx.full.min.js');

async function test() {
  // Create workbook
  const wb = XLSX.utils.book_new();
  const wsData = [
    ['INFORME TÉCNICO DE REGISTRO FOTOGRÁFICO', '', '', '', ''],
    ['PROYECTO: SUBESTACIÓN SUR', '', '', 'FECHA: 11/10/2026', ''],
    ['', '', '', '', ''],
    ['EVIDENCIA #1', '', '', 'EVIDENCIA #2', ''],
    ['', '', '', '', ''],
    ['', '', '', '', ''],
    ['', '', '', '', ''],
    ['', '', '', '', ''],
    ['Descripción: Excavación para cimentación', '', '', 'Descripción: Armado de acero estructural', '']
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, 'Evidencias');
  const outBuf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

  const zip = await JSZip.loadAsync(outBuf);

  // Minimal 1x1 valid JPEG
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

  zip.file('xl/media/image1.jpeg', sampleJpg);

  // drawing1.xml.rels
  const drawingRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.jpeg"/>
</Relationships>`;
  zip.file('xl/drawings/_rels/drawing1.xml.rels', drawingRels);

  // drawing1.xml
  const drawingXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <xdr:twoCellAnchor editAs="oneCell">
    <xdr:from><xdr:col>0</xdr:col><xdr:colOff>10000</xdr:colOff><xdr:row>4</xdr:row><xdr:rowOff>10000</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>2</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>8</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    <xdr:pic>
      <xdr:nvPicPr>
        <xdr:cNvPr id="2" name="Foto_1"/>
        <xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr>
      </xdr:nvPicPr>
      <xdr:blipFill>
        <a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId1"/>
        <a:stretch><a:fillRect/></a:stretch>
      </xdr:blipFill>
      <xdr:spPr>
        <a:xfrm><a:off x="0" y="0"/><a:ext cx="2400000" cy="1800000"/></a:xfrm>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
      </xdr:spPr>
    </xdr:pic>
    <xdr:clientData/>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;
  zip.file('xl/drawings/drawing1.xml', drawingXml);

  // sheet1.xml.rels
  const sheetRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdDrawing1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`;
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

  // Update sheet1.xml to reference drawing rIdDrawing1
  let s1 = await zip.file('xl/worksheets/sheet1.xml').async('string');
  // insert before </worksheet>
  s1 = s1.replace('</worksheet>', '<drawing xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdDrawing1"/></worksheet>');
  zip.file('xl/worksheets/sheet1.xml', s1);

  const finalBuf = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync('scripts/test_output.xlsx', finalBuf);
  console.log('Successfully written scripts/test_output.xlsx with size:', finalBuf.length);
}

test().catch(console.error);
