"use client";
/**
 * The side streets' traffic (lib/streetTraffic): autos with their driver and passengers, bikes with a rider, scooters
 * with a pillion rider, the fish seller's bike with its blue crate; the highway traffic's own models, sized as it sizes
 * them. On the highway before and after a street they're drawn in its left lane. Only near the camera.
 */
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Box3, BoxGeometry, CatmullRomCurve3, Group, Mesh, MeshStandardMaterial, Vector3, type Object3D } from "three";
import { loadVehicle } from "@/lib/vehicleAssets";
import { VEHICLES, vehiclePose } from "@/lib/traffic";
import { legRoad, roadOf, streets, STREET } from "@/lib/streets";
import { SECTION, roadShapeAt } from "@/lib/terrain";
import { addRider } from "@/lib/carModel";
import { hasOccupants, occupantMaterial, occupantsFor } from "@/lib/occupants";
import { RUN, makeStreetFleets, mainOf, stepStreetTraffic, streetTraffic, type StreetCar } from "@/lib/streetTraffic";
import { duskness, nightness } from "@/lib/theme";
import { game } from "@/lib/game";

const JACKETS = ["#1d2230", "#7a2f34", "#2f4f7a", "#3f5f3a", "#8a5a2b"];
const PILLION = ["#c2185b", "#e0a526", "#6a3d9a", "#1f8a70"]; // (a saree or a churidar behind)
const SEE = 30; // units: drawn within this of the camera
const lamp = new BoxGeometry(0.03, 0.02, 0.006);
const streetWiden = () => STREET.half - SECTION.half;
const mainWiden = (t: number) => roadShapeAt(t).widen, flat = () => 0; // (the forest road: no widening)
const crateMat = new MeshStandardMaterial({ color: 0x1f6fd1, roughness: 0.55 });
const fishMat = new MeshStandardMaterial({ color: 0xb9c4cc, roughness: 0.3, metalness: 0.4 });

/** A rider on a riderless bike's model (addRider), and for a scooter a second one behind, a little lower. */
function riders(model: Object3D, v: StreetCar) {
  const jacket = JACKETS[v.id % JACKETS.length];
  addRider(model, jacket);
  if (v.look !== "pillion") return;
  const first = model.children.find((c) => c.name === "rider"); if (!first) return;
  // the same rider again, sat behind (rider units: the bike's length), in their own colours
  const back = first.clone(), k = first.scale.z, colour = new MeshStandardMaterial({ color: PILLION[v.id % PILLION.length], roughness: 0.7 });
  back.traverse((o) => { if (o instanceof Mesh && (o.material as MeshStandardMaterial).color.getHexString() === jacket.slice(1)) o.material = colour; });
  back.position.z -= k * 0.2; back.position.y += k * 0.02; back.scale.multiplyScalar(0.94);
  model.add(back);
}

export default function StreetTraffic({ curve, small }: { curve: CatmullRomCurve3; small: boolean }) {
  const built = useMemo(() => {
    const road = roadOf(curve), list = streets(curve), fleets = makeStreetFleets(list, small, road), root = new Group(); root.name = "street-traffic";
    const bulb = new MeshStandardMaterial({ color: 0xffefce, emissive: 0xffdca0, emissiveIntensity: 0 });
    const objs = fleets.map((fleet) => fleet.map((v) => {
      const g = new Group(), tilt = new Group(); g.add(tilt); g.visible = false; root.add(g);
      const spec = VEHICLES[v.kind], bike = spec.width < 0.12;
      for (const x of bike ? [0] : [-spec.width * 0.32, spec.width * 0.32]) { const l = new Mesh(lamp, bulb); l.position.set(x, spec.height * (bike ? 0.62 : 0.32), spec.length / 2 + 0.002); tilt.add(l); }
      if (hasOccupants(spec.name)) { const geo = occupantsFor(spec.name, spec.length, v.id); if (geo) tilt.add(new Mesh(geo, occupantMaterial)); }
      if (v.look === "fish") { // the fish seller: a blue crate strapped on behind, a scale's pan on top
        const crate = new Mesh(new BoxGeometry(0.075, 0.05, 0.065), crateMat); crate.position.set(0, 0.085, -0.075); crate.castShadow = !small; tilt.add(crate);
        const pan = new Mesh(new BoxGeometry(0.04, 0.004, 0.04), fishMat); pan.position.set(0, 0.112, -0.075); tilt.add(pan);
      }
      return { g, tilt };
    }));
    // where they come from and go to on the highway (for "is anyone looking")
    const L = curve.getLength(), at = (s: number) => curve.getPointAt(Math.min(1, Math.max(0, s / L)));
    const ends = list.map((st) => [at(st.from - RUN), at(st.to + RUN)] as const);
    return { list, fleets, root, objs, bulb, ends, road };
  }, [curve, small]);

  // the models (the traffic's own, sized to their spec as Traffic sizes them)
  useEffect(() => {
    let gone = false;
    streetTraffic.by[built.road] = { built: built.list, fleets: built.fleets };
    built.fleets.forEach((fleet, i) => fleet.forEach((v, j) => {
      const spec = VEHICLES[v.kind];
      void loadVehicle(`/models/traffic/${spec.name}.glb`, { merged: true }).then((src) => {
        if (gone || !src) return;
        const model = src.clone(true);
        if (spec.width < 0.12) riders(model, v);
        model.updateMatrixWorld(true);
        const bb = new Box3().setFromObject(model), size = bb.getSize(new Vector3()), c = bb.getCenter(new Vector3());
        model.scale.set(spec.width / size.x, spec.height / size.y, spec.length / size.z);
        model.position.set(-c.x * spec.width / size.x, -bb.min.y * spec.height / size.y, -c.z * spec.length / size.z);
        model.traverse((o) => { if (o instanceof Mesh) { o.castShadow = !small; o.receiveShadow = true; } });
        built.objs[i][j].tilt.add(model);
      }, () => {});
    }));
    return () => { gone = true; streetTraffic.by[built.road] = { built: null, fleets: [] }; };
  }, [built, small]);

  useFrame(({ camera }, dt) => {
    const cam = camera.position;
    if (!game.paused) stepStreetTraffic(dt, (i, end) => built.ends[i][end].distanceTo(cam) > 8, built.road);
    built.bulb.emissiveIntensity = duskness() * 0.8 + nightness() * 1.6;
    built.fleets.forEach((fleet, i) => {
      const st = built.list[i];
      fleet.forEach((v, j) => {
        const { g, tilt } = built.objs[i][j];
        if (v.off || legRoad() !== built.road) { g.visible = false; return; }
        // on the street, or on the highway before or after it
        const off = v.distance < 0 || v.distance > st.length;
        const pose = off ? vehiclePose(curve, { ...v, distance: mainOf(st, v.distance) }, built.road === "forest" ? flat : mainWiden) : vehiclePose(st.curve, v, streetWiden);
        g.visible = pose.position.distanceTo(cam) < SEE;
        if (!g.visible) return;
        g.position.copy(pose.position); g.quaternion.copy(pose.rotation);
        // a bike knocked over lies on its side, away from you
        tilt.rotation.z = (v.fall ?? 0) * 1.35 * (v.fallSide ?? 1);
      });
    });
  });
  return <primitive object={built.root} />;
}
