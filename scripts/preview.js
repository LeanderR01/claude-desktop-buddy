// Render all sprite frames into one PNG for visual checking.
// Usage: node scripts/preview.js [out.png]
const fs = require('fs');
const { encodePNG } = require('./png');
const S = require('../renderer/sprites');

const SCALE = 6;
const PAD = 8;
const names = Object.keys(S.FRAMES);
const cols = 4;
const rows = Math.ceil(names.length / cols);

const cellW = S.W * SCALE + PAD;
const cellH = S.H * SCALE + PAD;
const width = cols * cellW + PAD;
const height = rows * cellH + PAD;

const img = Buffer.alloc(width * height * 4);
// dark background so coral pixels are visible
for (let i = 0; i < width * height; i++) {
  img[i * 4] = 30;
  img[i * 4 + 1] = 30;
  img[i * 4 + 2] = 30;
  img[i * 4 + 3] = 255;
}

function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

function drawFrame(frame, ox, oy) {
  for (let y = 0; y < frame.length; y++) {
    for (let x = 0; x < frame[y].length; x++) {
      const ch = frame[y][x];
      if (ch === '.') continue;
      const [r, g, b] = hex(S.PALETTE[ch] || '#FF00FF');
      for (let sy = 0; sy < SCALE; sy++) {
        for (let sx = 0; sx < SCALE; sx++) {
          const px = ox + x * SCALE + sx;
          const py = oy + y * SCALE + sy;
          if (px < 0 || px >= width || py < 0 || py >= height) continue;
          const idx = (py * width + px) * 4;
          img[idx] = r;
          img[idx + 1] = g;
          img[idx + 2] = b;
          img[idx + 3] = 255;
        }
      }
    }
  }
}

names.forEach((name, i) => {
  const cx = PAD + (i % cols) * cellW;
  const cy = PAD + Math.floor(i / cols) * cellH;
  drawFrame(S.FRAMES[name], cx, cy);
});

const out = process.argv[2] || 'preview.png';
fs.writeFileSync(out, encodePNG(width, height, img));
console.log('wrote', out, `${width}x${height}`, 'order:', names.join(', '));
