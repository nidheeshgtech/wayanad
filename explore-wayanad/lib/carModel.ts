/**
 * A player car in its chosen paint (data/cars.ts): the body panels — every part whose name or material says "primary",
 * as these models name their paint — get one shared car-paint material in the colour; glass, lights, trim and tyres
 * keep their own. Used by PlayerCar (before it rigs the wheels), the garage preview and RemoteCars (merged by
 * material, cached per car and colour, so twenty drivers in red Kabinis share one model).
 */
import { Color, Group, Mesh, MeshStandardMaterial, type Material, type Object3D } from "three";
import { loadVehicle, mergeByMaterial } from "@/lib/vehicleAssets";
import { carOf, colourOf, type Choice } from "@/data/cars";

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

const painted = new Map<string, Promise<Group>>();
/** The car in its colour, merged by material (few draw calls), shared: clone it to place one. */
export function paintedCar(choice: Choice) {
  const key = `${choice.car}:${choice.colour}`;
  let p = painted.get(key);
  if (!p) {
    const car = carOf(choice.car), hex = colourOf(choice.colour).hex;
    p = loadVehicle(car.file).then((src) => mergeByMaterial(paintCar(src.clone(true), hex) as Group));
    painted.set(key, p);
  }
  return p;
}
