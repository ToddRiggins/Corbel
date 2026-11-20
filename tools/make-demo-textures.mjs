import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, pixel) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixel(x, y);
      const at = row + 1 + x * 4;
      raw[at] = r; raw[at + 1] = g; raw[at + 2] = b; raw[at + 3] = a;
    }
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// Brick: 64x64, two-tone bricks with light grout lines.
const out_brick = png(64, 64, (x, y) => {
  const row = Math.floor(y / 16);
  const offset = row % 2 === 0 ? 0 : 0x20;
  const grout = y % 16 === 0 || (x + offset) % 32 === 0;
  if (grout) return [0xd6, 0xd3, 0xd1, 255];
  const base = 0xb4 + ((x % 2) * 0x10) + ((row % 2) * 0x08);
  return [base + 0x30, 0x7a, 0x62 + ((x + y) % 0x18), 255];
});
writeFileSync("projects/demo/textures/brick.png", out_brick);

// Portal: 64x64 purple glow grid.
const out_portal = png(64, 64, (x, y) => {
  const cx = 32 - x, cy = 32 - y;
  const d = Math.sqrt(cx * cx + cy * cy);
  const ring = d % 8 < 2;
  const v = ring ? 0xc4 : 0x9c + (64 - d) % 0x20;
  return [0xa8, v, 0xf7 - ring * 0x20, 255];
});
writeFileSync("projects/demo/textures/portal.png", out_portal);
console.log("wrote brick.png and portal.png");
