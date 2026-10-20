import { Mesh, MeshStandardMaterial, type Group } from "three";
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
