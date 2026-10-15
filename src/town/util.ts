/** Small pure helpers shared by the town builders (no Babylon dependency). */

export type RGB = readonly [number, number, number];
export type V3 = readonly [number, number, number];

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep01 = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

/** 0xRRGGBB -> [r,g,b] in 0..1 */
export function hex(c: number): RGB {
  return [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export function shade(a: RGB, f: number): RGB {
  return [clamp(a[0] * f, 0, 1), clamp(a[1] * f, 0, 1), clamp(a[2] * f, 0, 1)];
}

/** Deterministic PRNG (mulberry32). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stateless 2D hash in [0,1). */
export function hash2(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function distPointSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

export function distPointPolyline(px: number, pz: number, pts: readonly { x: number; z: number }[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    best = Math.min(best, distPointSeg(px, pz, a.x, a.z, b.x, b.z));
  }
  return best;
}

export function rectsOverlap(a: Rect, b: Rect, gap = 0): boolean {
  return a.minX < b.maxX + gap && a.maxX > b.minX - gap && a.minZ < b.maxZ + gap && a.maxZ > b.minZ - gap;
}

export const rectW = (r: Rect): number => r.maxX - r.minX;
export const rectD = (r: Rect): number => r.maxZ - r.minZ;
export const rectCx = (r: Rect): number => (r.minX + r.maxX) / 2;
export const rectCz = (r: Rect): number => (r.minZ + r.maxZ) / 2;
export const insetRect = (r: Rect, d: number): Rect => ({
  minX: r.minX + d,
  maxX: r.maxX - d,
  minZ: r.minZ + d,
  maxZ: r.maxZ - d,
});

export function pick<T>(arr: readonly T[], rnd: () => number): T {
  return arr[Math.floor(rnd() * arr.length) % arr.length]!;
}
