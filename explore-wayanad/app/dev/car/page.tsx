"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import { CARS, type CarId } from "@/data/cars";

const CarPreview = dynamic(() => import("@/components/garage/CarPreview"), { ssr: false });

/** Development only: every player car head-on, front and back (?car=id), to check badges and plates. */
export default function DevCar() {
  if (process.env.NODE_ENV === "production") notFound();
  const [car, setCar] = useState<CarId | null>(null);
  useEffect(() => setCar((new URLSearchParams(location.search).get("car") as CarId) ?? "lakkidi"), []);
  if (!car) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "100vh", background: "#0e1f1a" }}>
      {[0, Math.PI].map((a) => <div key={a}><CarPreview choice={{ car, colour: "white" }} still={a} raw /></div>)}
      <p style={{ position: "fixed", left: 12, top: 8, color: "#eef2ee" }}>{CARS.find((c) => c.id === car)?.name}</p>
    </div>
  );
}
