import { plazaW, roadClearance, type RoadW } from './site';
import { heightAt } from './terrain';

/**
 * Road geometry for the street surface, free of any rendering: a road centre line parametrised by arc length with
 * exact (mitred) lateral offsets, interval arithmetic along it, the junction layout (which road runs into which, and
 * where) and the arms of traffic that approach each junction. Kept apart from streetscape.ts so that tests can use it.
 */

// ---- road paths ----------------------------------------------------------------------------------------------------
export interface PSeg {
  ax: number;
  az: number;
  dx: number;
  dz: number;
  nx: number;
  nz: number;
  s0: number;
  s1: number;
}

/** A road centre line parametrised by arc length, with exact (mitred) lateral offsets. */
export class RoadPath {
  readonly segs: PSeg[] = [];
  readonly total: number;
  readonly hw: number;

  constructor(readonly road: RoadW) {
    let s = 0;
    const p = road.pts;
    for (let i = 0; i + 1 < p.length; i++) {
      const a = p[i]!;
      const b = p[i + 1]!;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      if (len < 1e-6) continue;
      const dx = (b.x - a.x) / len;
      const dz = (b.z - a.z) / len;
      this.segs.push({ ax: a.x, az: a.z, dx, dz, nx: -dz, nz: dx, s0: s, s1: s + len });
      s += len;
    }
    this.total = s;
    this.hw = road.width / 2;
  }

  private index(s: number): number {
    for (let i = 0; i < this.segs.length; i++) if (s <= this.segs[i]!.s1 + 1e-7) return i;
    return this.segs.length - 1;
  }

  /** The straight piece containing arc length s. */
  segAt(s: number): PSeg {
    return this.segs[this.index(s)]!;
  }

  /** World x,z at arc length s and lateral offset o. At the polyline joints the offset is mitred. */
  at(s: number, o: number): [number, number] {
    const i = this.index(s);
    const g = this.segs[i]!;
    const sc = Math.min(Math.max(s, g.s0), g.s1);
    const t = sc - g.s0;
    let other: PSeg | undefined;
    if (t < 1e-6 && i > 0) other = this.segs[i - 1];
    else if (g.s1 - sc < 1e-6 && i + 1 < this.segs.length) other = this.segs[i + 1];
    let nx = g.nx;
    let nz = g.nz;
    if (other) {
      const k = 1 + g.nx * other.nx + g.nz * other.nz;
      nx = (g.nx + other.nx) / k;
      nz = (g.nz + other.nz) / k;
    }
    return [g.ax + g.dx * t + nx * o, g.az + g.dz * t + nz * o];
  }
}

export type Iv = [number, number];

// ---- intervals along a road ----------------------------------------------------------------------------------------
export function ivMerge(list: readonly Iv[]): Iv[] {
  const sorted = list.map((v) => [v[0], v[1]] as Iv).sort((p, q) => p[0] - q[0]);
  const out: Iv[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else out.push(iv);
  }
  return out;
}

export function ivMinus(runs: readonly Iv[], cuts: readonly Iv[], minLen: number): Iv[] {
  const cs = ivMerge(cuts);
  const out: Iv[] = [];
  for (const [a, b] of runs) {
    let s = a;
    for (const [ca, cb] of cs) {
      if (cb <= s) continue;
      if (ca >= b) break;
      if (ca > s) out.push([s, ca]);
      s = Math.max(s, cb);
    }
    if (s < b) out.push([s, b]);
  }
  return out.filter(([a, b]) => b - a >= minLen);
}

export const inPlaza = (x: number, z: number, k: number): boolean => {
  const ex = (x - plazaW.x) / (plazaW.rx * k);
  const ez = (z - plazaW.z) / (plazaW.rz * k);
  return ex * ex + ez * ez < 1;
};

/** The foot of the mountain: the ground mesh is too coarse there for thin overlays, so they stop (the flat ribbons go on). */
export const steep = (x: number, z: number): boolean => heightAt(x, z) > 3;

/**
 * The runs of arc length along the line at lateral offset `o` where `blocked` is false. Boundaries are refined by
 * bisection, so cuts at junctions are exact rather than snapped to the scan step.
 */
export function freeRuns(path: RoadPath, o: number, blocked: (x: number, z: number) => boolean, minLen = 3): Iv[] {
  const isBlocked = (s: number): boolean => {
    const [x, z] = path.at(s, o);
    return blocked(x, z);
  };
  const out: Iv[] = [];
  let prevS = 0;
  let prevB = isBlocked(0);
  let start: number | null = prevB ? null : 0;
  for (let s = 3; ; s += 3) {
    const sc = Math.min(s, path.total);
    const b = isBlocked(sc);
    if (b !== prevB) {
      let lo = prevS;
      let hi = sc;
      for (let k = 0; k < 18; k++) {
        const m = (lo + hi) / 2;
        if (isBlocked(m) === prevB) lo = m;
        else hi = m;
      }
      const edge = (lo + hi) / 2;
      if (b) {
        if (start !== null) out.push([start, edge]);
        start = null;
      } else {
        start = edge;
      }
    }
    prevS = sc;
    prevB = b;
    if (sc >= path.total) break;
  }
  if (start !== null && !prevB) out.push([start, path.total]);
  return out.filter(([a, b]) => b - a >= minLen);
}

/** Is the ground between s0 and s1 (along the line at offset o) a straight ramp, so one quad can follow it? */
export function straightGround(path: RoadPath, s0: number, s1: number, o: number): boolean {
  const [x0, z0] = path.at(s0, o);
  const [x1, z1] = path.at(s1, o);
  const h0 = heightAt(x0, z0);
  const h1 = heightAt(x1, z1);
  for (const t of [0.25, 0.5, 0.75]) {
    const [x, z] = path.at(s0 + (s1 - s0) * t, o);
    if (Math.abs(heightAt(x, z) - (h0 + (h1 - h0) * t)) > 0.15) return false;
  }
  return true;
}

/** Break points for a strip from sa to sb: every polyline joint, and short pieces only where the ground bends. */
export function breaks(path: RoadPath, sa: number, sb: number, o: number, maxLen = 240): number[] {
  const out = [sa];
  const stops = path.segs
    .slice(1)
    .map((g) => g.s0)
    .filter((v) => v > sa + 1e-3 && v < sb - 1e-3);
  stops.push(sb);
  let cur = sa;
  for (const stop of stops) {
    while (cur < stop - 1e-3) {
      let len = Math.min(maxLen, stop - cur);
      while (len > 24 && !straightGround(path, cur, cur + len, o)) len /= 2;
      cur = stop - (cur + len) < 1e-3 ? stop : cur + len;
      out.push(cur);
    }
  }
  return out;
}

// ---- junctions ---------------------------------------------------------------------------------------------------------
export interface Jn {
  a: number;
  b: number;
  /** the road this one runs into, or null for the plaza */
  other: RoadPath | null;
  mutual: boolean;
}

/** One road leading into a junction (or the plaza): where it meets, which way approaching traffic travels. */
export interface Arm {
  path: RoadPath;
  sj: number;
  toward: 1 | -1;
  len: number;
  stop: boolean;
}

export function findArms(paths: readonly RoadPath[]): Arm[] {
  const byRoad = new Map<RoadPath, Jn[]>();
  for (const p of paths) {
    const runs = freeRuns(p, 0, (x, z) => roadClearance(x, z, p.road.id).d >= 0, 1);
    byRoad.set(
      p,
      runs.map(([a, b]) => {
        const [mx, mz] = p.at((a + b) / 2, 0);
        const rid = roadClearance(mx, mz, p.road.id).road?.id;
        return { a, b, other: paths.find((q) => q.road.id === rid) ?? null, mutual: false };
      }),
    );
  }
  const touchesEnd = (p: RoadPath, j: Jn): boolean => j.a < 1 || j.b > p.total - 1;
  for (const [p, list] of byRoad) {
    for (const j of list) {
      if (!j.other || !touchesEnd(p, j)) continue;
      const [mx, mz] = p.at((j.a + j.b) / 2, 0);
      for (const j2 of byRoad.get(j.other) ?? []) {
        if (j2.other !== p || !touchesEnd(j.other, j2)) continue;
        const [qx, qz] = j.other.at((j2.a + j2.b) / 2, 0);
        if (Math.hypot(mx - qx, mz - qz) < 300) j.mutual = true;
      }
    }
  }
  // roads that run into the plaza
  for (const p of paths) {
    const list = byRoad.get(p)!;
    for (const [a, b] of freeRuns(p, 0, (x, z) => !inPlaza(x, z, 1), 1)) {
      if (list.some((j) => j.a < b + 80 && j.b > a - 80)) continue;
      list.push({ a, b, other: null, mutual: false });
    }
    list.sort((u, v) => u.a - v.a);
  }
  const arms: Arm[] = [];
  for (const [p, list] of byRoad) {
    list.forEach((j, k) => {
      const prevEnd = k > 0 ? list[k - 1]!.b : 0;
      const nextStart = k + 1 < list.length ? list[k + 1]!.a : p.total;
      // a road that is narrower than the one it meets, or ends in it, has to stop
      const w = j.other ? j.other.road.width : 0;
      const stop = !!j.other && !j.mutual && (p.road.width < w - 0.5 || (Math.abs(p.road.width - w) <= 0.5 && touchesEnd(p, j)));
      if (j.a - prevEnd > 1) arms.push({ path: p, sj: j.a, toward: 1, len: j.a - prevEnd, stop });
      if (nextStart - j.b > 1) arms.push({ path: p, sj: j.b, toward: -1, len: nextStart - j.b, stop });
    });
  }
  return arms;
}

