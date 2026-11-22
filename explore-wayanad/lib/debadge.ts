import { BufferAttribute, BufferGeometry, CanvasTexture, Matrix4, Vector3, type Mesh, type MeshStandardMaterial, type Object3D, type Texture } from "three";
import { split } from "@/lib/autoWheels";
import { plainGeometry } from "@/lib/vehicleAssets";

/**
 * Maker badges, names and plates off a model (no brand anywhere in the game: data/newGarage `clean`).
 *   hide   parts whose material or name matches: badges and decals that are parts of their own
 *   cut    pieces wholly within a sphere (centre and radius in the model's frame, metres), of the parts whose material
 *          or name is `mat` (any if none): a badge modelled into a bigger part; `tri`: every triangle inside, for one
 *          joined to what it sits on (a star in a grille)
 *   paint  a patch of a texture painted over in the colour round it: a badge or a name printed in the paint
 *   blank  plates: the whole texture of these materials painted its own background colour (their numbers gone)
 * The model must already be placed (the frame `cut` is in). Textures are copied, not changed in place.
 */
export type Clean = {
  hide?: string[];
  cut?: { at: [number, number, number]; r: number; mat?: string; tri?: boolean }[];
  paint?: { mat: string; uv: [number, number, number, number] }[];
  blank?: string[];
};

const match = (names: string[] | undefined, ...of: string[]) => !!names?.some((n) => of.some((o) => o === n || (n.startsWith("/") && new RegExp(n.slice(1, -1)).test(o))));

export function debadge(model: Object3D, c: Clean) {
  model.updateMatrixWorld(true);
  const toModel = new Matrix4().copy(model.matrixWorld).invert();
  const meshes: Mesh[] = [];
  model.traverse((o) => { const m = o as Mesh; if (m.isMesh) meshes.push(m); });
  for (const m of meshes) {
    const mat = m.material as MeshStandardMaterial;
    if (match(c.hide, m.name, mat.name)) { m.visible = false; continue; }
    const cuts = c.cut?.filter((k) => k.mat === undefined || k.mat === mat.name || k.mat === m.name);
    if (cuts?.length) cutOut(m, cuts, new Matrix4().multiplyMatrices(toModel, m.matrixWorld));
  }
  // textures: each painted once, shared by every material that used it — every map of the material (a badge pressed
  // into a normal map shows as a ghost otherwise)
  const done = new Map<Texture, Texture>(), slots = ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap"] as const;
  for (const m of meshes) {
    const mat = m.material as MeshStandardMaterial;
    const patches = c.paint?.filter((p) => p.mat === mat.name).map((p) => p.uv) ?? [];
    const blank = match(c.blank, mat.name, m.name);
    if (!patches.length && !blank) continue;
    const next = mat.clone();
    for (const k of slots) {
      const t = mat[k]; if (!t?.image) continue;
      if (!done.has(t)) done.set(t, repaint(t, blank ? [[0, 0, 1, 1]] : patches, blank));
      next[k] = done.get(t)!;
    }
    m.material = next;
  }
}

/** Drop the pieces (connected parts of the mesh) that lie wholly inside any of the spheres: a badge, its letters —
 * not the panel it sits on, which reaches further. */
function cutOut(m: Mesh, cuts: NonNullable<Clean["cut"]>, toModel: Matrix4) {
  const g = plainGeometry(m.geometry, toModel), centres = cuts.map((k) => new Vector3(...k.at)), c = new Vector3(), s = new Vector3();
  const drop = new Set<number>();
  for (const piece of split(g, 1e-4)) {
    piece.box.getCenter(c); piece.box.getSize(s);
    if (cuts.some((k, i) => !k.tri && c.distanceTo(centres[i]) + s.length() / 2 < k.r)) for (const t of piece.tris) drop.add(t);
  }
  // `tri`: every triangle whose middle is inside (a badge joined to what it sits on)
  if (cuts.some((k) => k.tri)) {
    const p = g.getAttribute("position"), ix = g.index, n = (ix ? ix.count : p.count) / 3, a = new Vector3();
    for (let t = 0; t < n; t++) {
      c.set(0, 0, 0); for (let k = 0; k < 3; k++) c.add(a.fromBufferAttribute(p, ix ? ix.getX(t * 3 + k) : t * 3 + k)); c.multiplyScalar(1 / 3);
      if (cuts.some((k, i) => k.tri && c.distanceTo(centres[i]) < k.r)) drop.add(t);
    }
  }
  if (!drop.size) return;
  const src = m.geometry, p = src.getAttribute("position"), ix = src.index, n = (ix ? ix.count : p.count) / 3;
  const keep: number[] = []; for (let t = 0; t < n; t++) if (!drop.has(t)) keep.push(t);
  const out = new BufferGeometry();
  for (const name of Object.keys(src.attributes)) {
    const at = src.getAttribute(name) as BufferAttribute, sz = at.itemSize, f = new Float32Array(keep.length * 3 * sz);
    keep.forEach((t, j) => { for (let k = 0; k < 3; k++) { const v = ix ? ix.getX(t * 3 + k) : t * 3 + k; for (let q = 0; q < sz; q++) f[(j * 3 + k) * sz + q] = at.getComponent(v, q); } });
    out.setAttribute(name, new BufferAttribute(f, sz));
  }
  m.geometry = out;
}

/** A copy of a texture with patches (u0, v0, u1, v1 as glTF reads them: v down from the top) filled with the colour
 * most common along their edges — the paint round a badge, the plate's own background. */
function repaint(src: Texture, patches: [number, number, number, number][], blank: boolean) {
  const img = src.image as CanvasImageSource & { width: number; height: number };
  const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
  const g = cv.getContext("2d", { willReadFrequently: true })!; g.drawImage(img, 0, 0);
  for (const [u0, v0, u1, v1] of patches) {
    const x0 = Math.floor(Math.min(u0, u1) * cv.width), x1 = Math.ceil(Math.max(u0, u1) * cv.width), y0 = Math.floor(Math.min(v0, v1) * cv.height), y1 = Math.ceil(Math.max(v0, v1) * cv.height);
    const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
    // the colour: the commonest (in coarse steps) of the pixels along the patch's edge, or over the whole for a blank
    const d = g.getImageData(Math.max(0, x0 - 2), Math.max(0, y0 - 2), Math.min(cv.width, w + 4), Math.min(cv.height, h + 4)).data, dw = Math.min(cv.width, w + 4), dh = Math.min(cv.height, h + 4);
    const count = new Map<number, [number, number, number, number]>();
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      if (!blank && !(x < 2 || y < 2 || x >= dw - 2 || y >= dh - 2)) continue;
      const i = (y * dw + x) * 4, key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4), e = count.get(key);
      if (e) { e[0]++; e[1] += d[i]; e[2] += d[i + 1]; e[3] += d[i + 2]; } else count.set(key, [1, d[i], d[i + 1], d[i + 2]]);
    }
    const [k, r, gg, b] = [...count.values()].sort((a, b) => b[0] - a[0])[0] ?? [1, 128, 128, 128];
    g.fillStyle = `rgb(${r / k | 0},${gg / k | 0},${b / k | 0})`; g.fillRect(x0, y0, w, h);
  }
  const t = new CanvasTexture(cv);
  t.flipY = src.flipY; t.colorSpace = src.colorSpace; t.wrapS = src.wrapS; t.wrapT = src.wrapT; t.anisotropy = src.anisotropy;
  t.repeat.copy(src.repeat); t.offset.copy(src.offset); t.channel = src.channel;
  return t;
}
