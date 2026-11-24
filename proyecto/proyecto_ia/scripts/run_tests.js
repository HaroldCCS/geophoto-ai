/**
 * Ejecuta todas las pruebas scripts/test_*.js (desde proyecto_ia/: npm test)
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const tests = fs.readdirSync(__dirname).filter(f => /^test_.*\.js$/.test(f)).sort();
let failed = 0;
for (const t of tests) {
  const r = spawnSync(process.execPath, [path.join('scripts', t)], { cwd: root, encoding: 'utf8', timeout: 120000 });
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${t}`);
  if (!ok) console.log((r.stdout + r.stderr).split('\n').slice(-12).join('\n'));
}
console.log(`\n${tests.length - failed}/${tests.length} pruebas pasaron`);
process.exit(failed ? 1 : 0);
