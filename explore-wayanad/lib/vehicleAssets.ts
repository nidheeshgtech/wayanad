import { Color, Mesh, MeshStandardMaterial, Object3D, PlaneGeometry, Raycaster, SRGBColorSpace, TextureLoader, Vector3, type Group, type Texture } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

/** One loader for vehicle GLBs (traffic and the /vehicles page): meshopt-compressed models decode, and textures get
 * anisotropic filtering, because roofs and bonnets are seen at a glancing angle and real models pack them into thin
 * texture strips that blur into their neighbours otherwise. Each file loads once; callers clone. */
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<Group>>();

export function loadVehicle(url: string) {
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url).then(({ scene }) => {
    scene.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      for (const m of [o.material].flat() as MeshStandardMaterial[]) for (const t of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap]) if (t) t.anisotropy = 8;
    });
    return scene;
  }));
  return cache.get(url)!;
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
