/**
 * Prueba del modelo único de ajuste de foto (computePhotoLayout):
 * rotación libre, espejo, encaje fit/cover y proporciones libres.
 * Ejecutar desde proyecto_ia/:  node scripts/test_layout_model.js
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'app.js'), 'utf8');
const start = src.indexOf('function computePhotoLayout(');
const end = src.indexOf('window.computePhotoLayout', start);
// eslint-disable-next-line no-new-func
const computePhotoLayout = new Function(`${src.slice(start, end)}; return computePhotoLayout;`)();

const W = 1600, H = 1200;
const near = (a, b, tol = 0.5) => Math.abs(a - b) <= tol;

// Vértices de la foto dibujada (centrada, rotada) para comprobar si cabe o cubre el marco
function corners(L) {
  const r = (L.rot * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => {
    const px = (x * L.drawW) / 2, py = (y * L.drawH) / 2;
    return [W / 2 + L.tx + px * c - py * s, H / 2 + L.ty + px * s + py * c];
  });
}

// 1. Sin ajustes: foto 4:3 llena exacto el lienzo 4:3
let L = computePhotoLayout({}, W, H, 3264, 2448);
assert(near(L.drawW, 1600) && near(L.drawH, 1200), 'fit 0° debe llenar el lienzo 4:3');
console.log('[OK] Foto 4:3 sin ajustes ocupa todo el lienzo');

// 2. Rotación libre 17° en fit: las 4 esquinas quedan dentro del marco
L = computePhotoLayout({ rotation: 17 }, W, H, 3264, 2448);
corners(L).forEach(([x, y]) => assert(x >= -0.5 && x <= W + 0.5 && y >= -0.5 && y <= H + 0.5, `esquina fuera del marco: ${x},${y}`));
assert(near(L.drawW / L.drawH, 3264 / 2448, 0.001), 'no debe distorsionar');
console.log('[OK] Rotación libre 17° (fit) cabe completa y sin distorsión');

// 3. Rotación libre 17° en cover: las 4 esquinas del marco quedan dentro de la foto rotada
L = computePhotoLayout({ rotation: 17, fitMode: 'cover' }, W, H, 3264, 2448);
const r = (-17 * Math.PI) / 180;
[[0, 0], [W, 0], [W, H], [0, H]].forEach(([x, y]) => {
  const dx = x - W / 2, dy = y - H / 2;
  const lx = dx * Math.cos(r) - dy * Math.sin(r), ly = dx * Math.sin(r) + dy * Math.cos(r);
  assert(Math.abs(lx) <= L.drawW / 2 + 0.5 && Math.abs(ly) <= L.drawH / 2 + 0.5, 'quedó un hueco blanco en cover');
});
console.log('[OK] Rotación libre 17° (cover) cubre todo el marco sin huecos');

// 4. 90° fit con foto vertical 3:4: encaja de lado sin distorsión
L = computePhotoLayout({ rotation: 90 }, W, H, 2448, 3264);
assert(near(L.drawW, 1200) && near(L.drawH, 1600), '90° fit vertical: la foto 3:4 girada llena el marco 4:3');
console.log('[OK] Rotación 90° de foto vertical encaja en el marco');

// 5. Espejo
L = computePhotoLayout({ flipH: true }, W, H, 100, 100);
assert(L.sx === -1 && L.sy === 1, 'espejo horizontal');
L = computePhotoLayout({ flipV: true }, W, H, 100, 100);
assert(L.sx === 1 && L.sy === -1, 'espejo vertical');
console.log('[OK] Espejo horizontal y vertical');

// 6. Proporciones libres: estira al marco exacto
L = computePhotoLayout({ lockAspect: false }, W, H, 1000, 3000);
assert(near(L.drawW, W) && near(L.drawH, H), 'estirar debe ocupar el marco');
console.log('[OK] Proporciones desbloqueadas estiran la foto al marco');

// 7. Zoom y desplazamiento
L = computePhotoLayout({ scale: 1.5, offsetX: 0.1, offsetY: -0.2 }, W, H, 3264, 2448);
assert(near(L.drawW, 2400) && near(L.tx, 160) && near(L.ty, -240), 'zoom y paneo');
console.log('[OK] Zoom 150% y desplazamiento');

console.log('--- MODELO DE AJUSTE: TODAS LAS PRUEBAS PASARON ---');
