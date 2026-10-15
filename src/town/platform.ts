import type { Rect } from './util';

/**
 * Station platforms (world units). Pure data + functions, no rendering, so that `heightAt` and tests can use them.
 * The platforms are raised PLATFORM.h above the ground. They can be entered by the end ramps (west) and, for the
 * near (south) platform, by a ramp from the plaza. Every other edge is guarded by thin obstacle strips.
 */
export const PLATFORM = {
  h: 6,
  x0: -560,
  x1: 680,
  south: { z0: 628, z1: 780 },
  north: { z0: 828, z1: 980 },
  /** Length of the end ramps (they extend west of x0). */
  rampLen: 80,
  /** Ramp from the plaza onto the south platform. */
  plazaRamp: { x0: 250, x1: 330, z0: 566 },
  trackZ: 804,
} as const;

/** Platform / ramp surface height at (x,z), or undefined when the point is not on a platform or ramp. */
export function platformHeight(x: number, z: number): number | undefined {
  const P = PLATFORM;
  // quick reject: everything lies in this box
  if (x < P.x0 - P.rampLen || x > P.x1 || z < P.plazaRamp.z0 || z > P.north.z1) return undefined;
  for (const pl of [P.south, P.north]) {
    if (z >= pl.z0 && z <= pl.z1) {
      if (x >= P.x0 && x <= P.x1) return P.h;
      if (x >= P.x0 - P.rampLen && x < P.x0) return (P.h * (x - (P.x0 - P.rampLen))) / P.rampLen;
    }
  }
  const r = P.plazaRamp;
  if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z < P.south.z0) return (P.h * (z - r.z0)) / (P.south.z0 - r.z0);
  return undefined;
}

const T = 0.5;
const hline = (x0: number, x1: number, z: number): Rect => ({ minX: x0, maxX: x1, minZ: z - T, maxZ: z + T });
const vline = (x: number, z0: number, z1: number): Rect => ({ minX: x - T, maxX: x + T, minZ: z0, maxZ: z1 });

/** Thin obstacle strips along every platform/ramp edge that has a drop (the player radius makes them solid). */
export function platformObstacles(): Rect[] {
  const P = PLATFORM;
  const xs = P.x0 - P.rampLen;
  const r = P.plazaRamp;
  return [
    // south platform: plaza-side edge, with the gap for the plaza ramp
    hline(P.x0, r.x0, P.south.z0),
    hline(r.x1, P.x1, P.south.z0),
    // ramp sides
    vline(r.x0, r.z0, P.south.z0),
    vline(r.x1, r.z0, P.south.z0),
    // track-side edges, including the west end ramps
    hline(xs, P.x1, P.south.z1),
    hline(xs, P.x1, P.north.z0),
    // far edge of the north platform
    hline(xs, P.x1, P.north.z1),
    // west end ramps: plaza-side edge of the south ramp
    hline(xs, P.x0, P.south.z0),
    // east ends have no access
    vline(P.x1, P.south.z0, P.south.z1),
    vline(P.x1, P.north.z0, P.north.z1),
  ];
}
