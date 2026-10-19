/**
 * Bakes the churam heightmap from Copernicus GLO-30 (30 m DSM, public on AWS Open Data).
 *
 *   npm run bake:terrain
 *
 * Reads only the internal COG tiles covering BOUNDS (HTTP Range requests, cached in scripts/.cache),
 * mosaics across the 1° file seam at 76° E, resamples bilinearly to SIZE², and writes:
 *   public/terrain/churam.png   16-bit greyscale, row 0 = north, 0..65535 → elevation.min..max
 *   public/terrain/churam.json  bounds, elevation range, metre extents, attribution
 * No dependencies: TIFF reading (DEFLATE + floating-point predictor) and PNG writing are inline.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";
import path from "node:path";

const BOUNDS = { south: 11.45, north: 11.55, west: 75.95, east: 76.05 };
const SIZE = 512;
const OUT = path.resolve(import.meta.dirname, "../public/terrain/churam");
const CACHE = path.resolve(import.meta.dirname, ".cache");
const PX = 3600; // GLO-30 tiles are 1° × 1°, 3600 × 3600 at 1 arc-second below 50° latitude

const tileUrl = (lat: number, lon: number) => {
  const name = `Copernicus_DSM_COG_10_N${String(lat).padStart(2, "0")}_00_E${String(lon).padStart(3, "0")}_00_DEM`;
  return `https://copernicus-dem-30m.s3.amazonaws.com/${name}/${name}.tif`;
};

async function range(url: string, start: number, length: number) {
  const key = path.join(CACHE, `${path.basename(url, ".tif")}_${start}_${length}.bin`);
  if (existsSync(key)) return readFile(key);
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${start + length - 1}` } });
  if (res.status !== 206) throw new Error(`${url}: expected 206, got ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(CACHE, { recursive: true });
  await writeFile(key, buf);
  return buf;
}

/* ---- minimal GeoTIFF: first IFD only, tiled, float32, DEFLATE, predictor 1 or 3 ---- */

type Cog = {
  url: string; width: number; height: number; tileW: number; tileH: number;
  offsets: number[]; counts: number[]; predictor: number;
  originLon: number; originLat: number; pixelIsPoint: boolean;
};

async function openCog(url: string): Promise<Cog> {
  const head = await range(url, 0, 65536);
  if (head.toString("latin1", 0, 4) !== "II*\0") throw new Error(`${url}: not a little-endian classic TIFF`);
  const ifd = head.readUInt32LE(4);
  const tags = new Map<number, number[]>();
  for (let i = 0, n = head.readUInt16LE(ifd); i < n; i++) {
    const e = ifd + 2 + i * 12, tag = head.readUInt16LE(e), type = head.readUInt16LE(e + 2), count = head.readUInt32LE(e + 4);
    const size = { 3: 2, 4: 4, 12: 8 }[type as 3 | 4 | 12];
    if (!size) continue;
    const at = count * size <= 4 ? e + 8 : head.readUInt32LE(e + 8);
    if (at + count * size > head.length) throw new Error(`${url}: tag ${tag} lies past the header read`);
    const read = (k: number) => (type === 3 ? head.readUInt16LE(at + k * 2) : type === 4 ? head.readUInt32LE(at + k * 4) : head.readDoubleLE(at + k * 8));
    tags.set(tag, Array.from({ length: count }, (_, k) => read(k)));
  }
  const one = (t: number) => tags.get(t)![0];
  if (one(258) !== 32 || one(339) !== 3) throw new Error(`${url}: expected float32 samples`);
  if (one(259) !== 8) throw new Error(`${url}: expected DEFLATE compression`);
  const tie = tags.get(33922)!, geo = tags.get(34735) ?? [];
  let rasterType = 1; // GTRasterTypeGeoKey (1025): 1 = PixelIsArea, 2 = PixelIsPoint
  for (let k = 4; k < geo.length; k += 4) if (geo[k] === 1025) rasterType = geo[k + 3];
  return {
    url, width: one(256), height: one(257), tileW: one(322), tileH: one(323),
    offsets: tags.get(324)!, counts: tags.get(325)!, predictor: tags.get(317)?.[0] ?? 1,
    originLon: tie[3], originLat: tie[4], pixelIsPoint: rasterType === 2,
  };
}

async function readTile(cog: Cog, index: number) {
  const raw = inflateSync(await range(cog.url, cog.offsets[index], cog.counts[index]));
  const w = cog.tileW, rowBytes = w * 4, out = new Float32Array(w * cog.tileH);
  const view = new DataView(out.buffer), tmp = new Uint8Array(rowBytes);
  for (let r = 0; r < cog.tileH; r++) {
    const row = raw.subarray(r * rowBytes, (r + 1) * rowBytes);
    if (cog.predictor === 3) {
      // TIFF floating-point predictor: undo byte-wise differencing, then un-shuffle the byte planes (MSB plane first)
      for (let i = 1; i < rowBytes; i++) row[i] = (row[i] + row[i - 1]) & 0xff;
      tmp.set(row);
      for (let i = 0; i < w; i++)
        for (let b = 0; b < 4; b++) view.setUint8((r * w + i) * 4 + b, tmp[(3 - b) * w + i]);
    } else {
      for (let i = 0; i < w; i++) out[r * w + i] = row.readFloatLE(i * 4);
    }
  }
  return out;
}

/* ---- mosaic: one virtual grid across the 1° files, loaded tile by tile on demand ---- */

async function buildSampler() {
  const lats = [Math.floor(BOUNDS.south), Math.floor(BOUNDS.north)].filter((v, i, a) => a.indexOf(v) === i);
  const lons = [Math.floor(BOUNDS.west), Math.floor(BOUNDS.east)].filter((v, i, a) => a.indexOf(v) === i);
  const cogs = new Map<string, Cog>();
  const tiles = new Map<string, Float32Array>();
  for (const lat of lats) for (const lon of lons) cogs.set(`${lat},${lon}`, await openCog(tileUrl(lat, lon)));
  const anyCog = cogs.values().next().value!;
  if (anyCog.width !== PX || anyCog.height !== PX) throw new Error(`unexpected tile size ${anyCog.width}×${anyCog.height}`);
  const half = anyCog.pixelIsPoint ? 0 : 0.5; // pixel centres sit half a pixel in from the corner tie point

  // global pixel coordinates: gx grows east from the west-most file, gy grows south from the north-most file
  const lon0 = Math.min(...lons), lat0 = Math.max(...lats) + 1;
  const toGx = (lon: number) => (lon - lon0) * PX - half;
  const toGy = (lat: number) => (lat0 - lat) * PX - half;

  // preload every internal tile the bounds touch (plus one pixel of margin for bilinear)
  const gx0 = Math.floor(toGx(BOUNDS.west)) - 1, gx1 = Math.ceil(toGx(BOUNDS.east)) + 1;
  const gy0 = Math.floor(toGy(BOUNDS.north)) - 1, gy1 = Math.ceil(toGy(BOUNDS.south)) + 1;
  const locate = (gx: number, gy: number) => {
    const fx = Math.floor(gx / PX), fy = Math.floor(gy / PX);
    const cog = cogs.get(`${lat0 - 1 - fy},${lon0 + fx}`)!;
    const px = gx - fx * PX, py = gy - fy * PX;
    const tx = Math.floor(px / cog.tileW), ty = Math.floor(py / cog.tileH);
    return { cog, index: ty * Math.ceil(PX / cog.tileW) + tx, key: `${cog.url}#${ty * Math.ceil(PX / cog.tileW) + tx}`, ix: px - tx * cog.tileW, iy: py - ty * cog.tileH };
  };
  for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
    const t = locate(gx, gy);
    if (!tiles.has(t.key)) {
      console.log(`  tile ${path.basename(t.cog.url)} #${t.index} (${(t.cog.counts[t.index] / 1e6).toFixed(1)} MB)`);
      tiles.set(t.key, await readTile(t.cog, t.index));
    }
  }
  const pixel = (gx: number, gy: number) => {
    const t = locate(gx, gy);
    return tiles.get(t.key)![t.iy * t.cog.tileW + t.ix];
  };
  return (lat: number, lon: number) => {
    const x = toGx(lon), y = toGy(lat), ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const top = pixel(ix, iy) * (1 - fx) + pixel(ix + 1, iy) * fx;
    const bottom = pixel(ix, iy + 1) * (1 - fx) + pixel(ix + 1, iy + 1) * fx;
    return top * (1 - fy) + bottom * fy;
  };
}

/* ---- 16-bit greyscale PNG writer ---- */

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf: Buffer) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const len = Buffer.alloc(4), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function png16(width: number, height: number, values: Uint16Array) {
  const bpp = 2, stride = width * bpp;
  const rows: Buffer[] = [];
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < width; x++) cur.writeUInt16BE(values[y * width + x], x * bpp);
    // pick the filter with the smallest sum of absolute residuals (the usual libpng heuristic)
    let best: Buffer | null = null, bestScore = Infinity;
    for (let f = 0; f <= 4; f++) {
      const out = Buffer.alloc(stride + 1);
      out[0] = f;
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
        const v = (cur[i] - pred) & 0xff;
        out[i + 1] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) { bestScore = score; best = out; }
    }
    rows.push(best!);
    prev = cur;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 16; // bit depth
  ihdr[9] = 0; // greyscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---- bake ---- */

console.log(`Copernicus GLO-30 → ${SIZE}² for ${BOUNDS.south}–${BOUNDS.north} N, ${BOUNDS.west}–${BOUNDS.east} E`);
const sample = await buildSampler();
const metres = new Float32Array(SIZE * SIZE);
let min = Infinity, max = -Infinity;
for (let row = 0; row < SIZE; row++) {
  const lat = BOUNDS.north - (row / (SIZE - 1)) * (BOUNDS.north - BOUNDS.south);
  for (let col = 0; col < SIZE; col++) {
    const lon = BOUNDS.west + (col / (SIZE - 1)) * (BOUNDS.east - BOUNDS.west);
    const h = sample(lat, lon);
    metres[row * SIZE + col] = h;
    if (h < min) min = h;
    if (h > max) max = h;
  }
}
min = Math.floor(min);
max = Math.ceil(max);
const values = new Uint16Array(SIZE * SIZE);
for (let i = 0; i < values.length; i++) values[i] = Math.round(((metres[i] - min) / (max - min)) * 65535);

// metres per degree on the WGS84 ellipsoid at the centre latitude
const phi = (((BOUNDS.south + BOUNDS.north) / 2) * Math.PI) / 180;
const perLat = 111132.954 - 559.822 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi);
const perLon = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi);

const meta = {
  size: SIZE,
  bounds: BOUNDS,
  elevation: { min, max, unit: "m", datum: "EGM2008" },
  metres: { width: Math.round((BOUNDS.east - BOUNDS.west) * perLon), height: Math.round((BOUNDS.north - BOUNDS.south) * perLat) },
  encoding: "16-bit greyscale PNG, row 0 = north, column 0 = west; value / 65535 maps linearly to elevation.min..max; samples sit on the bounds edges (grid-registered)",
  source: "Copernicus DEM GLO-30 (DSM, includes canopy)",
  attribution: "© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved",
  baked: new Date().toISOString().slice(0, 10),
};

await mkdir(path.dirname(OUT), { recursive: true });
const png = png16(SIZE, SIZE, values);
await writeFile(`${OUT}.png`, png);
await writeFile(`${OUT}.json`, JSON.stringify(meta, null, 2) + "\n");
console.log(`elevation ${min}–${max} m · ${meta.metres.width} × ${meta.metres.height} m · png ${(png.length / 1024).toFixed(0)} KB`);
