import type { Object3D } from "three";

/**
 * Stop three.js recomputing the matrices of things that never move. By default every object's matrix is rebuilt
 * from its position, rotation and scale every frame, and multiplied into its parent's — for 10,000+ objects that was a
 * fifth of a phone's frame. `freeze` bakes the local matrices once (the object can still move as a whole if its
 * parent does). `whole`: the subtree doesn't move at all, so the per-frame walk skips it entirely.
 */
export function freeze(root: Object3D, whole = false) {
  root.updateMatrixWorld(true);
  root.traverse((o) => { o.matrixAutoUpdate = false; });
  if (whole) root.matrixWorldAutoUpdate = false;
}
