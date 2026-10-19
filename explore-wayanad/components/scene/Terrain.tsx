"use client";
import { useMemo } from "react";
import { BufferAttribute, Mesh, PlaneGeometry } from "three";
import { SECTION, TERRAIN, height, roadDistance, terrainGrids } from "@/lib/terrain";
import { groundMaterial } from "./groundMaterial";

/* Within this distance of the road the fine RoadBand is the visible surface; the coarse mesh drops out of its way. */
const UNDER_BAND = { from: SECTION.reach - 2.5, depth: 1.5 };
const SEAM = { overlap: 0.3, drop: 0.08 }; // units

/**
 * Ground mesh for one heightmap tile (`tile`: 0 = churam, 1 = plateau); without one, the procedural stand-in.
 * It covers the tile's footprint;
 * `segments = size - 1` puts one vertex on every sample. Otherwise the procedural stand-in.
 * Shaded by the shared physically based ground material (moss on gentle ground, rock on steep faces).
 */
export default function Terrain({ segments = 160, tile }: { segments?: number; tile?: number }) {
  const mesh = useMemo(() => {
    const grid = tile === undefined ? null : terrainGrids()[tile] ?? null;
    const width = grid?.width ?? TERRAIN.width, length = grid?.length ?? TERRAIN.length;
    const x = grid ? grid.west + width / 2 : 0, z = grid ? grid.north + length / 2 : TERRAIN.offsetZ;
    const geo = new PlaneGeometry(width, length, segments, grid ? segments : Math.round((segments * length) / width));
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, dist = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      // a later tile's south edge tucks under the tile before it (they meet at a parallel), hiding hairline cracks
      const seam = grid && grid.index > 0 && pos.getZ(i) > length / 2 - 1e-6;
      if (seam) pos.setZ(i, pos.getZ(i) + SEAM.overlap);
      const wx = pos.getX(i) + x, wz = pos.getZ(i) + z, d = roadDistance(wx, wz);
      pos.setY(i, height(wx, wz) - (d < UNDER_BAND.from ? UNDER_BAND.depth : 0) - (seam ? SEAM.drop : 0));
      dist[i] = Math.min(d, 99);
    }
    geo.setAttribute("aRoadDist", new BufferAttribute(dist, 1));
    geo.computeVertexNormals();
    const m = new Mesh(geo, groundMaterial());
    m.position.set(x, 0, z);
    m.receiveShadow = true;
    m.name = "terrain";
    return m;
  }, [segments, tile]);
  return <primitive object={mesh} />;
}
