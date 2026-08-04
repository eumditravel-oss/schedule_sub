// scripts/build-pure-assets.cjs
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const publicDir = path.join(__dirname, '..', 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. Generate SVG
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF" />
      <stop offset="100%" stop-color="#F8FAFC" />
    </linearGradient>
    <linearGradient id="orangeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF6B00" />
      <stop offset="100%" stop-color="#E55A00" />
    </linearGradient>
    <linearGradient id="blueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563EB" />
      <stop offset="100%" stop-color="#0284C7" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)" stroke="#CBD5E1" stroke-width="8"/>
  <path d="M 256,96 L 384,224 L 256,352 L 128,224 Z" fill="url(#orangeGrad)" />
  <rect x="144" y="384" width="224" height="24" rx="12" fill="url(#blueGrad)"/>
  <rect x="176" y="424" width="160" height="20" rx="10" fill="#10B981"/>
  <circle cx="256" cy="224" r="48" fill="#FFFFFF" />
  <path d="M 240,224 L 252,236 L 276,212" stroke="#FF6B00" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;

fs.writeFileSync(path.join(publicDir, 'favicon.svg'), faviconSvg, 'utf-8');
console.log('Created public/favicon.svg');

// CRC32 calculation helper
function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
}
const crcTable = makeCrcTable();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcBuf = Buffer.alloc(4);
  const toCrc = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(toCrc), 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function createPngBuffer(width, height, pixelFn) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth 8
  ihdrData.writeUInt8(6, 9); // color type 6 (RGBA)
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // IDAT chunk
  const rawScanlines = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;

  for (let y = 0; y < height; y++) {
    rawScanlines[offset++] = 0; // Filter byte 0
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y, width, height);
      rawScanlines[offset++] = r;
      rawScanlines[offset++] = g;
      rawScanlines[offset++] = b;
      rawScanlines[offset++] = a;
    }
  }

  const idatChunk = makeChunk('IDAT', zlib.deflateSync(rawScanlines));
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Brand Icon Pixel Function
function getBrandPixel(x, y, w, h, isMaskable = false) {
  const margin = isMaskable ? w * 0.15 : 0;
  const cx = w / 2;
  const cy = h * 0.44;
  const dX = x - cx;
  const dY = y - cy;

  // Outer Margin check for rounded corners / maskable
  if (!isMaskable) {
    const rx = w * 0.22;
    if (
      (x < rx && y < rx && Math.hypot(x - rx, y - rx) > rx) ||
      (x > w - rx && y < rx && Math.hypot(x - (w - rx), y - rx) > rx) ||
      (x < rx && y > h - rx && Math.hypot(x - rx, y - (h - rx)) > rx) ||
      (x > w - rx && y > h - rx && Math.hypot(x - (w - rx), y - (h - rx)) > rx)
    ) {
      return [0, 0, 0, 0]; // Transparent
    }
  }

  // Diamond Symbol: |dX| + |dY| <= size
  const diamondSize = (w - margin * 2) * 0.26;
  if (Math.abs(dX) + Math.abs(dY) <= diamondSize) {
    // Inner Circle / Check
    if (Math.hypot(dX, dY) <= diamondSize * 0.38) {
      return [255, 255, 255, 255]; // White inner
    }
    return [255, 107, 0, 255]; // CON-COST Orange
  }

  // Gantt Bars
  const barY1 = (h - margin * 2) * 0.74 + margin;
  const barY2 = (h - margin * 2) * 0.83 + margin;
  const barH = (h - margin * 2) * 0.05;

  if (y >= barY1 && y <= barY1 + barH && x >= w * 0.2 && x <= w * 0.8) {
    return [37, 99, 235, 255]; // Blue 600
  }
  if (y >= barY2 && y <= barY2 + barH && x >= w * 0.28 && x <= w * 0.72) {
    return [16, 185, 129, 255]; // Emerald 500
  }

  // Card Background White / Slate-50
  return [255, 255, 255, 255];
}

// Generate PNG Icon Files
const iconFiles = [
  { name: 'favicon-16x16.png', width: 16, height: 16 },
  { name: 'favicon-32x32.png', width: 32, height: 32 },
  { name: 'apple-touch-icon.png', width: 180, height: 180 },
  { name: 'icon-192x192.png', width: 192, height: 192 },
  { name: 'icon-512x512.png', width: 512, height: 512 },
  { name: 'maskable-icon-512x512.png', width: 512, height: 512, maskable: true },
];

for (const f of iconFiles) {
  const buf = createPngBuffer(f.width, f.height, (x, y, w, h) => getBrandPixel(x, y, w, h, f.maskable));
  fs.writeFileSync(path.join(publicDir, f.name), buf);
  console.log(`Created public/${f.name} (${buf.length} bytes)`);
}

// Copy favicon-32x32.png to favicon.ico
fs.copyFileSync(path.join(publicDir, 'favicon-32x32.png'), path.join(publicDir, 'favicon.ico'));
console.log('Created public/favicon.ico');

// Generate Open Graph Preview Image (1200 x 630 px)
function getOgPixel(x, y, w, h) {
  // Border card 40px margin
  if (x < 40 || x > w - 40 || y < 40 || y > h - 40) {
    return [248, 250, 252, 255]; // Slate 50 outer bg
  }

  // Top Accent Blue Bar (height 10px)
  if (y >= 40 && y <= 50) {
    return [37, 99, 235, 255]; // Blue 600
  }

  // Brand Logo Orange Circle at (95, 115) r=20
  if (Math.hypot(x - 95, y - 115) <= 20) {
    return [255, 107, 0, 255]; // Orange
  }

  // Gantt Chart Graphic Box at (95..1105, 350..550)
  if (x >= 95 && x <= 1105 && y >= 350 && y <= 550) {
    // Gantt Bar 1: Blue
    if (y >= 370 && y <= 405 && x >= 200 && x <= 750) {
      return [37, 99, 235, 255];
    }
    // Gantt Bar 2: Cyan
    if (y >= 425 && y <= 460 && x >= 350 && x <= 800) {
      return [2, 132, 199, 255];
    }
    // Gantt Bar 3: Emerald
    if (y >= 480 && y <= 515 && x >= 550 && x <= 950) {
      return [16, 185, 129, 255];
    }
    // Gantt Grid Vertical Lines
    if ((x - 95) % 110 < 2) {
      return [226, 232, 240, 255];
    }
    return [241, 245, 249, 255]; // Slate 100 inner box
  }

  // White Card Inner Body
  return [255, 255, 255, 255];
}

console.log('Generating og-preview-v1.png (1200x630)...');
const ogBuffer = createPngBuffer(1200, 630, getOgPixel);
fs.writeFileSync(path.join(publicDir, 'og-preview-v1.png'), ogBuffer);
console.log(`Created public/og-preview-v1.png (Size: ${(ogBuffer.length / 1024).toFixed(1)} KB)`);
