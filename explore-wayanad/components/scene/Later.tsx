"use client";
import { useEffect, useState, type ReactNode } from "react";
import { later } from "@/lib/later";

/** Mounts its children once the start screen is up (lib/later), for scene parts that take seconds to build on a phone
 * and aren't needed in the first moments of the drive (the waterfalls, the roadside streams): after the forest. */
export default function Later({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(false);
  useEffect(() => { let alive = true; later(() => { if (alive) setOn(true); }, { after: true }); return () => { alive = false; }; }, []);
  return on ? <>{children}</> : null;
}
