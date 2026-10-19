"use client";
import { useMemo } from "react";
import { BufferAttribute, Mesh, PlaneGeometry } from "three";
import { SECTION, TERRAIN, height, roadDistance, terrainGrid } from "@/lib/terrain";
import { groundMaterial } from "./groundMaterial";

/* Within this distance of the road the fine RoadBand is the visible surface; the coarse mesh drops out of its way. */
const UNDER_BAND = { from: SECTION.reach - 2.5, depth: 1.5 };

/**
 * Ground mesh. With the baked heightmap loaded it covers the heightmap's footprint;
 * `segments = size - 1` puts one vertex on every sample. Otherwise the procedural stand-in.
 * Shaded by the shared physically based ground material (moss on gentle ground, rock on steep faces).
 */
export default function Terrain({ segments = 160 }: { segments?: number }) {
  const mesh = useMemo(() => {
    const grid = terrainGrid();
    const width = grid?.width ?? TERRAIN.width, length = grid?.length ?? TERRAIN.length;
    const x = grid ? grid.west + width / 2 : 0, z = grid ? grid.north + length / 2 : TERRAIN.offsetZ;
    const geo = new PlaneGeometry(width, length, segments, grid ? segments : Math.round((segments * length) / width));
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, dist = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) + x, wz = pos.getZ(i) + z, d = roadDistance(wx, wz);
      pos.setY(i, height(wx, wz) - (d < UNDER_BAND.from ? UNDER_BAND.depth : 0));
      dist[i] = Math.min(d, 99);
    }
    geo.setAttribute("aRoadDist", new BufferAttribute(dist, 1));
    geo.computeVertexNormals();
    const m = new Mesh(geo, groundMaterial());
    m.position.set(x, 0, z);
    m.receiveShadow = true;
    m.name = "terrain";
    return m;
  }, [segments]);
  return <primitive object={mesh} />;
}
