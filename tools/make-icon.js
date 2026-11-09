// Genera build/icon.png (256 x 256) con el Clawd verde azulado en pixel art. Uso: node tools/make-icon.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const N = 32, S = 8;                       // rejilla de 32 x 32, cada píxel = 8 px
const C = { b: [63, 184, 168], s: [44, 143, 131], l: [134, 221, 209], d: [29, 94, 86], e: [31, 26, 23], w: [255, 255, 255], y: [242, 193, 78] };
const grid = Array.from({ length: N }, () => Array(N).fill(null));
const rect = (x, y, w, h, c) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < N && j < N) grid[j][i] = c; };

// antena
rect(15, 8, 2, 1, 'd'); rect(16, 6, 1, 2, 'd'); rect(15, 4, 3, 2, 'y'); rect(15, 4, 1, 1, 'w');
// patas
for (const x of [8, 12, 18, 22]) rect(x, 24, 2, 3, 's');
// cuerpo
rect(6, 10, 20, 14, 'b'); rect(7, 9, 18, 1, 'b'); rect(6, 22, 20, 2, 's');
rect(8, 11, 3, 1, 'l'); rect(7, 12, 1, 2, 'l');
// pinzas
rect(3, 15, 3, 4, 'b'); rect(2, 14, 2, 2, 'b'); rect(2, 19, 2, 1, 's');
rect(26, 15, 3, 4, 'b'); rect(28, 14, 2, 2, 'b'); rect(28, 19, 2, 1, 's');
// ojos y sonrisa
rect(10, 13, 2, 3, 'e'); rect(10, 13, 1, 1, 'w');
rect(20, 13, 2, 3, 'e'); rect(20, 13, 1, 1, 'w');
rect(14, 18, 1, 1, 'e'); rect(15, 19, 2, 1, 'e'); rect(17, 18, 1, 1, 'e');

// contorno oscuro alrededor de todo lo dibujado
const out = grid.map(r => r.slice());
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  if (grid[y][x]) continue;
  const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => grid[y + dy] && grid[y + dy][x + dx]);
  if (near) out[y][x] = 'o';
}

const W = N * S;
const raw = Buffer.alloc((W * 4 + 1) * W);
for (let y = 0; y < W; y++) {
  raw[y * (W * 4 + 1)] = 0;
  for (let x = 0; x < W; x++) {
    const c = out[Math.floor(y / S)][Math.floor(x / S)];
    const o = y * (W * 4 + 1) + 1 + x * 4;
    if (!c) continue;
    const rgb = c === 'o' ? [30, 20, 16] : C[c];
    raw[o] = rgb[0]; raw[o + 1] = rgb[1]; raw[o + 2] = rgb[2]; raw[o + 3] = c === 'o' ? 220 : 255;
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);

const dest = path.join(__dirname, '..', 'build', 'icon.png');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, png);
console.log('Icono creado:', dest);
