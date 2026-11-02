// Dependency-free PNG icon generator (cute smiling clock).
// Run: npm run icons
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

function crc32(buf) {
  let c,
    crc = ~0;
  for (const b of buf) {
    c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

// Cute smiling alarm-clock face. Shapes are in 512-unit space, drawn with 3x3 supersampling.
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax,
    dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};
const disc = (cx, cy, r, color) => ({ color: hex(color), hit: (x, y) => Math.hypot(x - cx, y - cy) <= r });
const ring = (cx, cy, r, w, color) => ({
  color: hex(color),
  hit: (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - r) <= w / 2,
});
const stroke = (pts, w, color) => ({
  color: hex(color),
  hit: (x, y) => pts.some((p, i) => i && segDist(x, y, pts[i - 1][0], pts[i - 1][1], p[0], p[1]) <= w / 2),
});
const smile = Array.from({ length: 13 }, (_, i) => {
  const t = i / 12;
  return [(1 - t) ** 2 * 226 + 2 * t * (1 - t) * 256 + t * t * 286, (1 - t) ** 2 * 318 + 2 * t * (1 - t) * 356 + t * t * 318];
});
const layers = [
  { color: hex("#ffd9c9"), hit: () => true },
  disc(135, 125, 55, "#ff8fa3"),
  disc(377, 125, 55, "#ff8fa3"),
  disc(256, 278, 190, "#ffffff"),
  ring(256, 278, 181, 18, "#ff8fa3"),
  disc(200, 258, 16, "#5b3a3a"),
  disc(312, 258, 16, "#5b3a3a"),
  disc(160, 316, 26, "#ffb3c1"),
  disc(352, 316, 26, "#ffb3c1"),
  stroke(smile, 14, "#5b3a3a"),
  stroke([[256, 120], [256, 156]], 14, "#ff8fa3"),
];

function png(size) {
  const k = 512 / size;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < 3; sy++)
        for (let sx = 0; sx < 3; sx++) {
          const px = (x + (sx + 0.5) / 3) * k,
            py = (y + (sy + 0.5) / 3) * k;
          let col = layers[0].color;
          for (const l of layers) if (l.hit(px, py)) col = l.color;
          for (let i = 0; i < 3; i++) acc[i] += col[i] / 9;
        }
      raw.set([...acc.map(Math.round), 255], y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
for (const s of [192, 512]) writeFileSync(`public/icon-${s}.png`, png(s));
