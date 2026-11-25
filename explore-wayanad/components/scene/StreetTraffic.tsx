"use client";
/**
 * The side streets' traffic (lib/streetTraffic): autos with their driver and passengers, and bikes with a rider, the
 * highway traffic's own models sized as it sizes them. Drawn only near the camera; stepped every frame.
 */
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Box3, BoxGeometry, CatmullRomCurve3, Group, Mesh, MeshStandardMaterial, Vector3 } from "three";
import { loadVehicle } from "@/lib/vehicleAssets";
import { VEHICLES, vehiclePose } from "@/lib/traffic";
import { streets, STREET } from "@/lib/streets";
import { SECTION } from "@/lib/terrain";
import { addRider } from "@/lib/carModel";
import { hasOccupants, occupantMaterial, occupantsFor } from "@/lib/occupants";
import { makeStreetFleets, stepStreetTraffic, streetTraffic } from "@/lib/streetTraffic";
import { duskness, nightness } from "@/lib/theme";
import { game } from "@/lib/game";

const JACKETS = ["#1d2230", "#7a2f34", "#2f4f7a", "#3f5f3a", "#8a5a2b"];
const SEE = 30; // units: drawn within this of the camera
const lamp = new BoxGeometry(0.03, 0.02, 0.006);
const widen = () => STREET.half - SECTION.half;

export default function StreetTraffic({ curve, small }: { curve: CatmullRomCurve3; small: boolean }) {
  const built = useMemo(() => {
    const list = streets(curve), fleets = makeStreetFleets(list, small), root = new Group(); root.name = "street-traffic";
    const bulb = new MeshStandardMaterial({ color: 0xffefce, emissive: 0xffdca0, emissiveIntensity: 0 });
    const objs = fleets.map((fleet) => fleet.map((v) => {
      const g = new Group(), tilt = new Group(); g.add(tilt); g.visible = false; root.add(g);
      const spec = VEHICLES[v.kind], bike = spec.width < 0.12;
      for (const x of bike ? [0] : [-spec.width * 0.32, spec.width * 0.32]) { const l = new Mesh(lamp, bulb); l.position.set(x, spec.height * (bike ? 0.62 : 0.32), spec.length / 2 + 0.002); tilt.add(l); }
      if (hasOccupants(spec.name)) { const geo = occupantsFor(spec.name, spec.length, v.id); if (geo) tilt.add(new Mesh(geo, occupantMaterial)); }
      return { g, tilt };
    }));
    // the ends of each street, for "is anyone looking"
    const ends = list.map((st) => [st.curve.getPointAt(0), st.curve.getPointAt(1)]);
    return { list, fleets, root, objs, bulb, ends };
  }, [curve, small]);

  // the models (the traffic's own, sized to their spec as Traffic sizes them)
  useEffect(() => {
    let gone = false;
    Object.assign(streetTraffic, { built: built.list, fleets: built.fleets });
    built.fleets.forEach((fleet, i) => fleet.forEach((v, j) => {
      const spec = VEHICLES[v.kind];
      void loadVehicle(`/models/traffic/${spec.name}.glb`, { merged: true }).then((src) => {
        if (gone || !src) return;
        const model = src.clone(true);
        if (spec.width < 0.12) addRider(model, JACKETS[v.id % JACKETS.length]);
        model.updateMatrixWorld(true);
        const bb = new Box3().setFromObject(model), size = bb.getSize(new Vector3()), c = bb.getCenter(new Vector3());
        model.scale.set(spec.width / size.x, spec.height / size.y, spec.length / size.z);
        model.position.set(-c.x * spec.width / size.x, -bb.min.y * spec.height / size.y, -c.z * spec.length / size.z);
        model.traverse((o) => { if (o instanceof Mesh) { o.castShadow = !small; o.receiveShadow = true; } });
        built.objs[i][j].tilt.add(model);
      }, () => {});
    }));
    return () => { gone = true; streetTraffic.built = null; streetTraffic.fleets = []; };
  }, [built, small]);

  useFrame(({ camera }, dt) => {
    const cam = camera.position;
    if (!game.paused) stepStreetTraffic(dt, (i) => built.ends[i].every((e) => e.distanceTo(cam) > 7));
    built.bulb.emissiveIntensity = duskness() * 0.8 + nightness() * 1.6;
    built.fleets.forEach((fleet, i) => {
      const st = built.list[i];
      fleet.forEach((v, j) => {
        const { g, tilt } = built.objs[i][j];
        const pose = vehiclePose(st.curve, v, widen);
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
