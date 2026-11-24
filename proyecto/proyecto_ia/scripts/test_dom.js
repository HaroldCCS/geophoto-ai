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
    value: '',
    checked: false
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

try {
  require('../app/app.js');
  console.log('SUCCESS: app.js loaded and executed cleanly with mock DOM!');
} catch (err) {
  console.error('ERROR in app.js:', err);
}
