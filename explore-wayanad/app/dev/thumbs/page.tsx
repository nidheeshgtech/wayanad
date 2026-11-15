"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import { COLLECTION } from "@/data/collection";

const LotShot = dynamic(() => import("@/components/collection/LotShot"), { ssr: false });

/** Development only: one collection vehicle (?id=) on a transparent canvas, for rendering the card pictures
 * (public/cars/*.webp; scripts render them with a headless browser). */
export default function DevThumbs() {
  if (process.env.NODE_ENV === "production") notFound();
  const [id, setId] = useState<string | null>(null);
  useEffect(() => setId(new URLSearchParams(location.search).get("id") ?? COLLECTION[0].id), []);
  const entry = COLLECTION.find((e) => e.id === id);
  if (!entry) return null;
  return (<>
    <style>{"html,body{background:transparent!important}"}</style>
    <div id="thumb" style={{ width: 800, height: 500 }}><LotShot entry={entry} /></div>
  </>);
}
