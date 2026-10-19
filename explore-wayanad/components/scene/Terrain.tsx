"use client";
import { useMemo } from "react";
import { BufferAttribute, MathUtils, PlaneGeometry } from "three";
import { TERRAIN, height, terrainGrid } from "@/lib/terrain";

/* Vertex tints, multiplied by the act's ground colour (the Director lerps the material colour per act). */
// Tints work in linear light: the churam's ground 0x1f4a2c is ~(0.014, 0.069, 0.025) linear, so stone grey needs a big red/blue lift.
const ROCK = [6.2, 1.3, 3.1]; // weathered grey stone on steep faces (~0x56544e under the churam palette)
const ROCK_SLOPE = [0.84, 0.68]; // normal.y: fully grass above the first, fully rock below the second

/** Cheap deterministic noise for patchy grass, so the faceted ground reads as layered rather than flat. */
const patch = (x: number, z: number) => 0.75 + 0.6 * (0.5 + 0.5 * Math.sin(x * 0.37 + Math.sin(z * 0.21) * 2.1) * Math.cos(z * 0.29 - x * 0.11));

/**
 * Ground mesh. With the baked heightmap loaded it covers the heightmap's footprint;
 * `segments = size - 1` puts one vertex on every sample. Otherwise the procedural stand-in.
 * Steep faces (the road cuts, the escarpment) shade to rock.
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

    const normal = geo.attributes.normal, colour = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const flat = MathUtils.smoothstep(normal.getY(i), ROCK_SLOPE[1], ROCK_SLOPE[0]), grass = patch(pos.getX(i) + x, pos.getZ(i) + z);
      for (let c = 0; c < 3; c++) colour[i * 3 + c] = MathUtils.lerp(ROCK[c], grass, flat);
    }
    geo.setAttribute("color", new BufferAttribute(colour, 3));
    return { geometry: geo, x, z };
  }, [segments]);
  return (
    <mesh geometry={geometry} position-x={x} position-z={z} name="terrain">
      <meshLambertMaterial color={0x1f4a2c} vertexColors flatShading />
    </mesh>
  );
}
