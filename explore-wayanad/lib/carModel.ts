/**
 * A player car in its chosen paint (data/cars.ts): the body panels — every part whose name or material says "primary",
 * as these models name their paint — get one shared car-paint material in the colour; glass, lights, trim and tyres
 * keep their own. Used by PlayerCar (before it rigs the wheels), the garage preview and RemoteCars (merged by
 * material, cached per car and colour, so twenty drivers in red Kabinis share one model).
 */
import { Box3, CapsuleGeometry, Color, Group, Mesh, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3, type Material, type Object3D } from "three";
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
export function paintCar(root: Object3D, hex: string) {
  const paint = paintMaterial(hex);
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const mats = [mesh.material].flat() as Material[];
    if (PAINT.test(mesh.name) || mats.some((m) => PAINT.test(m.name))) mesh.material = Array.isArray(mesh.material) ? mats.map(() => paint) : paint;
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

/** A clone of the vehicle ready to draw: painted (cars), or with its rider in the chosen colour (bikes). */
export function prepareVehicle(root: Object3D, car: Car, hex: string) {
  return car.bike ? addRider(root, hex) : paintCar(root, hex);
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
