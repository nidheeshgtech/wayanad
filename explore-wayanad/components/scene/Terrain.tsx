"use client";
import { useMemo } from "react";
import { PlaneGeometry } from "three";
import { TERRAIN, height, terrainGrid } from "@/lib/terrain";

/**
 * Ground mesh. With the baked heightmap loaded it covers the heightmap's footprint;
 * `segments = size - 1` puts one vertex on every sample. Otherwise the procedural stand-in.
 */
export default function Terrain({ segments = 160 }: { segments?: number }) {
  const { geometry, x, z } = useMemo(() => {
    const grid = terrainGrid();
    const width = grid?.width ?? TERRAIN.width, length = grid?.length ?? TERRAIN.length;
    const x = grid ? grid.west + width / 2 : 0, z = grid ? grid.north + length / 2 : TERRAIN.offsetZ;
    const geo = new PlaneGeometry(width, length, segments, grid ? segments : Math.round((segments * length) / width));
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, height(pos.getX(i) + x, pos.getZ(i) + z));
    geo.computeVertexNormals();
    return { geometry: geo, x, z };
  }, [segments]);
  return (
    <mesh geometry={geometry} position-x={x} position-z={z} name="terrain">
      <meshLambertMaterial color={0x1f4a2c} flatShading />
    </mesh>
  );
}
