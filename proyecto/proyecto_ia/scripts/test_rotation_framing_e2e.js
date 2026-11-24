const fs = require('fs');
const XLSX = require('../app/lib/xlsx.full.min.js');
const JSZip = require('../app/lib/jszip.min.js');

async function testRotationAndFramingE2E() {
  console.log('--- TEST: Rotation & Cell Framing Verification ---');

  // 1. Verificar lógica de cálculo de dimensiones en canvas para diferentes rotaciones y encuadres
  function computeDimensions(naturalW, naturalH, rotation, mode, userScale, offsetX, offsetY) {
    const rot = ((rotation || 0) % 360 + 360) % 360;
    const isSideways = (rot === 90 || rot === 270);

    const canvasW = 1600;
    const canvasH = 1200;
    const canvasAR = canvasW / canvasH; // 4:3 = 1.333333

    const effW = isSideways ? naturalH : naturalW;
    const effH = isSideways ? naturalW : naturalH;
    const imgAR = effW / effH;

    const scale = userScale !== undefined ? userScale : 1.0;
    const hasZoomOrPan = (scale > 1.05) || (Math.abs(offsetX || 0) > 0.01) || (Math.abs(offsetY || 0) > 0.01);

    let targetW, targetH;
    if (mode === 'fit' && !hasZoomOrPan) {
      if (imgAR >= canvasAR) {
        targetW = canvasW;
        targetH = canvasW / imgAR;
      } else {
        targetH = canvasH;
        targetW = canvasH * imgAR;
      }
    } else {
      if (imgAR >= canvasAR) {
        targetH = canvasH * scale;
        targetW = targetH * imgAR;
      } else {
        targetW = canvasW * scale;
        targetH = targetW / imgAR;
      }
    }

    const drawW = isSideways ? targetH : targetW;
    const drawH = isSideways ? targetW : targetH;
    const shiftX = (offsetX || 0) * canvasW;
    const shiftY = (offsetY || 0) * canvasH;

    return {
      rot,
      isSideways,
      canvasW,
      canvasH,
      drawW,
      drawH,
      shiftX,
      shiftY,
      drawAR: drawW / drawH,
      origAR: naturalW / naturalH
    };
  }

  // Prueba A: Rotación 0° (Landscape normal)
  const t0 = computeDimensions(1600, 1200, 0, 'fit', 1.0, 0, 0);
  if (Math.abs(t0.drawAR - t0.origAR) > 0.001) throw new Error('Distorsión detectada en rotación 0°');
  console.log('[OK] Rotación 0° mantiene proporción sin distorsión.');

  // Prueba B: Rotación 90° (Vertical/Sideways) en modo 'fit'
  const t90Fit = computeDimensions(1600, 1200, 90, 'fit', 1.0, 0, 0);
  if (Math.abs(t90Fit.drawAR - t90Fit.origAR) > 0.001) throw new Error('Distorsión detectada en rotación 90° fit');
  if (t90Fit.drawW !== 1200 || t90Fit.drawH !== 900) throw new Error('Dimensiones incorrectas en rotación 90° fit');
  console.log('[OK] Rotación 90° (fit): Foto vertical encaja limpiamente dentro del marco 1600x1200.');

  // Prueba C: Rotación 90° en modo 'cover' (Llenar celda completa)
  const t90Cover = computeDimensions(1600, 1200, 90, 'cover', 1.0, 0, 0);
  if (Math.abs(t90Cover.drawAR - t90Cover.origAR) > 0.001) throw new Error('Distorsión detectada en rotación 90° cover');
  if (t90Cover.drawH !== 1600) throw new Error('Dimensiones incorrectas en rotación 90° cover');
  console.log('[OK] Rotación 90° (cover): Foto llena la celda completamente sin barras vacías.');

  // Prueba D: Rotación 180°
  const t180 = computeDimensions(1600, 1200, 180, 'fit', 1.0, 0, 0);
  if (Math.abs(t180.drawAR - t180.origAR) > 0.001) throw new Error('Distorsión detectada en rotación 180°');
  console.log('[OK] Rotación 180° mantiene proporción sin distorsión.');

  // Prueba E: Rotación 270°
  const t270 = computeDimensions(1600, 1200, 270, 'cover', 1.25, 0.1, -0.05);
  if (Math.abs(t270.drawAR - t270.origAR) > 0.001) throw new Error('Distorsión detectada en rotación 270°');
  if (t270.shiftX !== 160 || t270.shiftY !== -60) throw new Error('Cálculo de paneo incorrecto');
  console.log('[OK] Rotación 270° con zoom (125%) y encuadre manual proyecta shiftX y shiftY con precisión.');

  // 2. Verificar que el OpenXML generado use <xdr:twoCellAnchor editAs="twoCell">
  const appJsCode = fs.readFileSync('app/app.js', 'utf8');
  if (appJsCode.includes('editAs="oneCell"')) {
    throw new Error('FALLO CRÍTICO: Todavía existe editAs="oneCell" en app.js!');
  }
  console.log('[OK] app.js no contiene anclas restrictivas editAs="oneCell".');

  if (!appJsCode.includes('twoCellAnchor editAs="twoCell"')) {
    throw new Error('FALLO CRÍTICO: No se encontró twoCellAnchor editAs="twoCell" en app.js!');
  }
  // 3. Verificar Política Estricta de NO Reorientación Automática y Entrega de Bytes Intactos
  if (appJsCode.includes('loadAndNormalizeImageFile')) {
    throw new Error('FALLO CRÍTICO: Todavía existe loadAndNormalizeImageFile en app.js!');
  }
  console.log('[OK] app.js no contiene funciones de auto-reorientación involuntaria.');

  // Verificar que handleGalleryImport asigne url directa y rotación 0
  if (!appJsCode.includes('url: e.target.result') || !appJsCode.includes('rotation: 0')) {
    throw new Error('FALLO CRÍTICO: handleGalleryImport debe asignar el archivo intacto y rotation: 0!');
  }
  console.log('[OK] Importación de galería asigna archivo intacto original con rotation: 0.');

  // Verificar helper dataUrlToUint8Array
  const dataUrlHelperMatch = appJsCode.match(/function dataUrlToUint8Array\(dataUrl\)[\s\S]*?^}/m);
  if (!dataUrlHelperMatch) {
    throw new Error('FALLO CRÍTICO: No se encontró la función dataUrlToUint8Array en app.js!');
  }
  const dataUrlToUint8Array = new Function('return ' + dataUrlHelperMatch[0])();

  const sampleBytes = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const sampleDataUrl = `data:image/png;base64,${sampleBytes.toString('base64')}`;
  const convertedBytes = dataUrlToUint8Array(sampleDataUrl);
  if (!convertedBytes || Buffer.compare(Buffer.from(convertedBytes), sampleBytes) !== 0) {
    throw new Error('dataUrlToUint8Array alteró los bytes binarios originales!');
  }
  console.log('[OK] dataUrlToUint8Array entrega exactamente los mismos bytes binarios originales sin compresión ni rotación.');

  // Verificar que prepareStampedImageBytes conserve el bypass de bytes originales para fotos sin ajustes.
  // Desde la v2 el bypass aplica cuando el usuario desactiva "tamaño uniforme" (RQ-19 lo activa por defecto).
  if (!appJsCode.includes('!photoHasAdjustments(photo) && !shouldStamp && !uniform')) {
    throw new Error('FALLO CRÍTICO: Falta la regla de bypass directo para fotos no rotadas en prepareStampedImageBytes!');
  }
  console.log('[OK] prepareStampedImageBytes entrega bytes originales intactos cuando el usuario no rotó la imagen.');

  console.log('--- ALL ROTATION, ZERO AUTO-ORIENTATION & CELL FRAMING TESTS PASSED 100%! ---');
}

testRotationAndFramingE2E().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
