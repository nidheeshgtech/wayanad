"use client";
/**
 * The real sky over Wayanad (lib/live): real flights near Wayanad as small airliners with their navigation lights
 * (red left, green right, a white strobe, a red beacon), and the space station as a bright moving star when it's
 * above the horizon, each where it really is from where you are on the road (its bearing and its height above the
 * horizon). Drawn on a shell 320 units out (inside the sky dome), behind the hills when a ridge is in the way.
 * One instanced mesh for the planes and one set of points for every light: two draws.
 */
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color, InstancedMesh, MeshBasicMaterial, Object3D, Points, PointsMaterial, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { latLonToWorld } from "@/lib/terrain";
import { distBearing, elevation, flightName, issNow, live, planeNow, skyNow } from "@/lib/live";
import { nightness } from "@/lib/theme";
import { announce } from "@/lib/score";

const SHELL = 320, MAX = 12, LIGHTS = MAX * 4 + 1;
const rad = (d: number) => (d * Math.PI) / 180;
const DAY = new Color(0x7d848c), NIGHT = new Color(0x15181c);

export default function LiveSky() {
  const built = useMemo(() => {
    const body = mergeGeometries([
      new BoxGeometry(0.14, 0.14, 1.4), new BoxGeometry(1.3, 0.04, 0.3).translate(0, 0, -0.05),
      new BoxGeometry(0.5, 0.03, 0.18).translate(0, 0.02, 0.6), new BoxGeometry(0.03, 0.3, 0.2).translate(0, 0.15, 0.62),
    ]);
    const mat = new MeshBasicMaterial({ color: DAY.clone(), fog: false });
    const planes = new InstancedMesh(body, mat, MAX); planes.count = 0; planes.frustumCulled = false; planes.name = "live-planes";
    const c = document.createElement("canvas"); c.width = c.height = 32; const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16); grad.addColorStop(0, "#fff"); grad.addColorStop(0.35, "rgba(255,255,255,.8)"); grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(new Float32Array(LIGHTS * 3), 3));
    geo.setAttribute("color", new BufferAttribute(new Float32Array(LIGHTS * 3), 3));
    const lights = new Points(geo, new PointsMaterial({ size: 12, sizeAttenuation: false, vertexColors: true, map: new CanvasTexture(c), transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false }));
    lights.frustumCulled = false; lights.name = "live-lights";
    return { planes, lights, mat, o: new Object3D(), dir: new Vector3(), side: new Vector3(), geoK: null as null | { kx: number; kz: number; lat0: number; lon0: number }, issUp: false };
  }, []);

  useFrame(({ camera, clock }) => {
    const { planes, lights, mat, o, dir, side } = built;
    let geoK = built.geoK;
    // where the camera is, in degrees (the inverse of lib/terrain's projection)
    if (!geoK) { const a = latLonToWorld(11.5, 76), b = latLonToWorld(11.6, 76.1); const kx = (b.x - a.x) / 0.1, kz = (b.z - a.z) / 0.1; geoK = built.geoK = { kx, kz, lat0: 11.5 - a.z / kz, lon0: 76 - a.x / kx }; }
    const lat = geoK.lat0 + camera.position.z / geoK.kz, lon = geoK.lon0 + camera.position.x / geoK.kx;
    const now = Date.now(), t = clock.elapsedTime, night = nightness();
    mat.color.copy(DAY).lerp(NIGHT, night);
    const pos = lights.geometry.attributes.position as BufferAttribute, col = lights.geometry.attributes.color as BufferAttribute;
    let n = 0, k = 0;
    const put = (v: Vector3, r: number, g: number, b: number) => { pos.setXYZ(k, v.x, v.y, v.z); col.setXYZ(k, r, g, b); k++; };
    const aim = (bearing: number, elev: number) => dir.set(Math.sin(rad(bearing)) * Math.cos(rad(elev)), Math.sin(rad(elev)), -Math.cos(rad(bearing)) * Math.cos(rad(elev)));
    // the flights in sight, nearest first
    const seen: { p: (typeof live.planes)[number]; km: number; bearing: number; elev: number; alt: number }[] = [];
    for (const p of live.planes) {
      const q = planeNow(p, now); if (!q) continue;
      const { km, bearing } = distBearing(lat, lon, q.lat, q.lon), elev = elevation(km, q.alt / 1000);
      if (elev > 1.5) seen.push({ p, km, bearing, elev, alt: q.alt });
    }
    seen.sort((a, b) => a.km - b.km);
    skyNow.plane = seen[0] ? { name: flightName(seen[0].p.call), alt: seen[0].alt, km: seen[0].km, bearing: seen[0].bearing } : null;
    for (const s of seen.slice(0, MAX)) {
      aim(s.bearing, s.elev); const at = dir.clone().multiplyScalar(SHELL).add(camera.position);
      o.position.copy(at); o.rotation.set(0, -rad(s.p.track), 0); o.scale.setScalar(Math.max(1, Math.min(2.4, 45 / Math.max(8, s.km)))); o.updateMatrix();
      planes.setMatrixAt(n++, o.matrix);
      // the lights: wingtips (left red, right green), a white strobe and a red beacon, each blinking on its own beat
      const sc = o.scale.x, ph = (parseInt(s.p.id.slice(-3), 16) || 0) / 4096;
      side.set(Math.cos(rad(s.p.track)), 0, Math.sin(rad(s.p.track))).multiplyScalar(0.65 * sc); // (right of the nose)
      put(at.clone().sub(side), 1.6, 0.15, 0.1); put(at.clone().add(side), 0.15, 1.6, 0.45);
      const strobe = (t + ph) % 1.2 < 0.07 ? 1 : 0, beacon = (t * 0.9 + ph) % 1 < 0.25 ? 0.9 : 0;
      put(at.clone().setY(at.y - 0.05), strobe, strobe, strobe); put(at.clone().setY(at.y + 0.12 * sc), beacon, 0.05 * beacon, 0);
    }
    planes.count = n; planes.instanceMatrix.needsUpdate = true;
    // the space station: steady and bright (in daylight too: a game's licence), with a toast as it comes up
    const iss = issNow(now);
    if (iss) {
      const { km, bearing } = distBearing(lat, lon, iss.lat, iss.lon), elev = elevation(km, iss.alt);
      skyNow.iss = elev > 0 ? { elev, bearing } : null;
      if (elev > 0) { aim(bearing, elev); put(dir.clone().multiplyScalar(SHELL).add(camera.position), 1.6, 1.55, 1.4); }
      if (elev > 10 && !built.issUp) { built.issUp = true; announce("🛰 The real space station is above Wayanad now! Look up", "big"); }
      if (elev < 5) built.issUp = false;
    } else skyNow.iss = null;
    for (let i = k; i < LIGHTS; i++) col.setXYZ(i, 0, 0, 0);
    pos.needsUpdate = true; col.needsUpdate = true; lights.geometry.setDrawRange(0, k);
  });
  return <><primitive object={built.planes} /><primitive object={built.lights} /></>;
}
