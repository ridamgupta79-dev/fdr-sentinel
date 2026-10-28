// One-off asset generator — creates transparent, whitespace-trimmed variants of
// the original square logo WITHOUT modifying the original file.
//   reads : frontend/public/assets/fdr-sentinel-logo.png  (1254x1254 RGB)
//   writes: frontend/public/assets/logo-mark.png    (shield mark only, transparent)
//           frontend/public/assets/logo-lockup.png  (mark + wordmark, transparent)
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "frontend/public/assets/fdr-sentinel-logo.png");

// ---------- PNG decode ----------
const buf = fs.readFileSync(SRC);
if (buf.readUInt32BE(16) !== 1254 || buf.readUInt32BE(20) !== 1254) throw new Error("unexpected source size");
const W = 1254, H = 1254, BPP = 3;

let idat = [];
let off = 8;
while (off < buf.length) {
  const len = buf.readUInt32BE(off);
  const type = buf.toString("ascii", off + 4, off + 8);
  if (type === "IDAT") idat.push(buf.subarray(off + 8, off + 8 + len));
  off += 12 + len;
}
const raw = zlib.inflateSync(Buffer.concat(idat));

const stride = W * BPP;
const pixels = Buffer.alloc(W * H * 3);
const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};
for (let y = 0; y < H; y++) {
  const filter = raw[y * (stride + 1)];
  const rowIn = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
  const rowOut = y * stride;
  for (let x = 0; x < stride; x++) {
    const a = x >= BPP ? pixels[rowOut + x - BPP] : 0;
    const b = y > 0 ? pixels[rowOut - stride + x] : 0;
    const c = x >= BPP && y > 0 ? pixels[rowOut - stride + x - BPP] : 0;
    let v = rowIn[x];
    if (filter === 1) v = (v + a) & 255;
    else if (filter === 2) v = (v + b) & 255;
    else if (filter === 3) v = (v + ((a + b) >> 1)) & 255;
    else if (filter === 4) v = (v + paeth(a, b, c)) & 255;
    pixels[rowOut + x] = v;
  }
}

// ---------- white background -> transparent (border flood fill) ----------
const alpha = new Uint8Array(W * H).fill(255);
const isBackground = (i) => {
  const p = i * 3;
  return pixels[p] >= 238 && pixels[p + 1] >= 238 && pixels[p + 2] >= 238;
};
const stack = [];
for (let x = 0; x < W; x++) { stack.push(x, (H - 1) * W + x); }
for (let y = 0; y < H; y++) { stack.push(y * W, y * W + W - 1); }
while (stack.length) {
  const i = stack.pop();
  if (alpha[i] === 0 || !isBackground(i)) continue;
  alpha[i] = 0;
  const x = i % W, y = (i / W) | 0;
  if (x > 0) stack.push(i - 1);
  if (x < W - 1) stack.push(i + 1);
  if (y > 0) stack.push(i - W);
  if (y < H - 1) stack.push(i + W);
}

// soften 1px halo: near-white pixels touching transparency become partially transparent
const halo = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x;
  if (alpha[i] === 0) continue;
  const touches = (x > 0 && alpha[i - 1] === 0) || (x < W - 1 && alpha[i + 1] === 0)
    || (y > 0 && alpha[i - W] === 0) || (y < H - 1 && alpha[i + W] === 0);
  if (!touches) continue;
  const p = i * 3, min = Math.min(pixels[p], pixels[p + 1], pixels[p + 2]);
  if (min >= 205 && (Math.max(pixels[p], pixels[p + 1], pixels[p + 2]) - min) <= 14) halo.push(i);
}
for (const i of halo) alpha[i] = 120;

// ---------- trim to alpha bounding box ----------
let minX = W, minY = H, maxX = 0, maxY = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (alpha[y * W + x] > 8) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
}
const pad = 6;
minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
maxX = Math.min(W - 1, maxX + pad); maxY = Math.min(H - 1, maxY + pad);
const fullW = maxX - minX + 1, fullH = maxY - minY + 1;
console.log("trimmed lockup:", fullW, "x", fullH);

// ---------- find gap between mark and wordmark, below 45% height ----------
const rowInk = new Array(fullH).fill(0);
for (let y = 0; y < fullH; y++) for (let x = 0; x < fullW; x++) {
  if (alpha[(y + minY) * W + x + minX] > 40) rowInk[y]++;
}
let splitY = -1;
const searchFrom = Math.floor(fullH * 0.45);
for (let y = searchFrom; y < fullH - 40; y++) {
  let gap = 0;
  while (y + gap < fullH && rowInk[y + gap] < 3) gap++;
  if (gap >= 8) { splitY = y + Math.floor(gap / 2); break; }
  y += gap;
}
if (splitY < 0) throw new Error("could not locate mark/wordmark gap");
const markH = splitY - 1;
console.log("mark region height:", markH, "of", fullH);

// ---------- encode ----------
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const strideR = width * 4;
  const rawRgba = Buffer.alloc((strideR + 1) * height);
  for (let y = 0; y < height; y++) {
    rawRgba[y * (strideR + 1)] = 0;
    rgba.copy(rawRgba, y * (strideR + 1) + 1, y * strideR, (y + 1) * strideR);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(rawRgba, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
function cropRegion(cropW, cropH, offsetY) {
  const rgba = Buffer.alloc(cropW * cropH * 4);
  for (let y = 0; y < cropH; y++) for (let x = 0; x < cropW; x++) {
    const sx = x + minX, sy = y + minY + offsetY;
    const si = sy * W + sx, di = (y * cropW + x) * 4;
    rgba[di] = pixels[si * 3]; rgba[di + 1] = pixels[si * 3 + 1]; rgba[di + 2] = pixels[si * 3 + 2];
    rgba[di + 3] = alpha[si];
  }
  return rgba;
}

fs.writeFileSync(path.join(ROOT, "frontend/public/assets/logo-mark.png"),
  encodePng(fullW, markH, cropRegion(fullW, markH, 0)));
fs.writeFileSync(path.join(ROOT, "frontend/public/assets/logo-lockup.png"),
  encodePng(fullW, fullH, cropRegion(fullW, fullH, 0)));
console.log("wrote logo-mark.png and logo-lockup.png");
