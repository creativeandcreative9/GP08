import type { Spot } from './ctx';
import { roadClearance, roadsW } from './site';

/**
 * Eye-level comparison cameras (`?view=ref1` ... `ref5`, see docs/20261016_visual_eval.md).
 * One definition, used by the scene (to place the camera) and by the builders (to keep tall props out of the frame).
 * `dy` is how far the looked-at point lies above (+) or below (-) the eye.
 */
export interface EvalPose {
  x: number;
  z: number;
  tx: number;
  tz: number;
  dy: number;
}

export type EvalId = 'ref1' | 'ref2' | 'ref3' | 'ref4' | 'ref5';

/** Standing eye height (≈1.5 m) above the ground. */
export const EYE = 19;

/** The sidewalk in front of a shop, looking along its frontage with the shop on the left. */
function shopfront(s: Spot): EvalPose {
  const rx = s.fz; // local right (facing out of the front)
  const rz = -s.fx;
  const d = roadClearance(s.x + s.fx * s.hv, s.z + s.fz * s.hv).d; // front of the shop to the road edge
  const v = s.hv + Math.min(Math.max(d * 0.5, 12), 24); // stay on the shop side of the street trees
  return {
    x: s.x + s.fx * v + rx * s.hu * 0.8,
    z: s.z + s.fz * v + rz * s.hu * 0.8,
    tx: s.x + s.fx * (s.hv + 4) - rx * s.hu * 1.5,
    tz: s.z + s.fz * (s.hv + 4) - rz * s.hu * 1.5,
    dy: -1.5,
  };
}

/** Convenience store at the corner, looking at the plaza cherries and the station. */
function conbini(s: Spot): EvalPose {
  const rx = s.fz;
  const rz = -s.fx;
  // stand at the end of the frontage farther from the station
  const far = Math.hypot(s.x + rx * s.hu, s.z + rz * s.hu - 600) > Math.hypot(s.x - rx * s.hu, s.z - rz * s.hu - 600) ? 1 : -1;
  const v = s.hv + 26;
  return { x: s.x + s.fx * v + rx * s.hu * 0.95 * far, z: s.z + s.fz * v + rz * s.hu * 0.95 * far, tx: 30, tz: 600, dy: 4 };
}

/** Cafe terrace: beyond the west end of the cafe, looking along its front towards the plaza's cherry trees. */
function cafe(s: Spot): EvalPose {
  const rx = s.fz;
  const rz = -s.fx;
  const at = (u: number, v: number): [number, number] => [s.x + rx * u + s.fx * v, s.z + rz * u + s.fz * v];
  const [x, z] = at(s.hu * 1.67, s.hv + 62);
  const [tx, tz] = at(-s.hu * 0.6, s.hv + 6);
  return { x, z, tx, tz, dy: -2 };
}

/** Cherry avenue: the sidewalk of the street from the plaza to the mountain, looking towards the mountain. */
function avenue(): EvalPose | undefined {
  const r = roadsW.find((w) => w.id === 'mountain-street');
  if (!r) return undefined;
  const p0 = r.pts[0]!;
  const p1 = r.pts[r.pts.length - 1]!;
  const l = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  const dx = (p1.x - p0.x) / l;
  const dz = (p1.z - p0.z) / l;
  const off = r.width / 2 + 8;
  const x = p0.x + dx * 420 - dz * off;
  const z = p0.z + dz * 420 + dx * off;
  return { x, z, tx: x + dx * 120 + dz * 12, tz: z + dz * 120 - dx * 12, dy: 3 };
}

/** Inside the station concourse, looking along the line of ticket gates towards the staffed booth. */
const CONCOURSE: EvalPose = { x: -100, z: 634, tx: 36, tz: 677, dy: 4 };

/** The comparison cameras that can be placed (a shop that was not built has no camera). */
export function evalPoses(spots: Readonly<Record<string, Spot>>): Partial<Record<EvalId, EvalPose>> {
  const poses: Partial<Record<EvalId, EvalPose>> = { ref3: CONCOURSE };
  if (spots['e-wagashi']) poses.ref1 = shopfront(spots['e-wagashi']);
  if (spots['w-conbini']) poses.ref2 = conbini(spots['w-conbini']);
  const ave = avenue();
  if (ave) poses.ref4 = ave;
  if (spots['w-cafe']) poses.ref5 = cafe(spots['w-cafe']);
  return poses;
}
