/**
 * Tiny dependency-free PNG toolkit: a solid-color helper plus a minimal
 * RGB canvas with filled-circle drawing, used to render the Apple Wallet
 * "strip" image as a real stamp card (filled vs. empty circles).
 */

import { deflateSync } from "node:zlib";

export type RGB = [number, number, number];
export type Canvas = { width: number; height: number; data: Uint8Array };

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

export function canvas(width: number, height: number, bg: RGB): Canvas {
  const data = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    data[i * 3] = bg[0];
    data[i * 3 + 1] = bg[1];
    data[i * 3 + 2] = bg[2];
  }
  return { width, height, data };
}

/** Filled circle with light edge anti-aliasing (2px feather). */
export function fillCircle(c: Canvas, cx: number, cy: number, radius: number, color: RGB): void {
  const x0 = Math.max(0, Math.floor(cx - radius - 1));
  const x1 = Math.min(c.width - 1, Math.ceil(cx + radius + 1));
  const y0 = Math.max(0, Math.floor(cy - radius - 1));
  const y1 = Math.min(c.height - 1, Math.ceil(cy + radius + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const a = Math.max(0, Math.min(1, radius - d + 0.5)); // 0..1 coverage
      if (a <= 0) continue;
      const i = (y * c.width + x) * 3;
      c.data[i] = Math.round(c.data[i] * (1 - a) + color[0] * a);
      c.data[i + 1] = Math.round(c.data[i + 1] * (1 - a) + color[1] * a);
      c.data[i + 2] = Math.round(c.data[i + 2] * (1 - a) + color[2] * a);
    }
  }
}

export function encodePng(c: Canvas): Buffer {
  const rowLen = c.width * 3;
  const raw = Buffer.alloc((rowLen + 1) * c.height);
  for (let y = 0; y < c.height; y++) {
    const off = y * (rowLen + 1);
    raw[off] = 0; // filter: none
    raw.set(c.data.subarray(y * rowLen, (y + 1) * rowLen), off + 1);
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(c.width, 0);
  ihdr.writeUInt32BE(c.height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function solidPng(width: number, height: number, rgb: RGB): Buffer {
  return encodePng(canvas(width, height, rgb));
}
