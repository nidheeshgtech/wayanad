import { BufferAttribute, BufferGeometry, Color, Group, Matrix4, Mesh, MeshStandardMaterial, Object3D, PlaneGeometry, Raycaster, SRGBColorSpace, TextureLoader, Vector3, type Material, type Texture } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

/** One loader for vehicle GLBs (traffic, the player's car and the /vehicles page): meshopt-compressed models decode, and
 * textures get anisotropic filtering, because roofs and bonnets are seen at a glancing angle and real models pack them
 * into thin texture strips that blur into their neighbours otherwise. Each file loads once; callers clone.
 * `merged`: the same model with its parts merged by material — one draw call per material instead of per part (the
 * lorry's 18 parts become 8 draws). Traffic and the gallery use it; the player's car keeps its parts (wheels turn). */
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<Group>>();

export function loadVehicle(url: string, { merged = false } = {}) {
  const key = merged ? `${url}#merged` : url;
  if (!cache.has(key)) cache.set(key, merged ? loadVehicle(url).then(mergeByMaterial) : loader.loadAsync(url).then(({ scene }) => {
    scene.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      for (const m of [o.material].flat() as MeshStandardMaterial[]) for (const t of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap]) if (t) t.anisotropy = 8;
    });
    return scene;
  }));
  return cache.get(key)!;
}

/** A copy of `g` with plain float position / normal / uv (the files' are quantized), moved by `m`. */
export function plainGeometry(g: BufferGeometry, m: Matrix4) {
  const out = new BufferGeometry();
  for (const name of ["position", "normal", "uv"]) {
    const a = g.getAttribute(name) as BufferAttribute | undefined;
    if (!a) continue;
    const f = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = a.getComponent(i, k);
    out.setAttribute(name, new BufferAttribute(f, a.itemSize));
  }
  if (g.index) out.setIndex(Array.from(g.index.array as ArrayLike<number>));
  out.applyMatrix4(m);
  if (m.determinant() < 0 && out.index) { const ix = out.index.array as number[] | Uint32Array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; } }
  return out;
}

/** Merge meshes into one mesh per material (and attribute set), in the frame of `into` (added to it). */
export function mergeInto(meshes: Mesh[], into: Object3D) {
  into.updateMatrixWorld(true);
  const inv = new Matrix4().copy(into.matrixWorld).invert(), groups = new Map<string, { material: Material; parts: BufferGeometry[] }>();
  for (const mesh of meshes) {
    const material = mesh.material as Material, g = plainGeometry(mesh.geometry, new Matrix4().multiplyMatrices(inv, mesh.matrixWorld));
    const key = `${material.uuid}|${Object.keys(g.attributes).sort().join(",")}|${g.index ? 1 : 0}`;
    (groups.get(key) ?? groups.set(key, { material, parts: [] }).get(key)!).parts.push(g);
  }
  const out: Mesh[] = [];
  for (const { material, parts } of groups.values()) {
    const geometry = parts.length > 1 ? mergeGeometries(parts, false) : parts[0];
    if (!geometry) continue;
    const mesh = new Mesh(geometry, material);
    mesh.castShadow = !(material as { transparent?: boolean }).transparent; mesh.receiveShadow = true; mesh.name = material.name;
    into.add(mesh); out.push(mesh);
  }
  return out;
}

/** The whole model with its parts merged by material. Glass you can see the people through: solid "glass" becomes
 * tinted see-through, and very dark tinted glass is lightened a little. */
export function mergeByMaterial(scene: Group) {
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const m = (o as Mesh).material as MeshStandardMaterial | undefined;
    if (!m || !(o as Mesh).isMesh) return;
    if (/glass/i.test(m.name) && !m.transparent) { m.transparent = true; m.opacity = 0.5; m.depthWrite = false; }
    else if (m.transparent && m.opacity > 0.5) m.opacity = 0.45;
  });
  const meshes: Mesh[] = []; scene.traverse((o) => { if ((o as Mesh).isMesh) meshes.push(o as Mesh); });
  const out = new Group(); out.name = scene.name;
  mergeInto(meshes, out);
  return out;
}

/* ---- destination boards (scripts/bake-boards.mjs) ---- */
export type BoardText = "ml" | "en" | "both";
/** Where each bus carries its front route board, as shares of its size (box: x ±width/2, y 0…height, front at +length/2),
 * and its style: state transport has an amber LED board, private buses a painted one. */
const BOARDS: Record<string, { style: "led" | "painted"; y: number; w: number; h: number }> = {
  "ksrtc-real": { style: "led", y: 0.86, w: 0.56, h: 0.085 },
  "privatebus-real": { style: "led", y: 0.86, w: 0.56, h: 0.085 },
};
export const hasBoard = (name: string) => name in BOARDS;
const boardMaps = new Map<string, Texture>();
const boardGeometry = new PlaneGeometry(1, 1);

/** The route board for a bus, sized to its box (any units), laid on the bus's front: a ray from ahead finds the front
 * surface at board height (mirrors stick out further than the windscreen, so the box front won't do) and the board
 * sits just proud of it, tilted with it. `body` is the bus as placed in the same frame. LED boards glow: the caller
 * may raise `material.emissiveIntensity` in mist and rain. */
const ray = new Raycaster(), fronts = new Map<string, { z: number; normal: Vector3 }>();
export function destinationBoard(name: string, text: BoardText, size: { length: number; width: number; height: number }, body: Object3D) {
  const b = BOARDS[name], key = `${b.style}-${text}`, y = size.height * b.y;
  if (!boardMaps.has(key)) {
    const map = new TextureLoader().load(`/models/traffic/boards/${key}.webp`);
    map.colorSpace = SRGBColorSpace; map.anisotropy = 4;
    boardMaps.set(key, map);
  }
  const fit = `${name}@${size.length}`;
  if (!fronts.has(fit)) {
    body.updateMatrixWorld(true);
    ray.set(new Vector3(0, y, size.length), new Vector3(0, 0, -1));
    const hit = ray.intersectObject(body, true).find((h) => h.face);
    const normal = hit?.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new Vector3(0, 0, 1);
    if (normal.z < 0) normal.negate();
    fronts.set(fit, { z: hit ? hit.point.z : size.length / 2, normal });
  }
  const front = fronts.get(fit)!, map = boardMaps.get(key)!;
  const material = new MeshStandardMaterial({ map, roughness: 0.6, ...(b.style === "led" ? { emissive: new Color(0xffffff), emissiveMap: map, emissiveIntensity: 0.6 } : {}) });
  const board = new Mesh(boardGeometry, material);
  board.scale.set(size.width * b.w, size.height * b.h, 1);
  board.position.set(0, y, front.z).addScaledVector(front.normal, size.length * 0.003);
  board.lookAt(board.position.clone().add(front.normal));
  board.name = `board-${key}`;
  return board;
}
