const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const iconsDir = path.join(__dirname, '..', 'app', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// 1. GENERAR SVG VECTORIAL
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="50%" stop-color="#020617" />
      <stop offset="100%" stop-color="#1e1b4b" />
    </linearGradient>
    <linearGradient id="blueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="50%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#4f46e5" />
    </linearGradient>
    <linearGradient id="emeraldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#34d399" />
      <stop offset="100%" stop-color="#059669" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Fondo con esquinas redondeadas -->
  <rect width="512" height="512" rx="108" fill="url(#bgGrad)" />
  <rect width="504" height="504" x="4" y="4" rx="104" fill="none" stroke="#3b82f6" stroke-width="3" stroke-opacity="0.3" />

  <!-- Retícula técnica sutil -->
  <circle cx="256" cy="256" r="210" fill="none" stroke="#1e293b" stroke-width="1.5" stroke-dasharray="6,6" />
  <circle cx="256" cy="256" r="170" fill="none" stroke="#1e293b" stroke-width="1" />

  <!-- Cuerpo de la cámara técnica -->
  <rect x="96" y="140" width="320" height="240" rx="40" fill="#1e293b" stroke="#334155" stroke-width="4" />
  <path d="M 180 140 L 206 100 L 306 100 L 332 140 Z" fill="#334155" />
  
  <!-- Flash / Visor de la cámara -->
  <circle cx="146" cy="184" r="14" fill="#f59e0b" opacity="0.9" />
  <rect x="330" y="174" width="46" height="20" rx="6" fill="#0f172a" stroke="#475569" stroke-width="2" />
  <circle cx="353" cy="184" r="5" fill="#38bdf8" />

  <!-- Anillo exterior del lente / apertura con gradiente y resplandor -->
  <circle cx="256" cy="266" r="88" fill="url(#blueGrad)" filter="url(#glow)" />
  <circle cx="256" cy="266" r="76" fill="#090d16" stroke="#60a5fa" stroke-width="3" />

  <!-- Aspas de apertura / diafragma -->
  <polygon points="256,212 284,242 270,250 242,220" fill="#1e293b" opacity="0.8" />
  <polygon points="310,266 280,294 272,280 302,252" fill="#1e293b" opacity="0.8" />
  <polygon points="256,320 228,290 242,282 270,312" fill="#1e293b" opacity="0.8" />
  <polygon points="202,266 232,238 240,252 210,280" fill="#1e293b" opacity="0.8" />

  <!-- Lente central -->
  <circle cx="256" cy="266" r="44" fill="#0f172a" stroke="#38bdf8" stroke-width="2" />
  <circle cx="256" cy="266" r="28" fill="url(#blueGrad)" opacity="0.8" />
  <circle cx="248" cy="258" r="8" fill="#ffffff" opacity="0.7" />

  <!-- Mira de Georreferenciación GPS (Crosshairs) -->
  <line x1="256" y1="154" x2="256" y2="190" stroke="#34d399" stroke-width="4" stroke-linecap="round" />
  <line x1="256" y1="342" x2="256" y2="378" stroke="#34d399" stroke-width="4" stroke-linecap="round" />
  <line x1="144" y1="266" x2="180" y2="266" stroke="#34d399" stroke-width="4" stroke-linecap="round" />
  <line x1="332" y1="266" x2="368" y2="266" stroke="#34d399" stroke-width="4" stroke-linecap="round" />

  <!-- Indicador satelital GPS en esquina -->
  <circle cx="256" cy="266" r="6" fill="#34d399" />
  <circle cx="256" cy="266" r="110" fill="none" stroke="#34d399" stroke-width="1.5" stroke-dasharray="8,8" opacity="0.6" />

  <!-- Badge 'AI' Tecnológico -->
  <g transform="translate(300, 310)">
    <rect width="64" height="28" rx="8" fill="#2563eb" />
    <text x="32" y="19" font-family="system-ui, sans-serif" font-size="14" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="1">AI</text>
  </g>
</svg>`;

fs.writeFileSync(path.join(iconsDir, 'icon.svg'), svgContent, 'utf8');
fs.writeFileSync(path.join(iconsDir, 'favicon.svg'), svgContent, 'utf8');
console.log('SVG icons generated successfully.');

// 2. GENERADOR DE PNG BITMAP PURO EN NODE (Sin dependencias externas)
function makeCrcTable() {
  let c;
  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
  }
  return crcTable;
}
const crcTable = makeCrcTable();

function crc32(buf) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

function makePngChunk(type, data) {
  const len = data.length;
  const buf = Buffer.alloc(len + 12);
  buf.writeUInt32BE(len, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  const crc = crc32(buf.slice(4, len + 8));
  buf.writeUInt32BE(crc >>> 0, len + 8);
  return buf;
}

function generateRasterPng(size, isMaskable = false) {
  const width = size;
  const height = size;
  const rowBytes = width * 4 + 1;
  const rawBuffer = Buffer.alloc(height * rowBytes);

  const cx = width / 2;
  const cy = height / 2;
  const radius = size * 0.45;
  const cornerRadius = size * (isMaskable ? 0 : 0.21);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowBytes;
    rawBuffer[rowOffset] = 0; // Filter None

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;

      // Coordenadas normalizadas [-1, 1]
      const nx = (x - cx) / (width / 2);
      const ny = (y - cy) / (height / 2);
      const distFromCenter = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));

      let r = 15, g = 23, b = 42, a = 255; // #0f172a de fondo

      // Degradado sutil de fondo
      const diag = (x + y) / (width + height);
      r = Math.round(15 + diag * 20);
      g = Math.round(23 + diag * 15);
      b = Math.round(42 + diag * 45);

      // Si no es maskable, recortar esquinas redondeadas
      if (!isMaskable) {
        const dx = Math.abs(x - cx) - (cx - cornerRadius);
        const dy = Math.abs(y - cy) - (cy - cornerRadius);
        if (dx > 0 && dy > 0) {
          const cornerDist = Math.sqrt(dx * dx + dy * dy);
          if (cornerDist > cornerRadius) {
            a = 0;
          }
        }
      }

      if (a > 0) {
        const cameraBoxW = size * (isMaskable ? 0.50 : 0.62);
        const cameraBoxH = size * (isMaskable ? 0.38 : 0.46);

        // Rectángulo de la cámara
        const inCamera = Math.abs(x - cx) < cameraBoxW / 2 && Math.abs(y - (cy + size * 0.04)) < cameraBoxH / 2;
        if (inCamera) {
          r = 30; g = 41; b = 59; // #1e293b
        }

        // Anillo de lente
        const lensRadius = size * (isMaskable ? 0.20 : 0.25);
        const lensInner = size * (isMaskable ? 0.14 : 0.18);
        const lensCore = size * (isMaskable ? 0.08 : 0.10);

        if (distFromCenter <= lensRadius && distFromCenter >= lensInner) {
          // Anillo azul
          r = 37; g = 99; b = 235; // #2563eb
          const ringAngle = Math.atan2(y - cy, x - cx);
          if (ringAngle > 0) {
            r = 56; g = 189; b = 248; // #38bdf8
          }
        } else if (distFromCenter < lensInner && distFromCenter >= lensCore) {
          // Fondo del lente
          r = 9; g = 13; b = 22;
        } else if (distFromCenter < lensCore) {
          // Pupila / centro azul con brillo
          r = 59; g = 130; b = 246;
          if (Math.abs(x - (cx - lensCore * 0.3)) < 4 && Math.abs(y - (cy - lensCore * 0.3)) < 4) {
            r = 255; g = 255; b = 255;
          }
        }

        // Mira GPS (Crosshair verde esmeralda)
        const crosshairArm = size * (isMaskable ? 0.28 : 0.34);
        const isCrosshairX = Math.abs(y - cy) <= (size > 100 ? 2 : 1) && Math.abs(x - cx) > lensRadius && Math.abs(x - cx) < crosshairArm;
        const isCrosshairY = Math.abs(x - cx) <= (size > 100 ? 2 : 1) && Math.abs(y - cy) > lensRadius && Math.abs(y - cy) < crosshairArm;
        if (isCrosshairX || isCrosshairY) {
          r = 52; g = 211; b = 153; // #34d399
        }
      }

      rawBuffer[pxOffset] = r;
      rawBuffer[pxOffset + 1] = g;
      rawBuffer[pxOffset + 2] = b;
      rawBuffer[pxOffset + 3] = a;
    }
  }

  // Comprimir IDAT
  const idat = zlib.deflateSync(rawBuffer);

  // Armar PNG
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // standard filter
  ihdr[12] = 0; // no interlace

  const chunks = [
    signature,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', idat),
    makePngChunk('IEND', Buffer.alloc(0))
  ];

  return Buffer.concat(chunks);
}

// Generar todos los tamaños
const filesToGenerate = [
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-maskable-192.png', size: 192, maskable: true },
  { name: 'icon-maskable-512.png', size: 512, maskable: true },
  { name: 'apple-touch-icon.png', size: 180, maskable: false },
  { name: 'favicon.png', size: 32, maskable: false }
];

filesToGenerate.forEach(item => {
  const pngBuf = generateRasterPng(item.size, item.maskable);
  fs.writeFileSync(path.join(iconsDir, item.name), pngBuf);
  console.log(`Generated ${item.name} (${item.size}x${item.size}, ${pngBuf.length} bytes)`);
});
