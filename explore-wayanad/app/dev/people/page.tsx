"use client";
import { Suspense, use, useEffect, useMemo, useState } from "react";
import { notFound } from "next/navigation";
import { Canvas, useFrame } from "@react-three/fiber";
import { DRIVERS, EXTRAS, TOURISTS, personHeight, type PersonId } from "@/data/drivers";
import { loadCast, makeActor, type Move } from "@/lib/people";

/** Development only: the whole cast in a row doing one move (?move=walk|run|idle|sit|drink…, ?view=front|side|back),
 * for checking the shared clips on every rig (heads, hands, feet). Driven by a headless browser for screenshots. */
const IDS: PersonId[] = [...DRIVERS.map((d) => d.id), ...EXTRAS.map((e) => e.id), ...TOURISTS.map((t) => t.id)];

function Person({ id, x, move, t, turn }: { id: PersonId; x: number; move: Move; t: number; turn: number }) {
  const [src, clips] = use(loadCast(id));
  const actor = useMemo(() => { const a = makeActor(id, src, clips, personHeight(id)); a.play(move, 0); a.mixer.setTime(t); a.root.position.x = x; a.root.rotation.y = turn; ((window as unknown as { __actors?: Record<string, unknown> }).__actors ??= {})[id] = a; return a; }, [id, src, clips, move, t, x, turn]);
  useFrame((_, dt) => { if (t < 0) actor.mixer.update(dt); });
  return <primitive object={actor.root} />;
}

export default function DevPeople() {
  if (process.env.NODE_ENV === "production") notFound();
  const [q, setQ] = useState<{ move: Move; view: string; t: number; only: PersonId[] } | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    setQ({ move: (p.get("move") ?? "walk") as Move, view: p.get("view") ?? "front", t: Number(p.get("t") ?? -1), only: (p.get("ids")?.split(",") as PersonId[]) ?? IDS });
  }, []);
  if (!q) return null;
  const n = q.only.length, gap = 0.75, w = (n - 1) * gap;
  const cam = q.view === "side" ? [w / 2 + 9, 1.0, 0] : q.view === "back" ? [w / 2, 1.0, -9] : [w / 2, 1.0, 9];
  return (
    <div style={{ width: "100vw", height: "100vh", background: "#cfd8d3" }}>
      <Canvas camera={{ position: cam as [number, number, number], fov: q.view === "side" ? 22 : 30 }} onCreated={({ camera }) => camera.lookAt(w / 2, 0.85, 0)}>
        <ambientLight intensity={1.2} /><directionalLight position={[3, 6, 5]} intensity={2} />
        <Suspense fallback={null}>{q.only.map((id, i) => <Person key={id} id={id} x={i * gap} move={q.move} t={q.t} turn={q.view === "profile" ? Math.PI / 2 : 0} />)}</Suspense>
        <mesh rotation-x={-Math.PI / 2} position={[w / 2, 0, 0]}><planeGeometry args={[w + 4, 4]} /><meshStandardMaterial color="#8a9a90" /></mesh>
      </Canvas>
      <div id="ready" style={{ position: "fixed", left: 8, top: 8, font: "12px sans-serif" }}>{q.only.join(" · ")}</div>
    </div>
  );
}
