"use client";
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BoxGeometry, CanvasTexture, CatmullRomCurve3, Color, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry,
  RepeatWrapping, SRGBColorSpace, Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { SECTION } from "@/lib/terrain";
import { CHECKPOSTS, LIMIT, WARN, stepCheckposts } from "@/lib/checkposts";
import { NEON, setLights } from "@/lib/neon";

/* The Kerala Police speed checks (lib/checkposts) on the road: on the left shoulder, a pair of red-and-white barricades,
 * a pole with a light bar flashing red and blue (mirrored in the wet road at night: lib/neon), and 250 m before, the
 * blue board: KERALA POLICE · SPEED CHECK · 60. Units of 10 m. */
const ROAD_DROP = 0.588;

function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d")!);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 4; return t;
}

export default function Checkposts({ curve }: { curve: CatmullRomCurve3 }) {
  const { root, bars, lights } = useMemo(() => {
    const root = new Group(); root.name = "checkposts";
    const L = curve.getLength();
    const frame = (s: number) => {
      const t = Math.min(1, Math.max(0, s / L)), p = curve.getPointAt(t), tan = curve.getTangentAt(t);
      return { p: p.setY(p.y - ROAD_DROP), tan, left: new Vector3(tan.z, 0, -tan.x).normalize(), yaw: Math.atan2(tan.x, tan.z) };
    };
    const stripes = canvasTex(128, 32, (x) => { x.fillStyle = "#f4f1ea"; x.fillRect(0, 0, 128, 32); x.fillStyle = "#d22a2a"; for (let i = -1; i < 9; i++) { x.beginPath(); x.moveTo(i * 16, 32); x.lineTo(i * 16 + 8, 32); x.lineTo(i * 16 + 20, 0); x.lineTo(i * 16 + 12, 0); x.fill(); } });
    stripes.wrapS = RepeatWrapping;
    const board = canvasTex(256, 200, (x) => {
      x.fillStyle = "#1c3f9c"; x.fillRect(0, 0, 256, 200); x.strokeStyle = "#f4f4ef"; x.lineWidth = 6; x.strokeRect(8, 8, 240, 184);
      x.fillStyle = "#f4f4ef"; x.textAlign = "center"; x.font = '700 26px "Instrument Sans", Arial, sans-serif';
      x.fillText("KERALA POLICE", 128, 46); x.font = '600 22px "Instrument Sans", Arial, sans-serif'; x.fillText("SPEED CHECK", 128, 78);
      x.beginPath(); x.arc(128, 136, 46, 0, Math.PI * 2); x.fillStyle = "#fff"; x.fill(); x.lineWidth = 12; x.strokeStyle = "#d22a2a"; x.stroke();
      x.fillStyle = "#111"; x.font = '700 44px "Instrument Sans", Arial, sans-serif'; x.fillText(String(LIMIT), 128, 152);
    });
    const barrierMat = new MeshStandardMaterial({ map: stripes, roughness: 0.6 });
    const metal = new MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.5, metalness: 0.5 });
    const boardMat = new MeshStandardMaterial({ map: board, roughness: 0.5 });
    const red = new MeshBasicMaterial({ color: new Color(0xff2030).multiplyScalar(2) }), blue = new MeshBasicMaterial({ color: NEON.blue.clone().multiplyScalar(2) });
    const bars: { red: MeshBasicMaterial; blue: MeshBasicMaterial } = { red, blue };
    const lights: { x: number; y: number; z: number; color: Color; power: number }[] = [];
    const legs: BoxGeometry[] = [];
    for (const c of CHECKPOSTS) {
      const { p, left, yaw } = frame(c.s);
      const side = SECTION.half + 0.1;
      // two barricades on the shoulder, angled a little into the road's edge
      for (const k of [-0.25, 0.25]) {
        const at = p.clone().addScaledVector(left, side + 0.02).addScaledVector(frame(c.s).tan, k);
        const b = new Mesh(new BoxGeometry(0.13, 0.04, 0.006), barrierMat); b.position.set(at.x, at.y + 0.075, at.z); b.rotation.y = yaw + Math.PI / 2 + 0.15; root.add(b);
        for (const d of [-0.055, 0.055]) legs.push(new BoxGeometry(0.006, 0.08, 0.03).translate(d, 0.04, 0).rotateY(yaw + Math.PI / 2 + 0.15).translate(at.x, at.y, at.z));
      }
      // the light bar on its pole
      const pole = p.clone().addScaledVector(left, side + 0.12);
      legs.push(new BoxGeometry(0.012, 0.3, 0.012).translate(pole.x, pole.y + 0.15, pole.z));
      for (const [mat, off, col] of [[red, 0.025, new Color(0xff2030)], [blue, -0.025, NEON.blue]] as const) {
        const m = new Mesh(new BoxGeometry(0.045, 0.018, 0.02), mat);
        const at = pole.clone().addScaledVector(frame(c.s).tan, off); m.position.set(at.x, pole.y + 0.31, at.z); m.rotation.y = yaw; root.add(m);
        lights.push({ x: at.x, y: pole.y + 0.31, z: at.z, color: col, power: 0 });
      }
      // the board before it, facing you
      const w = frame(c.s - WARN), bp = w.p.clone().addScaledVector(w.left, SECTION.half + 0.14);
      legs.push(new BoxGeometry(0.008, 0.22, 0.008).translate(bp.x, bp.y + 0.11, bp.z));
      const sign = new Mesh(new PlaneGeometry(0.16, 0.125), boardMat); sign.position.set(bp.x, bp.y + 0.25, bp.z); sign.rotation.y = w.yaw + Math.PI; root.add(sign);
      const back = new Mesh(new BoxGeometry(0.165, 0.13, 0.004), metal); back.position.copy(sign.position).addScaledVector(w.tan, 0.003); back.rotation.y = w.yaw; root.add(back);
    }
    root.add(new Mesh(mergeGeometries(legs), metal));
    setLights("checkposts", lights);
    return { root, bars, lights };
  }, [curve]);

  // the light bar flashes red, red, blue, blue (and its reflection with it)
  useFrame((state) => {
    stepCheckposts();
    const t = state.clock.elapsedTime * 4, onRed = Math.floor(t) % 4 < 2, flick = t % 1 < 0.5;
    bars.red.color.setRGB(onRed && flick ? 2 : 0.15, onRed && flick ? 0.25 : 0.02, onRed && flick ? 0.3 : 0.02);
    bars.blue.color.copy(NEON.blue).multiplyScalar(!onRed && flick ? 2 : 0.1);
    for (let i = 0; i < lights.length; i++) lights[i].power = (i % 2 === 0 ? onRed : !onRed) && flick ? 0.9 : 0;
  });
  return <primitive object={root} />;
}
