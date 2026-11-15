/**
 * A player car in its chosen paint (data/cars.ts): the body panels — every part whose name or material says "primary",
 * as these models name their paint — get one shared car-paint material in the colour; glass, lights, trim and tyres
 * keep their own. Used by PlayerCar (before it rigs the wheels), the garage preview and RemoteCars (merged by
 * material, cached per car and colour, so twenty drivers in red Kabinis share one model).
 */
import { Box3, CanvasTexture, CapsuleGeometry, Color, Euler, Group, Matrix4, Mesh, MeshStandardMaterial, Quaternion, SphereGeometry, SRGBColorSpace, Vector3, type Material, type Object3D } from "three";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import { loadVehicle, mergeByMaterial } from "@/lib/vehicleAssets";
import { carOf, colourOf, type Car, type Choice } from "@/data/cars";

const PAINT = /primary/i;
const paints = new Map<string, MeshStandardMaterial>();
/** One paint material per colour: glossy, a little metallic, like car paint. */
export function paintMaterial(hex: string) {
  let m = paints.get(hex);
  if (!m) { m = new MeshStandardMaterial({ color: new Color(hex), roughness: 0.32, metalness: 0.45, envMapIntensity: 1.1 }); m.name = "paint"; paints.set(hex, m); }
  return m;
}

/** Repaints `root` in place (call on a clone). */
export function paintCar(root: Object3D, hex: string, match: RegExp = PAINT) {
  const paint = paintMaterial(hex);
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const mats = [mesh.material].flat() as Material[];
    if (match.test(mesh.name) || mats.some((m) => match.test(m.name))) mesh.material = Array.isArray(mesh.material) ? mats.map(() => paint) : paint;
  });
  return root;
}

/**
 * A rider on a bike, built from smooth shapes (no model file): helmet and jacket in the chosen colour, dark trousers and
 * gloves, leaning forward to the bars, feet on the pegs. Laid out in units of the bike's length (hip on the seat about
 * a third of a length up, a little behind the middle), so it fits whatever size the bike is drawn at; added to the
 * model before it's scaled or merged.
 */
export function addRider(model: Object3D, hex: string) {
  model.updateMatrixWorld(true);
  const box = new Box3().setFromObject(model), size = box.getSize(new Vector3()), c = box.getCenter(new Vector3());
  const rider = new Group(); rider.name = "rider";
  const jacket = new MeshStandardMaterial({ color: new Color(hex), roughness: 0.6 });
  const helmet = new MeshStandardMaterial({ color: new Color(hex), roughness: 0.22, metalness: 0.2 });
  const dark = new MeshStandardMaterial({ color: 0x1d2230, roughness: 0.8 }), visor = new MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.1, metalness: 0.6 });
  // named, so the drawn bike can hide this stand-in once the real driver has loaded (PlayerCar; merged parts take the name)
  for (const m of [jacket, helmet, dark, visor]) m.name = "rider";
  const up = new Vector3(0, 1, 0), d = new Vector3(), q = new Quaternion();
  /** A capsule from a to b (radius r), in rider units. */
  const seg = (a: number[], b: number[], r: number, mat: Material) => {
    const A = new Vector3(...a), B = new Vector3(...b), len = Math.max(0.001, A.distanceTo(B) - 2 * r);
    const m = new Mesh(new CapsuleGeometry(r, len, 4, 10), mat);
    m.position.copy(A).add(B).multiplyScalar(0.5); m.quaternion.copy(q.setFromUnitVectors(up, d.subVectors(B, A).normalize()));
    rider.add(m);
  };
  for (const s of [-1, 1]) {
    seg([s * 0.055, 0.37, -0.1], [s * 0.075, 0.35, 0.08], 0.034, dark);   // thigh
    seg([s * 0.075, 0.35, 0.08], [s * 0.085, 0.2, 0.03], 0.028, dark);    // shin to the peg
    seg([s * 0.075, 0.555, -0.02], [s * 0.13, 0.47, 0.2], 0.024, jacket); // arm to the bar
    const hand = new Mesh(new SphereGeometry(0.028, 10, 8), dark); hand.position.set(s * 0.135, 0.465, 0.215); rider.add(hand);
  }
  seg([0, 0.38, -0.12], [0, 0.56, -0.03], 0.075, jacket); // torso, leaning forward
  const head = new Mesh(new SphereGeometry(0.068, 16, 12), helmet); head.position.set(0, 0.64, 0.0); rider.add(head);
  const shield = new Mesh(new SphereGeometry(0.069, 16, 8, -0.75, 1.5, 1.15, 0.6), visor); shield.position.copy(head.position); rider.add(shield);
  rider.scale.setScalar(size.z); rider.position.set(c.x, box.min.y, c.z);
  for (const m of rider.children as Mesh[]) { m.castShadow = true; m.name = "rider"; }
  model.add(rider);
  return model;
}

/** Paint where the body's own texture is white (its paint) and leave the rest of it — glass, lamps, trim, all in the
 * same texture — as it is: the texel's whiteness picks the paint, shaded by the texel's own light and dark. */
const masked = new Map<string, MeshStandardMaterial>();
export function maskPaint(root: Object3D, match: RegExp, hex: string) {
  root.traverse((o) => {
    const mesh = o as Mesh; if (!mesh.isMesh) return;
    const swap = (m: Material) => {
      if (!match.test(m.name)) return m;
      const key = `${m.uuid}:${hex}`;
      if (!masked.has(key)) {
        const c = (m as MeshStandardMaterial).clone(); c.name = m.name;
        const paint = { value: new Color(hex) };
        c.roughness = 0.32; c.metalness = 0.45;
        c.onBeforeCompile = (sh) => {
          sh.uniforms.uPaint = paint;
          sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform vec3 uPaint;")
            .replace("#include <map_fragment>", `#include <map_fragment>
              float lo = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b)), hi = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
              float white = smoothstep(0.55, 0.8, lo) * (1.0 - smoothstep(0.06, 0.16, hi - lo)); // (light and colourless: the paint, smudges and all)
              diffuseColor.rgb = mix(diffuseColor.rgb, uPaint * (0.55 + 0.45 * diffuseColor.r), white);`);
        };
        c.customProgramCacheKey = () => "mask-paint";
        masked.set(key, c);
      }
      return masked.get(key)!;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
  return root;
}

/** A clone of the vehicle ready to draw: painted (cars), or with its rider in the chosen colour (bikes). */
export function prepareVehicle(root: Object3D, car: Car, hex: string) {
  if (car.bike) return addRider(root, hex);
  if (car.paintMask) { maskPaint(root, car.paint, hex); return car.livery ? addLivery(root, car.paint) : root; }
  // a vehicle taken from the traffic (data/cars BORROWABLE): tinted as the traffic tints it — its body's own material,
  // textures kept, in the colour it had on the road — so it doesn't change colour as you get in
  // (the police jeep is the 4×4, painted as your own would be; the ambulance's body plain white, as in the traffic —
  // its texture is the van's red, which a tint can't whiten)
  if (car.id === "t-police") return paintCar(root, hex);
  if (car.id.startsWith("t-")) {
    root.traverse((o) => {
      const mesh = o as Mesh; if (!mesh.isMesh) return;
      const tint = (m: Material) => {
        if (!car.paint.test(m.name)) return m;
        const c = (m as MeshStandardMaterial).clone(); c.color.set(hex);
        if (car.id === "t-amb") { c.map = null; c.roughness = 0.38; c.metalness = 0.2; }
        return c;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(tint) : tint(mesh.material);
    });
    return root;
  }
  // (the newer cars name their paint material their own way: data/cars `paint`; the first ones all say "primary")
  paintCar(root, hex, car.livery ? car.paint : PAINT);
  return car.livery ? addLivery(root, /^paint$/) : root;
}

const painted = new Map<string, Promise<Group>>();
/** The car in its colour, merged by material (few draw calls), shared: clone it to place one. */
export function paintedCar(choice: Choice) {
  const key = `${choice.car}:${choice.colour}`;
  let p = painted.get(key);
  if (!p) {
    const car = carOf(choice.car), hex = colourOf(choice.colour).hex;
    p = loadVehicle(car.file).then((src) => mergeByMaterial(prepareVehicle(src.clone(true), car, hex) as Group));
    painted.set(key, p);
  }
  return p;
}

/* ---- the game's livery (data/cars `livery`): DRIVE WAYANAD down each side over a gold stripe, the road-curve logo in a
 * badge on the bonnet — decals projected onto the curved body (three's DecalGeometry), drawn in canvas ---- */
const ROAD = "M26 78 C26 52 74 50 74 30 C74 18 62 14 52 18"; // the logo's curve, in a 100 × 100 box (app/icon)
function drawCurve(g: CanvasRenderingContext2D, x: number, y: number, size: number, width: number, colour: string) {
  g.save(); g.translate(x, y); g.scale(size / 100, size / 100);
  g.lineCap = "round"; g.lineWidth = width; g.strokeStyle = colour; g.stroke(new Path2D(ROAD)); g.restore();
}
let sideTex: CanvasTexture | null = null, badgeTex: CanvasTexture | null = null;
function sideTexture() {
  if (sideTex) return sideTex;
  const c = document.createElement("canvas"); c.width = 1024; c.height = 256;
  const g = c.getContext("2d")!;
  // a gold stripe along the bottom, thin dark edges, fading out toward the front
  const grad = g.createLinearGradient(0, 0, 1024, 0); grad.addColorStop(0, "rgba(255,204,51,0)"); grad.addColorStop(0.12, "#ffcc33"); grad.addColorStop(1, "#ffb81c");
  g.fillStyle = "rgba(14,20,18,.85)"; g.fillRect(40, 186, 984, 34);
  g.fillStyle = grad; g.fillRect(40, 190, 984, 26);
  // the logo, then the words
  g.fillStyle = "rgba(14,20,18,.0)"; drawCurve(g, 70, 30, 150, 15, "#14191a"); drawCurve(g, 70, 30, 150, 10, "#ffcc33");
  g.font = "italic 900 92px Arial, sans-serif"; g.textBaseline = "middle";
  g.lineWidth = 10; g.strokeStyle = "#14191a"; g.strokeText("DRIVE", 230, 108); g.fillStyle = "#ffffff"; g.fillText("DRIVE", 230, 108);
  const w = g.measureText("DRIVE ").width;
  g.strokeText("WAYANAD", 230 + w, 108); g.fillStyle = "#ffcc33"; g.fillText("WAYANAD", 230 + w, 108);
  sideTex = new CanvasTexture(c); sideTex.colorSpace = SRGBColorSpace; sideTex.anisotropy = 8;
  return sideTex;
}
function badgeTexture() {
  if (badgeTex) return badgeTex;
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.beginPath(); g.arc(128, 128, 118, 0, Math.PI * 2); g.fillStyle = "#0e1f1a"; g.fill(); g.lineWidth = 10; g.strokeStyle = "#ffcc33"; g.stroke();
  drawCurve(g, 28, 28, 200, 16, "#ffcc33");
  badgeTex = new CanvasTexture(c); badgeTex.colorSpace = SRGBColorSpace; badgeTex.anisotropy = 8;
  return badgeTex;
}
const decalMaterial = (map: CanvasTexture) => new MeshStandardMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.35, metalness: 0.2 });
export function addLivery(root: Object3D, body: RegExp) {
  root.updateMatrixWorld(true);
  let shell: Mesh | null = null;
  root.traverse((o) => { const m = o as Mesh; if (!shell && m.isMesh && [m.material].flat().some((x) => body.test((x as Material).name))) shell = m; });
  if (!shell) return root;
  const box = new Box3().setFromObject(shell), size = box.getSize(new Vector3()), mid = box.getCenter(new Vector3());
  const inv = new Matrix4().copy(root.matrixWorld).invert();
  const place = (geo: DecalGeometry, map: CanvasTexture, name: string) => { geo.applyMatrix4(inv); const d = new Mesh(geo, decalMaterial(map)); d.name = name; d.renderOrder = 1; root.add(d); };
  // each side: along the doors and rear wing, low on the body; projected inward
  // the sides cross more than one part on some cars (a two-tone body is two meshes): project onto every solid outer
  // part the lettering's box touches, only its outer skin (a shallow box at the side, not through to the cabin)
  const solids: Mesh[] = [];
  root.traverse((o) => { const m = o as Mesh; if (m.isMesh && !/^livery/.test(m.name) && [m.material].flat().every((x) => !(x as Material).transparent)) solids.push(m); });
  for (const side of [1, -1]) {
    // (between the wheel arches: the wheelbase is about the middle half of the car)
    const at = new Vector3(mid.x + side * size.x * 0.47, box.min.y + size.y * 0.34, mid.z - size.z * 0.015);
    const dims = new Vector3(size.z * 0.47, size.z * 0.118, size.x * 0.36), euler = new Euler(0, side * Math.PI / 2, 0);
    const reach = new Box3().setFromCenterAndSize(at, new Vector3(size.x * 0.36, dims.y, dims.x));
    for (const m of solids) {
      if (!new Box3().setFromObject(m).intersectsBox(reach)) continue;
      const geo = new DecalGeometry(m, at, euler, dims);
      if (geo.getAttribute("position").count) place(geo, sideTexture(), "livery-side"); else geo.dispose();
    }
  }
  // the bonnet badge: from above, on the front of the bonnet
  const nose = new Vector3(mid.x, box.max.y, mid.z + size.z * 0.33);
  place(new DecalGeometry(shell, nose, new Euler(-Math.PI / 2, 0, 0), new Vector3(size.x * 0.22, size.x * 0.22, size.y * 1.2)), badgeTexture(), "livery-badge");
  return root;
}