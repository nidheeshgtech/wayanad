/**
 * Loads the baked terrain data: heightmap (scripts/bake-terrain.ts) and road (scripts/bake-road.ts), from public/terrain/.
 * Decodes the 16-bit PNG by hand: <img>/canvas would quantise it to 8 bits (~6 m steps over the churam's range).
 */

export type HeightmapMeta = {
  size: number;
  bounds: { south: number; north: number; west: number; east: number };
  elevation: { min: number; max: number };
  metres: { width: number; height: number };
  attribution: string;
};

/** `data` is elevation in metres, row-major, row 0 = north, column 0 = west. */
export type Heightmap = HeightmapMeta & { data: Float32Array };

/** scripts/bake-road.ts output: NH766 from Adivaram, `step` metres between points; `along` = metres from Adivaram. */
export type RoadData = {
  step: number;
  length: number;
  points: [number, number][];
  bends: { n: number; lat: number; lon: number; along: number }[];
  arch: { lat: number; lon: number; along: number };
  attribution: string;
};

export async function loadRoad(url = "/terrain/churam-road.json"): Promise<RoadData> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}

async function inflate(bytes: Uint8Array<ArrayBuffer>) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Greyscale, 16-bit, non-interlaced PNG → samples. Anything else is rejected rather than misread. */
export async function decodePng16(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  if (view.getUint32(0) !== 0x89504e47) throw new Error("not a PNG");
  let width = 0, height = 0, offset = 8;
  const idat: Uint8Array[] = [];
  while (offset < buffer.byteLength) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...new Uint8Array(buffer, offset + 4, 4));
    const body = new Uint8Array(buffer, offset + 8, length);
    if (type === "IHDR") {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      const [depth, colour, , , interlace] = new Uint8Array(buffer, offset + 16, 5);
      if (depth !== 16 || colour !== 0 || interlace !== 0) throw new Error("expected 16-bit greyscale, non-interlaced");
    } else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    offset += length + 12;
  }
  const joined = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
  idat.reduce((at, c) => (joined.set(c, at), at + c.length), 0);
  const raw = await inflate(joined);

  const bpp = 2, stride = width * bpp, out = new Uint16Array(width * height);
  let prev = new Uint8Array(stride), cur = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let pred = 0;
      if (filter === 1) pred = a;
      else if (filter === 2) pred = b;
      else if (filter === 3) pred = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = (src[i] + pred) & 0xff;
    }
    for (let x = 0; x < width; x++) out[y * width + x] = (cur[x * 2] << 8) | cur[x * 2 + 1];
    [prev, cur] = [cur, prev];
  }
  return { width, height, data: out };
}

export async function loadHeightmap(base = "/terrain/churam"): Promise<Heightmap> {
  const [meta, png] = await Promise.all([
    fetch(`${base}.json`).then((r) => (r.ok ? (r.json() as Promise<HeightmapMeta>) : Promise.reject(new Error(`${base}.json ${r.status}`)))),
    fetch(`${base}.png`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${base}.png ${r.status}`)))),
  ]);
  const img = await decodePng16(png);
  if (img.width !== meta.size || img.height !== meta.size) throw new Error(`${base}.png is ${img.width}×${img.height}, json says ${meta.size}`);
  const { min, max } = meta.elevation, data = new Float32Array(img.data.length);
  for (let i = 0; i < data.length; i++) data[i] = min + (img.data[i] / 65535) * (max - min);
  return { ...meta, data };
}
