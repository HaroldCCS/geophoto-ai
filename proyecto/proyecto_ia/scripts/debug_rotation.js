// Simulate rotation and framing calculations
function testRotation(naturalW, naturalH, rotation, mode, scale, offsetX, offsetY) {
  const rot = ((rotation || 0) % 360 + 360) % 360;
  const isSideways = (rot === 90 || rot === 270);

  const untransformedW = isSideways ? naturalH : naturalW;
  const untransformedH = isSideways ? naturalW : naturalH;
  const imgAR = untransformedW / untransformedH;

  const userScale = scale !== undefined ? scale : 1.0;
  const hasZoomOrPan = (userScale > 1.05) || (Math.abs(offsetX || 0) > 0.01) || (Math.abs(offsetY || 0) > 0.01);

  let canvasW, canvasH;
  let drawW, drawH;
  let shiftX = 0;
  let shiftY = 0;

  if (mode === 'fit' && !hasZoomOrPan) {
    if (imgAR >= 1.0) {
      canvasW = 1600;
      canvasH = Math.max(200, Math.round(1600 / imgAR));
    } else {
      canvasH = 1600;
      canvasW = Math.max(200, Math.round(1600 * imgAR));
    }

    const scaleFactor = isSideways ? (canvasW / naturalH) : (canvasW / naturalW);
    drawW = naturalW * scaleFactor;
    drawH = naturalH * scaleFactor;
    shiftX = 0;
    shiftY = 0;
  } else {
    canvasW = 1600;
    canvasH = 1200;
    const canvasAR = canvasW / canvasH;

    let baseScale;
    if (imgAR >= canvasAR) {
      baseScale = canvasH / untransformedH;
    } else {
      baseScale = canvasW / untransformedW;
    }

    const totalScale = baseScale * userScale;
    drawW = naturalW * totalScale;
    drawH = naturalH * totalScale;
    shiftX = (offsetX || 0) * canvasW;
    shiftY = (offsetY || 0) * canvasH;
  }

  return {
    rot,
    isSideways,
    untransformedW,
    untransformedH,
    imgAR,
    canvasW,
    canvasH,
    drawW,
    drawH,
    shiftX,
    shiftY
  };
}

console.log('--- TEST 1: Landscape 1200x900, rot=0 ---');
console.log(testRotation(1200, 900, 0, 'fit', 1.0, 0, 0));

console.log('--- TEST 2: Landscape 1200x900, rot=90 ---');
console.log(testRotation(1200, 900, 90, 'fit', 1.0, 0, 0));

console.log('--- TEST 3: Landscape 1200x900, rot=90, cover ---');
console.log(testRotation(1200, 900, 90, 'cover', 1.0, 0, 0));

console.log('--- TEST 4: Landscape 1200x900, rot=180 ---');
console.log(testRotation(1200, 900, 180, 'fit', 1.0, 0, 0));
