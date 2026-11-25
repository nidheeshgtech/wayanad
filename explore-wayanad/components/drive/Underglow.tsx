"use client";
import { useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { AdditiveBlending, CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, type Object3D } from "three";
import { CAR, game } from "@/lib/game";
import { glowColor, shop } from "@/lib/shop";
import { neon, neonAmount } from "@/lib/neon";

/* Underglow from the ₹ shop (lib/shop): a soft pool of neon on the road under your car, brighter at night, and the same
 * light mirrored in the wet road (lib/neon). Hung under the car's root, so it rides with it. */
export default function Underglow() {
  const { scene } = useThree();
  const glow = useMemo(() => {
    const c = document.createElement("canvas"); c.width = 128; c.height = 128;
    const x = c.getContext("2d")!, g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.5, "rgba(255,255,255,.55)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const mat = new MeshBasicMaterial({ map: new CanvasTexture(c), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6 });
    const m = new Mesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat);
    m.name = "underglow"; m.renderOrder = 3; m.frustumCulled = false;
    return { m, mat, car: null as Object3D | null, v: -1 };
  }, []);

  useFrame(() => {
    if (!glow.car?.parent) { glow.car = scene.getObjectByName("player-car") ?? null; if (glow.car) glow.car.add(glow.m); }
    const color = game.foot.on ? null : glowColor();
    neon.under = color;
    glow.m.visible = !!color;
    if (!color) return;
    glow.mat.color.copy(color);
    glow.mat.opacity = 0.55 + 0.45 * neonAmount();
    glow.m.scale.set(CAR.halfW * 2 + 0.16, 1, CAR.halfL * 2 + 0.14);
    glow.m.position.set(0, 0.01, 0);
    void shop.v;
  });
  return null;
}
