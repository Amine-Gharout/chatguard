"use strict";

/**
 * Generates the extension icons (a pink→violet heart) with zero dependencies:
 * pixels are rasterised directly and PNG-encoded with node:zlib.
 *
 * Usage: node scripts/generate-icons.js
 */

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const OUT_DIR = path.join(__dirname, "..", "icons");

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }

  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

/** Fraction of the pixel covered by the heart (4x supersampled). */
function heartCoverage(px, py, size) {
  const scale = size / 2.6;
  let inside = 0;
  for (let sy = 0; sy < 2; sy++) {
    for (let sx = 0; sx < 2; sx++) {
      const x = (px + (sx + 0.5) / 2 - size / 2) / scale;
      const y = (size / 2 - (py + (sy + 0.5) / 2)) / scale;
      const f = Math.pow(x * x + y * y - 1, 3) - x * x * Math.pow(y, 3);
      if (f <= 0) inside += 1;
    }
  }
  return inside / 4;
}

function makeIcon(size) {
  const top = [236, 72, 153]; // pink #EC4899
  const bottom = [139, 92, 246]; // violet #8B5CF6
  const rgba = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    const t = y / (size - 1 || 1);
    const r = Math.round(top[0] + (bottom[0] - top[0]) * t);
    const g = Math.round(top[1] + (bottom[1] - top[1]) * t);
    const b = Math.round(top[2] + (bottom[2] - top[2]) * t);
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = Math.round(heartCoverage(x, y, size) * 255);
    }
  }

  return encodePNG(size, rgba);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const size of [16, 48, 128]) {
  const file = path.join(OUT_DIR, `icon${size}.png`);
  fs.writeFileSync(file, makeIcon(size));
  console.log("wrote " + file);
}
