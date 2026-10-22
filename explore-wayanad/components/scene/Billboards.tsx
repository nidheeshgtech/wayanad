"use client";
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { BoxGeometry, CanvasTexture, CatmullRomCurve3, Group, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Texture, TextureLoader, Vector3 } from "three";
import { archT, bendTs, height } from "@/lib/terrain";
import { duskness } from "@/lib/theme";
import { ADVERTISE, BOARDS } from "@/data/sponsors";

/* Roadside hoardings, as the real churam has: a 6 × 3 m board on two steel legs, behind the barrier on the valley
 * side just past each hairpin, on the longer stretches between them, and before the Lakkidi gate; turned toward the road
 * you arrive on, artwork both sides.
 * The artwork comes from data/sponsors.ts; an unsold board says "Advertise here". Lit after dusk. Units of 10 m. */
const SIZE = { w: 0.8, h: 0.4, clear: 0.24 }; // board width, height, and how far its foot stands above the road

/** The "Advertise here" artwork, in the site's colours. */
function advertise() {
  const c = document.createElement("canvas"); c.width = 1024; c.height = 512;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0e1f1a"; g.fillRect(0, 0, 1024, 512);
  g.strokeStyle = "#d9a441"; g.lineWidth = 10; g.strokeRect(24, 24, 976, 464);
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "#eef2ee"; g.font = "300 132px Fraunces, Georgia, serif"; g.fillText(ADVERTISE.title, 512, 210);
  g.fillStyle = "#b8c7c0"; g.font = "500 44px 'Instrument Sans', Arial, sans-serif"; g.fillText(ADVERTISE.line, 512, 330);
  g.fillStyle = "#d9a441"; g.font = "500 38px 'Instrument Sans', Arial, sans-serif"; g.fillText(ADVERTISE.contact.toUpperCase(), 512, 410);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 4; return t;
}

export default function Billboards({ curve }: { curve: CatmullRomCurve3 }) {
  const built = useMemo(() => {
    const group = new Group(); group.name = "billboards";
    const L = curve.getLength(), bends = bendTs(), side = new Vector3(), loader = new TextureLoader();
    const leg = new BoxGeometry(0.012, 1, 0.012), legMat = new MeshStandardMaterial({ color: 0x4a4d4f, roughness: 0.5, metalness: 0.6 });
    const back = new MeshStandardMaterial({ color: 0x2b2e30, roughness: 0.8 }), frame = new BoxGeometry(SIZE.w + 0.02, SIZE.h + 0.02, 0.012);
    const panel = new PlaneGeometry(SIZE.w, SIZE.h), faces: MeshStandardMaterial[] = [], textures: Texture[] = [];
    let unsold: Texture | null = null;
    for (const b of BOARDS) {
      const s = b.gate ? archT() * L + b.after : b.bend ? bends[b.bend - 1] * L + b.after
        : b.between ? ((bends[b.between[0] - 1] + bends[b.between[1] - 1]) / 2) * L + b.after : null;
      if (s === null || s < 2 || s > L - 2) continue;
      const t = s / L, p = curve.getPointAt(t), tan = curve.getTangentAt(t).setY(0).normalize();
      side.set(tan.z, 0, -tan.x);
      // valley side (the lower ground), behind the barrier posts
      const out = height(p.x + side.x * 3, p.z + side.z * 3) < height(p.x - side.x * 3, p.z - side.z * 3) ? 1 : -1;
      const at = p.clone().addScaledVector(side, out * 0.95), ground = height(at.x, at.z), road = p.y - 0.6;
      const foot = Math.max(ground + 0.12, road + SIZE.clear), centre = foot + SIZE.h / 2;
      // facing the road you arrive on (the point 50 m back along it: round a hairpin that's not "back down the road"
      // from here), so it reads from the driver's seat as you come up to it
      const from = curve.getPointAt(Math.max(0, (s - 5) / L));
      const face = new Vector3(from.x - at.x, 0, from.z - at.z).normalize();
      const board = new Group(); board.position.set(at.x, centre, at.z); board.lookAt(at.x + face.x, centre, at.z + face.z);
      let map: Texture;
      if (b.sponsor?.image) { map = loader.load(b.sponsor.image); map.colorSpace = SRGBColorSpace; map.anisotropy = 4; textures.push(map); }
      else map = unsold ??= advertise();
      const mat = new MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.55 });
      faces.push(mat);
      // the artwork on both faces: on the ghat a board is seen from the road above and below it too
      const art = new Mesh(panel, mat); art.position.z = 0.0065; board.add(art);
      const rear = new Mesh(panel, mat); rear.position.z = -0.0065; rear.rotation.y = Math.PI; board.add(rear);
      const rim = new Mesh(frame, back); rim.castShadow = true; board.add(rim);
      // two legs from the ground up to the board
      const legH = centre - ground;
      for (const x of [-SIZE.w * 0.3, SIZE.w * 0.3]) { const l = new Mesh(leg, legMat); l.scale.y = legH; l.position.set(x, -legH / 2, 0); l.castShadow = true; board.add(l); }
      group.add(board);
    }
    if (unsold) textures.push(unsold);
    return { group, faces, textures };
  }, [curve]);
  useEffect(() => () => { for (const t of built.textures) t.dispose(); }, [built]);
  // lit after dusk, like the real ones on the ghat
  useFrame(() => { const k = duskness() * 0.55; for (const m of built.faces) m.emissiveIntensity = k; });
  return <primitive object={built.group} />;
}
