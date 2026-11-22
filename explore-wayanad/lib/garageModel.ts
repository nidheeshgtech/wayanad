import { Box3, Group, Mesh, MeshStandardMaterial, Vector3, type Object3D } from "three";
import { loadVehicle } from "@/lib/vehicleAssets";
import { autoWheels, type Wheel } from "@/lib/autoWheels";
import { debadge } from "@/lib/debadge";
import { autoRotors, type Rotor } from "@/lib/autoRotors";
import type { NewRide } from "@/data/newGarage";

/* The new garage's vehicles as models (the showroom, components/collection/ShowroomView; the fly mode,
 * components/drive/Fly): placed, cleaned of badges, their wheels or rotors found so they turn. */
export type Ready = { model: Object3D; wheels: Wheel[]; rotors: Rotor[]; size: Vector3 };

/** A new ride made ready to show: turned so its length runs along z (front to +z), at its real length in metres,
 * standing on the floor in the middle, its wheels found so they roll (lib/autoWheels). Cached per ride. */
const cache = new Map<string, Promise<Ready>>();
export function readyRide(r: NewRide) {
  if (!cache.has(r.id)) cache.set(r.id, loadVehicle(r.file).then((src) => {
    const inner = src.clone(true), model = new Group();
    model.add(inner);
    // ground and shadow planes some files carry: flat, a few triangles, as big as the car (they'd set its size)
    const all = new Box3().setFromObject(inner).getSize(new Vector3()), flat: Mesh[] = [];
    inner.traverse((o) => {
      const m = o as Mesh; if (!m.isMesh) return;
      const n = (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute("position").count) / 3, s = new Box3().setFromObject(m).getSize(new Vector3());
      if ((n <= 24 || s.y < 0.005 * Math.max(all.x, all.z)) && s.y < 0.02 * all.y && s.x * s.z > 0.4 * all.x * all.z) flat.push(m);
    });
    for (const m of flat) m.removeFromParent();
    // a file with several vehicles side by side: only the part of it along its length `crop` gives (fractions)
    if (r.crop) {
      const b = new Box3().setFromObject(inner), x = all.x >= all.z ? "x" : "z", lo = b.min[x], span = b.max[x] - lo, out: Mesh[] = [];
      inner.traverse((o) => { const m = o as Mesh; if (!m.isMesh) return; const c = new Box3().setFromObject(m).getCenter(new Vector3())[x];
        if (c < lo + r.crop![0] * span || c > lo + r.crop![1] * span) out.push(m); });
      for (const m of out) m.removeFromParent();
    }
    let size = new Box3().setFromObject(inner).getSize(new Vector3());
    if (size.x > size.z) inner.rotation.y = Math.PI / 2;
    inner.rotation.y += (r.turn ? Math.PI : 0) + (r.yaw ?? 0);
    if (r.pitch) inner.rotation.x = r.pitch;
    inner.updateMatrixWorld(true);
    size = new Box3().setFromObject(inner).getSize(new Vector3());
    inner.scale.multiplyScalar(r.length / size.z);
    inner.updateMatrixWorld(true);
    const b = new Box3().setFromObject(inner), c = b.getCenter(new Vector3());
    inner.position.set(-c.x, -b.min.y, -c.z);
    model.traverse((o) => {
      const m = o as Mesh; if (!m.isMesh) return; m.castShadow = true;
      for (const mat of [m.material].flat() as MeshStandardMaterial[]) if (mat.isMeshStandardMaterial) mat.envMapIntensity = 1;
    });
    if (r.clean) debadge(model, r.clean);
    // (a helicopter has rotors, not wheels: its skids or little wheels stay put)
    const rotors = r.cls === "heli" ? autoRotors(model, { tail: r.tail, main: r.main, hub: r.hub }) : [];
    const wheels = r.cls === "heli" ? [] : autoWheels(model, { maxRadius: r.cls === "bike" ? 0.2 : r.cls === "offroad" || r.cls === "truck" ? 0.16 : 0.1 });
    // stand it on its tyres (a stray part hanging lower, as a bike's chain can, set the floor otherwise)
    if (wheels.length) { const low = Math.min(...wheels.map((w) => w.pivot.position.y - w.radius)); if (low > 0.005) model.position.y -= low; }
    return { model, wheels, rotors, size: new Box3().setFromObject(model).getSize(new Vector3()) };
  }));
  return cache.get(r.id)!;
}

