// Generates build/icon.icns (app icon) and assets/trayTemplate.png (menu bar icon).
// No dependencies: pixel data -> PNG via scripts/png.js, icns via macOS iconutil.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { encodePNG } = require('./png');
const S = require('../renderer/sprites');

const root = path.join(__dirname, '..');

function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

function makeCanvas(size) {
  return { size, data: Buffer.alloc(size * size * 4) };
}
function setPx(cv, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= cv.size || y >= cv.size) return;
  const i = (y * cv.size + x) * 4;
  cv.data[i] = r;
  cv.data[i + 1] = g;
  cv.data[i + 2] = b;
  cv.data[i + 3] = a;
}

// macOS-style rounded square background
function roundedRect(cv, x0, y0, w, h, radius, color) {
  const [r, g, b] = hex(color);
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      let inside = true;
      const corners = [
        [x0 + radius, y0 + radius],
        [x0 + w - radius - 1, y0 + radius],
        [x0 + radius, y0 + h - radius - 1],
        [x0 + w - radius - 1, y0 + h - radius - 1],
      ];
      if (
        (x < x0 + radius || x > x0 + w - radius - 1) &&
        (y < y0 + radius || y > y0 + h - radius - 1)
      ) {
        inside = corners.some(([cx, cy]) => (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius);
      }
      if (inside) setPx(cv, x, y, r, g, b);
    }
  }
}

function drawSprite(cv, map, ox, oy, scale, palette) {
  for (let j = 0; j < map.length; j++) {
    for (let i = 0; i < map[j].length; i++) {
      const ch = map[j][i];
      if (ch === '.') continue;
      const [r, g, b] = hex(palette ? palette[ch] || palette.default : S.PALETTE[ch]);
      for (let sy = 0; sy < scale; sy++)
        for (let sx = 0; sx < scale; sx++) setPx(cv, ox + i * scale + sx, oy + j * scale + sy, r, g, b);
    }
  }
}

// box-filter downscale (master is a multiple of every target size)
function downscale(cv, target) {
  const out = makeCanvas(target);
  const f = cv.size / target;
  for (let y = 0; y < target; y++) {
    for (let x = 0; x < target; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        n = 0;
      for (let sy = 0; sy < f; sy++) {
        for (let sx = 0; sx < f; sx++) {
          const i = ((y * f + sy) * cv.size + (x * f + sx)) * 4;
          r += cv.data[i];
          g += cv.data[i + 1];
          b += cv.data[i + 2];
          a += cv.data[i + 3];
          n++;
        }
      }
      const o = (y * target + x) * 4;
      out.data[o] = r / n;
      out.data[o + 1] = g / n;
      out.data[o + 2] = b / n;
      out.data[o + 3] = a / n;
    }
  }
  return out;
}

// ---- app icon ----
const master = makeCanvas(1024);
roundedRect(master, 100, 100, 824, 824, 185, '#F5EDE3');
// buddy centered: body + arms occupy x 0..37 of the 54-wide sprite, scale 18 => 684x360
const scale = 18;
const dw = 38 * scale;
const dh = S.H * scale;
drawSprite(master, S.FRAMES.stand, (1024 - dw) / 2, (1024 - dh) / 2 + 10, scale);

const iconset = path.join(root, 'build', 'icon.iconset');
fs.rmSync(iconset, { recursive: true, force: true });
fs.mkdirSync(iconset, { recursive: true });
const entries = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
];
for (const [name, size] of entries) {
  const cv = size === 1024 ? master : downscale(master, size);
  fs.writeFileSync(path.join(iconset, name), encodePNG(size, size, cv.data));
}
execSync(`iconutil -c icns "${iconset}" -o "${path.join(root, 'build', 'icon.icns')}"`);
fs.rmSync(iconset, { recursive: true, force: true });
console.log('wrote build/icon.icns');

// ---- tray icon (template: black + alpha) ----
const TRAY = [
  '................',
  '................',
  '................',
  '................',
  '....BBBBBBBB....',
  '....BBBBBBBB....',
  '....BEBBBBEB....',
  '..BBBBBBBBBBBB..',
  '..BBBBBBBBBBBB..',
  '....BBBBBBBB....',
  '....BBBBBBBB....',
  '....B.B..B.B....',
  '....B.B..B.B....',
  '................',
  '................',
  '................',
];
// template images: solid black, transparency defines the shape.
// The eye stays transparent so it reads as a face in the menu bar.
function trayCanvas(px) {
  const cv = makeCanvas(px);
  const sc = px / 16;
  for (let j = 0; j < TRAY.length; j++) {
    for (let i = 0; i < TRAY[j].length; i++) {
      const ch = TRAY[j][i];
      if (ch === '.' || ch === 'E') continue;
      for (let sy = 0; sy < sc; sy++)
        for (let sx = 0; sx < sc; sx++) setPx(cv, i * sc + sx, j * sc + sy, 0, 0, 0, 255);
    }
  }
  return cv;
}
fs.writeFileSync(path.join(root, 'assets', 'trayTemplate.png'), encodePNG(16, 16, trayCanvas(16).data));
fs.writeFileSync(
  path.join(root, 'assets', 'trayTemplate@2x.png'),
  encodePNG(32, 32, trayCanvas(32).data)
);
console.log('wrote assets/trayTemplate.png (+@2x)');
