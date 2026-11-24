const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../app/index.html'), 'utf8');

// Parse all IDs in html
const ids = new Set();
const idRegex = /id=["']([^"']+)["']/g;
let m;
while ((m = idRegex.exec(html)) !== null) {
  ids.add(m[1]);
}

// Create a DOM mock
const elements = {};
function createMockElement(id) {
  const el = {
    id,
    classList: {
      add: () => {},
      remove: () => {},
      contains: () => false,
      toggle: () => {}
    },
    style: {},
    dataset: {},
    children: [],
    appendChild: (child) => { el.children.push(child); return child; },
    removeChild: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    setAttribute: () => {},
    getAttribute: () => null,
    removeAttribute: () => {},
    querySelector: (sel) => createMockElement(sel),
    querySelectorAll: (sel) => [createMockElement(sel)],
    innerHTML: '',
    textContent: '',
    value: '100',
    checked: false,
    clientWidth: 320,
    clientHeight: 240
  };
  return el;
}

ids.forEach(id => {
  elements[id] = createMockElement(id);
});

global.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  sessionStorage: { getItem: () => null, setItem: () => {} },
  localStorage: { getItem: () => null, setItem: () => {} },
  location: { origin: 'http://localhost:8080' },
  navigator: { onLine: true, userAgent: 'test' },
  matchMedia: (query) => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
};
global.document = {
  getElementById: (id) => elements[id] || null,
  querySelector: (sel) => null,
  querySelectorAll: (sel) => [],
  addEventListener: () => {},
  createElement: (tag) => createMockElement(tag),
  readyState: 'complete',
  referrer: ''
};
global.navigator = global.window.navigator;
global.localStorage = global.window.localStorage;
global.sessionStorage = global.window.sessionStorage;

require('../app/app.js');

console.log('Testing openCropModal(0)...');
window.openCropModal(0);
console.log('Transform after open:', elements['crop-preview-img'].style.transform);

console.log('Testing panCrop(-0.08, 0)...');
window.panCrop(-0.08, 0);
console.log('Transform after panCrop:', elements['crop-preview-img'].style.transform);

console.log('Testing centerCropPan()...');
window.centerCropPan();
console.log('Transform after centerCropPan:', elements['crop-preview-img'].style.transform);

console.log('Testing adjustCropZoom(10)...');
window.adjustCropZoom(10);
console.log('Transform after adjustCropZoom:', elements['crop-preview-img'].style.transform);

console.log('Testing onCropZoomChange(150)...');
window.onCropZoomChange(150);
console.log('Transform after onCropZoomChange:', elements['crop-preview-img'].style.transform);

console.log('Testing setCropFitMode("cover")...');
window.setCropFitMode('cover');
console.log('Class after setCropFitMode cover:', elements['crop-preview-img'].className);

console.log('Testing setCropFitMode("fit")...');
window.setCropFitMode('fit');
console.log('Class after setCropFitMode fit:', elements['crop-preview-img'].className);

console.log('Testing rotateCropModal(90)...');
window.rotateCropModal(90);
console.log('Transform after rotateCropModal:', elements['crop-preview-img'].style.transform);

console.log('Testing resetCropModal()...');
window.resetCropModal();
console.log('Transform after resetCropModal:', elements['crop-preview-img'].style.transform);

console.log('Testing saveCropModal()...');
window.saveCropModal();

console.log('ALL CROP FUNCTIONS SUCCEEDED WITH ZERO ERRORS!');
