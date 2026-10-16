import { Ray, Vector3, type AbstractMesh, type Scene } from '@babylonjs/core';

/**
 * Looks at the real town geometry (a vertical ray against the town's meshes) so that people can be put on the
 * surface that is actually there - a shop deck, an entrance step, a bench seat - and only where that spot is free.
 * Used once while the crowd is being placed; it never runs per frame.
 */

/** Meshes a probe must not hit: the sky, the sea, clouds, glass panes and everything this module draws itself */
const SKIP = /^(sky|sea|clouds?\d*|farMountains|glass|life|gal_|lifeGallery|petal)/;

const useful = (m: AbstractMesh): boolean => m.isEnabled() && m.isVisible && !SKIP.test(m.name);

export class Prober {
  private readonly ray = new Ray(new Vector3(0, 0, 0), new Vector3(0, -1, 0), 100);

  constructor(private readonly scene: Scene) {}

  /** Height of the highest surface at (x, z) below `y0` (looking down at most `len` units), or undefined */
  surface(x: number, z: number, y0: number, len = 60): number | undefined {
    this.ray.origin.set(x, y0, z);
    this.ray.length = len;
    const hit = this.scene.pickWithRay(this.ray, useful);
    return hit && hit.hit && hit.pickedPoint ? hit.pickedPoint.y : undefined;
  }

  /**
   * Is (x, z) a free, flat place to stand on? Returns the floor height, or undefined when something stands there
   * (a table, a plant, a wall) or the floor is not flat (a step edge). `ground` is the terrain height; floors up to
   * `maxStep` above it (decks, steps) are accepted. `r` is the radius of the body.
   */
  stand(x: number, z: number, ground: number, maxStep = 8, r = 2.4): number | undefined {
    const top = ground + 24;
    const h = this.surface(x, z, top);
    if (h === undefined || h < ground - 0.8 || h > ground + maxStep) return undefined;
    for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]] as const) {
      const o = this.surface(x + dx, z + dz, top);
      if (o === undefined || Math.abs(o - h) > 1.2) return undefined;
    }
    return h;
  }

  /** Height of a seat top at (x, z) if a seat of about `top` height above `ground` is really there (within `tol`) */
  seat(x: number, z: number, ground: number, top: number, tol = 0.7): number | undefined {
    const h = this.surface(x, z, ground + top + 6, 20);
    return h !== undefined && Math.abs(h - (ground + top)) <= tol ? h : undefined;
  }
}
