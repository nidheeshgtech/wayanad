"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import { COLLECTION } from "@/data/collection";

const ModelView = dynamic(() => import("@/components/collection/ModelView"), { ssr: false });

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
    <div id="thumb" style={{ width: 640, height: 400, background: "transparent" }}><ModelView entry={entry} still={-0.62} /></div>
  </>);
}
