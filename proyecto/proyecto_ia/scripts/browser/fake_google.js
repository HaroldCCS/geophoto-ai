/**
 * Google Drive + Sheets simulados para probar modules/cloud.js en el navegador sin credenciales.
 * Uso (consola o prueba automatizada):
 *   const fake = createFakeGoogle(); Cloud._http = fake.http; Cloud._setTokenForTests({access_token:'x', expiresAt: Date.now()+3600e3});
 * Implementa solo los endpoints que usa la app.
 */
function createFakeGoogle() {
  const files = new Map([['root', { id: 'root', name: 'Mi unidad', mimeType: 'folder', parents: [] }]]);
  const sheets = new Map();
  let seq = 0;
  const id = p => `${p}${++seq}_${Math.random().toString(36).slice(2, 12)}`; // largo como un ID real de Drive
  const link = f => (f.mimeType === 'application/vnd.google-apps.folder' ? `https://drive.google.com/drive/folders/${f.id}` : `https://drive.google.com/file/d/${f.id}/view`);
  const pub = f => ({ id: f.id, name: f.name, mimeType: f.mimeType, webViewLink: link(f), trashed: false });
  const log = [];

  function colIdx(letters) { return letters.split('').reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1; }
  function parseRange(r) {
    const [sheet, cells = 'A1'] = decodeURIComponent(r).split('!');
    const m = cells.match(/^([A-Z]+)(\d*)/);
    return { sheet, col: colIdx(m[1]), row: m[2] ? Number(m[2]) - 1 : 0 };
  }

  async function http(method, url, opts = {}) {
    const u = new URL(url);
    log.push(`${method} ${u.pathname}`);
    const body = opts.json !== undefined ? opts.json : null;
    // ---- Drive ----
    if (u.host === 'www.googleapis.com' && u.pathname === '/drive/v3/files' && method === 'GET') {
      const q = u.searchParams.get('q');
      const name = (q.match(/name='((?:[^'\\]|\\.)*)'/) || [])[1].replace(/\\'/g, "'");
      const parent = (q.match(/'([^']+)' in parents/) || [])[1];
      const found = [...files.values()].filter(f => f.name === name && f.parents.includes(parent) && f.mimeType === 'application/vnd.google-apps.folder');
      return { files: found.slice(0, 1).map(pub) };
    }
    if (u.host === 'www.googleapis.com' && u.pathname === '/drive/v3/files' && method === 'POST') {
      const f = { id: id('fld'), name: body.name, mimeType: body.mimeType, parents: body.parents || ['root'] };
      files.set(f.id, f); return pub(f);
    }
    let m = u.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (m && method === 'GET') { const f = files.get(m[1]); if (!f) throw new Error('Google respondió: File not found'); return pub(f); }
    if (m && method === 'PATCH') {
      const f = files.get(m[1]); const add = u.searchParams.get('addParents');
      if (add) f.parents = [add]; return pub(f);
    }
    if (u.pathname === '/upload/drive/v3/files' && method === 'POST') {
      const text = await opts.body.slice(0, 4096).text();
      const meta = JSON.parse(text.split('\r\n\r\n')[1].split('\r\n')[0]);
      const f = { id: id('file'), name: meta.name, mimeType: meta.mimeType, parents: meta.parents, size: opts.body.size };
      files.set(f.id, f); return pub(f);
    }
    // ---- Sheets ----
    if (u.host === 'sheets.googleapis.com') {
      if (u.pathname === '/v4/spreadsheets' && method === 'POST') {
        const sid = id('sheet');
        const tabs = {}; body.sheets.forEach(s => { tabs[s.properties.title] = []; });
        sheets.set(sid, tabs);
        files.set(sid, { id: sid, name: body.properties.title, mimeType: 'application/vnd.google-apps.spreadsheet', parents: ['root'] });
        return { spreadsheetId: sid, spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${sid}` };
      }
      m = u.pathname.match(/^\/v4\/spreadsheets\/([^/]+)\/values:batchUpdate$/);
      if (m) {
        const tabs = sheets.get(m[1]);
        body.data.forEach(d => { const r = parseRange(d.range); d.values.forEach((row, i) => { tabs[r.sheet][r.row + i] = row.slice(); }); });
        return {};
      }
      m = u.pathname.match(/^\/v4\/spreadsheets\/([^/]+)\/values\/([^:]+):append$/);
      if (m) { const tabs = sheets.get(m[1]); const r = parseRange(m[2]); body.values.forEach(row => tabs[r.sheet].push(row.slice())); return {}; }
      m = u.pathname.match(/^\/v4\/spreadsheets\/([^/]+)\/values\/(.+)$/);
      if (m && method === 'GET') { const tabs = sheets.get(m[1]); const r = parseRange(m[2]); return { values: tabs[r.sheet].map(row => row.slice()) }; }
    }
    throw new Error(`FakeGoogle: endpoint no simulado ${method} ${url}`);
  }

  // Ruta legible de un archivo (para verificar la estructura de carpetas)
  function pathOf(fid) {
    const parts = []; let f = files.get(fid);
    while (f && f.id !== 'root') { parts.unshift(f.name); f = files.get(f.parents[0]); }
    return parts.join('/');
  }

  return { http, files, sheets, log, pathOf };
}
if (typeof module !== 'undefined') module.exports = { createFakeGoogle };
