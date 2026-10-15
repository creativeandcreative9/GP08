import { COAST, MOUNTAIN_FOOT, SUMMIT, mapToWorld } from './layout';
import { platformHeight } from './platform';
import { lerp, smoothstep01 } from './util';

/** Width (world units) of the sand strip south of the coast line. */
export const BEACH_WIDTH = 40;
/** Sea surface height. */
export const SEA_Y = -2.2;
const BEACH_LOW = -2.5;
const SEA_DEPTH = -14;
const PLATEAU_R = 110;

// --- coast ------------------------------------------------------------------------------------
const coastPts = (() => {
  const p = COAST.map(([x, y]) => mapToWorld(x, y));
  const first = p[0]!;
  const last = p[p.length - 1]!;
  const prev = p[p.length - 2]!;
  const slope = (last.z - prev.z) / (last.x - prev.x);
  return [
    { x: -80000, z: first.z },
    ...p,
    { x: last.x + 3980, z: last.z + slope * 3980 },
    { x: 80000, z: last.z + slope * 3980 },
  ];
})();

/** Coast line z for a given x (the sea is north of it). */
export function coastZ(x: number): number {
  const p = coastPts;
  if (x <= p[0]!.x) return p[0]!.z;
  for (let i = 0; i + 1 < p.length; i++) {
    const a = p[i]!;
    const b = p[i + 1]!;
    if (x <= b.x) return lerp(a.z, b.z, (x - a.x) / (b.x - a.x));
  }
  return p[p.length - 1]!.z;
}
/** Vertical offset north of the coast line (negative = land side). */
export const coastS = (x: number, z: number): number => z - coastZ(x);
export const coastVertexXs: number[] = coastPts.map((p) => p.x).filter((x) => Math.abs(x) < 20000);

function beachHeight(s: number): number {
  if (s <= -BEACH_WIDTH) return 0;
  if (s <= 0) return lerp(0, BEACH_LOW, (s + BEACH_WIDTH) / BEACH_WIDTH);
  if (s >= 8000) return -3000;
  if (s >= 1500) return lerp(-200, -3000, (s - 1500) / 6500);
  if (s >= 150) return lerp(SEA_DEPTH, -200, (s - 150) / 1350);
  return lerp(BEACH_LOW, SEA_DEPTH, s / 150);
}

// --- mountain ---------------------------------------------------------------------------------
const FOOT = [
  { x: -700, y: 560 },
  ...MOUNTAIN_FOOT.map(([x, y]) => ({ x, y })).slice(0, -1),
  { x: MOUNTAIN_FOOT[MOUNTAIN_FOOT.length - 2]![0], y: 1700 },
  { x: -700, y: 1700 },
].map((p) => mapToWorld(p.x, p.y));
export const SUMMIT_XZ = mapToWorld(SUMMIT.x, SUMMIT.y);

function footRadius(dx: number, dz: number): number {
  // distance from the summit to the foot outline along direction (dx,dz)
  const sx = SUMMIT_XZ.x;
  const sz = SUMMIT_XZ.z;
  let best = Infinity;
  for (let i = 0; i < FOOT.length; i++) {
    const a = FOOT[i]!;
    const b = FOOT[(i + 1) % FOOT.length]!;
    const ex = b.x - a.x;
    const ez = b.z - a.z;
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((a.x - sx) * ez - (a.z - sz) * ex) / den;
    const u = ((a.x - sx) * dz - (a.z - sz) * dx) / den;
    if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best;
}

/** 0 at the foot outline, 1 on the summit plateau. */
export function mountainT(x: number, z: number): number {
  const dx = x - SUMMIT_XZ.x;
  const dz = z - SUMMIT_XZ.z;
  const r = Math.hypot(dx, dz);
  if (r <= PLATEAU_R) return 1;
  // quick reject: the whole mountain lies south-west of the town
  if (x > 0 || z > 0) return 0;
  const R = footRadius(dx / r, dz / r);
  if (!(R < Infinity) || r >= R) return 0;
  return 1 - (r - PLATEAU_R) / (R - PLATEAU_R);
}

export function mountainHeight(x: number, z: number): number {
  const t = mountainT(x, z);
  if (t <= 0) return 0;
  const g = smoothstep01(t);
  const n =
    Math.sin(x * 0.0021 + 1.3) * Math.sin(z * 0.0017 + 0.4) * 0.6 +
    Math.sin((x + z) * 0.0043 + 2.0) * 0.4 +
    Math.sin(x * 0.0089) * Math.sin(z * 0.0071) * 0.25;
  // ridges and gullies: zero at the foot and on the summit plateau
  const env = smoothstep01(t / 0.25) * (1 - smoothstep01((t - 0.6) / 0.3));
  return SUMMIT.height * g + 60 * n * env;
}

/** Natural terrain height at (x,z): flat town (0), beach and sea floor, mountain (no platforms). */
export function groundHeightAt(x: number, z: number): number {
  return beachHeight(coastS(x, z)) + mountainHeight(x, z);
}

/** Ground height including the raised station platforms and their ramps (what the player stands on). */
export function heightAt(x: number, z: number): number {
  const p = platformHeight(x, z);
  return p !== undefined ? p : groundHeightAt(x, z);
}

