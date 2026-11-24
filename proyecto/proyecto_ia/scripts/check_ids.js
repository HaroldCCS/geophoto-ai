const fs = require('fs');
const html = fs.readFileSync('app/index.html', 'utf8');
const js = fs.readFileSync('app/app.js', 'utf8');

// Find all getElementById in js
const regex = /getElementById\(['"]([^'"]+)['"]\)/g;
let match;
const missing = new Set();
const found = new Set();
while ((match = regex.exec(js)) !== null) {
  const id = match[1];
  if (!html.includes('id="' + id + '"') && !html.includes("id='" + id + "'")) {
    missing.add(id);
  } else {
    found.add(id);
  }
}
console.log('TOTAL UNIQUE IDs IN JS:', found.size + missing.size);
console.log('FOUND IDs:', found.size);
console.log('MISSING IDs referenced in app.js:', Array.from(missing));

// Check all onclick in html
const clickRegex = /onclick="([^"(]+)/g;
const fnNames = new Set();
while ((match = clickRegex.exec(html)) !== null) {
  fnNames.add(match[1].trim());
}

console.log('ONCLICK FUNCTIONS IN HTML:', Array.from(fnNames));
const missingFns = [];
fnNames.forEach(fn => {
  // Check if declared as function fn or window.fn
  const hasFn = js.includes('function ' + fn) || js.includes('window.' + fn) || js.includes(fn + ' =');
  if (!hasFn) {
    missingFns.push(fn);
  }
});
console.log('MISSING FUNCTIONS in app.js:', missingFns);
