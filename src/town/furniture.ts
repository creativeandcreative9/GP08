import type { Ctx } from './ctx';
import { DEC1_Y } from './ctx';
import { evalPoses } from './evalcams';
import {
  BIKE_COLS, VEND_D, VEND_W, bench, bicycle, bollard, curveMirror, footprints, guardPipe, planter, postBox,
  pottedPlant, roadSign, streetLamp, utilityBox, vendingMachine, wasteBin,
} from './fixtures';
import { samplePolyline } from './network';
import { avenueTrees, poleList } from './props';
import { Fx } from './shapes';
import { insideAny, plazaW, railDistance, roadClearance, roadsW, stationRect, type RoadW } from './site';
import { BEACH_WIDTH, coastS, heightAt, mountainHeight } from './terrain';
import { hex, makeRng, type Rect } from './util';
import { SURF } from '../surface';
import { addCherry } from './trees';

/**
 * Street furniture (ストリートファニチャー): everything people stand next to on the pavement. Placement works on the
 * road geometry (sidewalks run from the road edge to 13 units outside it), so it keeps working when the buildings
 * change: the free strip behind the sidewalk (13.5-20 units from the road edge) carries vending machines,
 * bicycles, bins and plants; signs, bollards and guard pipes stand along the kerb; poles are avoided.
 */

type Sample = ReturnType<typeof samplePolyline>[number];

export interface RoadInfo {
  road: RoadW;
  smp: Sample[];
  total: number;
}

export interface Placed {
  kind: string;
  x: number;
  z: number;
}

export interface FurnitureStats {
  counts: Record<string, number>;
  /** Vertices spent per kind (main + sign batches). */
  verts: Record<string, number>;
  items: Placed[];
}

/** Where the sidewalk ends and the free strip behind it begins (distance from the road edge). */
const STRIP0 = 13.3;
const STRIP_MAX = 20.5;
/** Overall density of the clutter on the strip (1 = as many as fit). */
const CLUTTER = 0.55;

const PAD = hex(0xc4c2ba);

// ---- small geometry helpers ----------------------------------------------------------------------------------------

function at(ri: RoadInfo, s: number): Sample {
  const smp = ri.smp;
  let lo = 0;
  let hi = smp.length - 1;
  const ss = Math.max(0, Math.min(ri.total, s));
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (smp[m]!.s <= ss) lo = m;
    else hi = m;
  }
  const a = smp[lo]!;
  const b = smp[hi]!;
  const t = b.s > a.s ? (ss - a.s) / (b.s - a.s) : 0;
  const nx = a.nx + (b.nx - a.nx) * t;
  const nz = a.nz + (b.nz - a.nz) * t;
  const l = Math.hypot(nx, nz) || 1;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, nx: nx / l, nz: nz / l, s: ss };
}

interface Edge {
  x: number;
  z: number;
  /** Unit vector pointing away from the road, towards this side's buildings. */
  ox: number;
  oz: number;
  /** Unit vector along the road (increasing s). */
  tx: number;
  tz: number;
}

/** The point `k` units beyond the road edge on one side of the road at arclength s. */
function edge(ri: RoadInfo, s: number, side: 1 | -1, k: number): Edge {
  const q = at(ri, s);
  const ox = q.nx * side;
  const oz = q.nz * side;
  const d = ri.road.width / 2 + k;
  return { x: q.x + ox * d, z: q.z + oz * d, ox, oz, tx: q.nz, tz: -q.nx };
}

const inPlaza = (x: number, z: number, m: number): boolean => {
  const ex = (x - plazaW.x) / (plazaW.rx + m);
  const ez = (z - plazaW.z) / (plazaW.rz + m);
  return ex * ex + ez * ez < 1;
};

/** Land that may carry furniture (not beach, railway, station, steep hill). */
function groundOk(x: number, z: number): boolean {
  if (coastS(x, z) > -(BEACH_WIDTH + 8)) return false;
  if (railDistance(x, z) < 46) return false;
  if (x > stationRect.minX - 24 && x < stationRect.maxX + 24 && z > stationRect.minZ - 24 && z < stationRect.maxZ + 24) return false;
  return mountainHeight(x, z) <= 5;
}

/** Spatial hash of circles already used by furniture, poles and trees. */
class Taken {
  private cells = new Map<number, number[]>();
  private readonly size = 48;
  private key(i: number, j: number): number {
    return i * 100003 + j;
  }
  add(x: number, z: number, r: number): void {
    const k = this.key(Math.floor(x / this.size), Math.floor(z / this.size));
    const a = this.cells.get(k);
    if (a) a.push(x, z, r);
    else this.cells.set(k, [x, z, r]);
  }
  hit(x: number, z: number, r: number): boolean {
    const ci = Math.floor(x / this.size);
    const cj = Math.floor(z / this.size);
    for (let i = ci - 1; i <= ci + 1; i++) {
      for (let j = cj - 1; j <= cj + 1; j++) {
        const a = this.cells.get(this.key(i, j));
        if (!a) continue;
        for (let n = 0; n < a.length; n += 3) {
          if (Math.hypot(a[n]! - x, a[n + 1]! - z) < a[n + 2]! + r) return true;
        }
      }
    }
    return false;
  }
}

/** Eye position and the point looked at of one of the comparison cameras. */
interface View {
  x: number;
  z: number;
  tx: number;
  tz: number;
}

/**
 * The comparison cameras (`?view=ref1`..`ref5` in scene.ts). Whatever stands right in front of the lens, or tall and
 * thin in the middle of the frame, only hides the picture: the furniture keeps clear of the eyes and of a narrow
 * corridor along each line of sight (see `Builder.roomFor`).
 */
function evalViews(c: Ctx): View[] {
  return Object.values(evalPoses(c.spots)).map((p) => ({ x: p.x, z: p.z, tx: p.tx, tz: p.tz }));
}

/** Frame at ground height with its front along (fx, fz). */
function frame(x: number, z: number, fx: number, fz: number): Fx {
  return new Fx(x, heightAt(x, z), z, fx, fz);
}

interface RoomOpts {
  /** The road the piece stands beside (its own clearance is not tested). */
  road?: string;
  /** Required distance from the edge of any other road. */
  roadMargin?: number;
  /** Required distance from buildings (default radius + 1). */
  wall?: number;
  /** A tall, thin piece (lamp, sign, post box): keeps out of the corridors along the comparison cameras' sight lines. */
  tall?: boolean;
  /** Required distance from the edge of ANY road, the piece's own included (keeps pieces off the sidewalk). */
  ownMargin?: number;
}

// ---- the builder ---------------------------------------------------------------------------------------------------

class Builder {
  readonly counts: Record<string, number> = {};
  readonly verts: Record<string, number> = {};
  readonly items: Placed[] = [];
  readonly taken = new Taken();
  readonly infos: RoadInfo[];
  /** Points that make an area lively: the plaza and every named shop. */
  readonly hot: { x: number; z: number }[];
  /** Points along the lines of sight of the comparison cameras that tall pieces keep clear of. */
  private readonly corridor: { x: number; z: number }[] = [];

  constructor(readonly c: Ctx, private readonly corridorPadding = 9, private readonly excluded?: (x: number, z: number, radius: number) => boolean) {
    this.infos = roadsW.map((road) => {
      const smp = samplePolyline(road.pts, 10);
      return { road, smp, total: smp[smp.length - 1]!.s };
    });
    for (const p of poleList) this.taken.add(p.x, p.z, 4.5);
    for (const t of avenueTrees) this.taken.add(t.x, t.z, 6);
    for (const v of evalViews(c)) {
      this.taken.add(v.x, v.z, 17);
      const l = Math.hypot(v.tx - v.x, v.tz - v.z) || 1;
      for (let t = 12; t <= 170; t += 12) this.corridor.push({ x: v.x + ((v.tx - v.x) / l) * t, z: v.z + ((v.tz - v.z) / l) * t });
    }
    this.hot = [{ x: plazaW.x, z: plazaW.z }, ...Object.values(c.spots).map((s) => ({ x: s.x, z: s.z }))];
  }

  rnd(): number {
    return this.c.rnd();
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.rnd();
  }
  chance(p: number): boolean {
    return this.rnd() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.rnd() * arr.length) % arr.length]!;
  }

  /** How lively the street is at (x,z): 1 near shops and the plaza, falling off with distance. */
  density(x: number, z: number): number {
    let d = Infinity;
    for (const h of this.hot) d = Math.min(d, Math.hypot(h.x - x, h.z - z));
    return Math.max(0.12, Math.min(1, 1.2 - d / 1000));
  }

  /** Counts a piece and the vertices its builder spent. */
  record(kind: string, x: number, z: number, build: () => void): void {
    const before = this.c.main.vertexCount + this.c.signs.vertexCount + (this.c.cloth?.batches.vertexCount ?? 0);
    build();
    const after = this.c.main.vertexCount + this.c.signs.vertexCount + (this.c.cloth?.batches.vertexCount ?? 0);
    this.counts[kind] = (this.counts[kind] ?? 0) + 1;
    this.verts[kind] = (this.verts[kind] ?? 0) + (after - before);
    this.items.push({ kind, x, z });
  }

  /** Is there room for a piece of radius r at (x,z)? */
  roomFor(x: number, z: number, r: number, o: RoomOpts = {}): boolean {
    if (!groundOk(x, z)) return false;
    if (this.excluded?.(x, z, r)) return false;
    if (inPlaza(x, z, 10)) return false;
    if (roadClearance(x, z, o.road).d < (o.roadMargin ?? 17)) return false;
    if (o.ownMargin !== undefined && roadClearance(x, z).d < o.ownMargin) return false;
    if (insideAny(x, z, this.c.obstacles, o.wall ?? r + 1)) return false;
    if (this.corridor.some((q) => Math.hypot(q.x - x, q.z - z) < this.corridorPadding + (o.tall ? 5 : 0) + r)) return false; // keep the comparison shots clear
    return !this.taken.hit(x, z, r);
  }

  /** How far from the road edge the nearest wall is along the furniture line (60 = none within reach). */
  wallK(e: (k: number) => Edge): number {
    for (let k = STRIP0; k <= 58; k += 2) {
      const p = e(k);
      if (insideAny(p.x, p.z, this.c.obstacles, 0)) return k;
    }
    return 60;
  }

  solid(rect: Rect): void {
    this.c.obstacles.push(rect);
  }

  /**
   * Collision rectangles for an oriented box: axis-aligned squares along its length, so that a box standing on a
   * diagonal street blocks little more than it fills.
   */
  solidBox(fr: Fx, u0: number, u1: number, v0: number, v1: number): void {
    for (const r of footprints(fr, u0, u1, v0, v1)) this.c.obstacles.push(r);
  }

  /** A concrete pad under a group of machines. */
  pad(fr: Fx, u0: number, u1: number, v0: number, v1: number): void {
    this.c.dec1.quad(fr.p(u0, DEC1_Y, v0), fr.p(u1, DEC1_Y, v0), fr.p(u1, DEC1_Y, v1), fr.p(u0, DEC1_Y, v1), PAD, [0, 1, 0]);
  }
}

// ---- anchored pieces: usable on the strip behind the sidewalk and in front of named shops --------------------------

/** A run of furniture along a street: its centre and the direction it faces (towards the street). */
interface Anchor {
  x: number;
  z: number;
  fx: number;
  fz: number;
  opts: RoomOpts;
}

/** Row of 2-3 vending machines against a wall, with sorted bins at one end. Returns the length used (0 = nothing). */
function vendingRun(B: Builder, a: Anchor, n: number, bins: number): number {
  const fr0 = frame(a.x, a.z, a.fx, a.fz);
  const step = VEND_W + 1.2;
  const L = n * step + bins * 6.4;
  const u0 = -L / 2;
  for (let i = 0; i < n; i++) {
    const p = fr0.p(u0 + (i + 0.5) * step, 0, 0);
    if (!B.roomFor(p[0], p[2], 7, { ...a.opts, tall: true })) return 0; // big and solid: keep out of the comparison shots
  }
  B.pad(fr0, u0 - 1.5, u0 + L + 1.5, -VEND_D / 2 - 1.5, VEND_D / 2 + 2.5);
  const variant0 = Math.floor(B.rnd() * 8);
  for (let i = 0; i < n; i++) {
    const p = fr0.p(u0 + (i + 0.5) * step, 0, 0);
    const fr = frame(p[0], p[2], a.fx, a.fz);
    B.record('vend', p[0], p[2], () => vendingMachine(B.c, fr, variant0 + i * 3 + 1));
    B.solidBox(fr, -VEND_W / 2, VEND_W / 2, -VEND_D / 2, VEND_D / 2);
    B.taken.add(p[0], p[2], 7);
  }
  const kind0 = Math.floor(B.rnd() * 4);
  for (let i = 0; i < bins; i++) {
    const p = fr0.p(u0 + n * step + (i + 0.5) * 6.4 + 0.4, 0, 0.6);
    const fr = frame(p[0], p[2], a.fx, a.fz);
    B.record('bin', p[0], p[2], () => wasteBin(B.c, fr, kind0 + i));
    B.solidBox(fr, -2.7, 2.7, -2.7, 2.7);
    B.taken.add(p[0], p[2], 3.5);
  }
  return L;
}

/** A few sorted-waste bins side by side. Returns the length used. */
function binRun(B: Builder, a: Anchor, n: number): number {
  const fr0 = frame(a.x, a.z, a.fx, a.fz);
  const L = n * 6.4;
  const kind0 = Math.floor(B.rnd() * 4);
  let used = 0;
  for (let i = 0; i < n; i++) {
    const p = fr0.p(-L / 2 + (i + 0.5) * 6.4, 0, 0);
    if (!B.roomFor(p[0], p[2], 3.5, { ...a.opts, wall: Math.min(a.opts.wall ?? 4, 1.5) })) continue;
    const fr = frame(p[0], p[2], a.fx, a.fz);
    B.record('bin', p[0], p[2], () => wasteBin(B.c, fr, kind0 + i));
    B.solidBox(fr, -2.7, 2.7, -2.7, 2.7);
    B.taken.add(p[0], p[2], 3.5);
    used++;
  }
  return used ? L : 0;
}

/** Parked bicycles in a line along the street (all heading the same way). Returns the length used. */
function bikeRun(B: Builder, a: Anchor, n: number): number {
  const fr0 = frame(a.x, a.z, a.fx, a.fz);
  const step = 25;
  const L = n * step;
  const heading = B.chance(0.5) ? 1 : -1;
  let used = 0;
  for (let i = 0; i < n; i++) {
    const p = fr0.p(-L / 2 + (i + 0.5) * step, 0, 0);
    if (!B.roomFor(p[0], p[2], 9, a.opts)) continue;
    const hd = fr0.d(heading, 0, 0);
    const fr = frame(p[0], p[2], hd[0], hd[2]);
    const lite = B.chance(0.35);
    B.record('bike', p[0], p[2], () => bicycle(B.c, fr, B.pick(BIKE_COLS), lite));
    B.taken.add(p[0], p[2], 8);
    used++;
  }
  return used ? L : 0;
}

/** A cluster of potted plants. */
function potRun(B: Builder, a: Anchor, n: number): number {
  const fr0 = frame(a.x, a.z, a.fx, a.fz);
  const step = 7.6;
  const L = n * step;
  let used = 0;
  for (let i = 0; i < n; i++) {
    const p = fr0.p(-L / 2 + (i + 0.5) * step, 0, (B.rnd() - 0.5) * 2);
    if (!B.roomFor(p[0], p[2], 4, { ...a.opts, roadMargin: 15, wall: Math.min(a.opts.wall ?? 5, 4) })) continue;
    B.record('plant', p[0], p[2], () => pottedPlant(B.c, p[0], p[2], heightAt(p[0], p[2]), () => B.rnd()));
    B.taken.add(p[0], p[2], 4);
    used++;
  }
  return used ? L : 0;
}

/** A long planter box. */
function planterRun(B: Builder, a: Anchor): number {
  const fr = frame(a.x, a.z, a.fx, a.fz);
  const len = B.range(16, 28);
  const o = { ...a.opts, roadMargin: 15, wall: Math.min(a.opts.wall ?? 5, 4) };
  if (![fr.p(-len / 2, 0, 0), fr.p(len / 2, 0, 0)].every((p) => B.roomFor(p[0], p[2], 4, o))) return 0;
  B.record('planter', a.x, a.z, () => planter(B.c, fr, len, () => B.rnd()));
  B.taken.add(a.x, a.z, len / 2 + 1);
  return len;
}

/** A bench against the free strip. */
function benchRun(B: Builder, a: Anchor): number {
  const fr = frame(a.x, a.z, a.fx, a.fz);
  const o = { ...a.opts, roadMargin: 15 };
  if (![fr.p(-9, 0, 0), fr.p(9, 0, 0)].every((p) => B.roomFor(p[0], p[2], 4.5, o))) return 0;
  B.record('bench', a.x, a.z, () => bench(B.c, fr));
  B.solidBox(fr, -9.4, 9.4, -2.9, 2.9);
  B.taken.add(a.x, a.z, 10);
  return 20;
}

// ---- junctions: stop signs, mirrors, bollards, guard pipes ---------------------------------------------------------

export interface Arm {
  info: RoadInfo;
  /** Unit vector from the junction along the arm. */
  ax: number;
  az: number;
  /** The road continues on the other side of the junction too. */
  through: boolean;
}

export interface Junction {
  x: number;
  z: number;
  arms: Arm[];
}

function segHit(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number): { x: number; z: number } | null {
  const rx = bx - ax;
  const rz = bz - az;
  const sx = dx - cx;
  const sz = dz - cz;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sz - (cz - az) * sx) / den;
  const u = ((cx - ax) * rz - (cz - az) * rx) / den;
  if (t < -0.01 || t > 1.01 || u < -0.01 || u > 1.01) return null;
  return { x: ax + rx * t, z: az + rz * t };
}

/** Finds the places where roads cross, or where a road ends against another. */
export function findJunctions(infos: RoadInfo[]): Junction[] {
  const pts: { x: number; z: number }[] = [];
  const add = (x: number, z: number): void => {
    if (!pts.some((p) => Math.hypot(p.x - x, p.z - z) < 120)) pts.push({ x, z });
  };
  for (let i = 0; i < infos.length; i++) {
    for (let j = i + 1; j < infos.length; j++) {
      const A = infos[i]!.road.pts;
      const Bp = infos[j]!.road.pts;
      for (let a = 0; a + 1 < A.length; a++) {
        for (let b = 0; b + 1 < Bp.length; b++) {
          const h = segHit(A[a]!.x, A[a]!.z, A[a + 1]!.x, A[a + 1]!.z, Bp[b]!.x, Bp[b]!.z, Bp[b + 1]!.x, Bp[b + 1]!.z);
          if (h) add(h.x, h.z);
        }
      }
    }
  }
  // a road ending close to another road (an L or T junction that does not quite touch)
  for (const A of infos) {
    for (const e of [A.road.pts[0]!, A.road.pts[A.road.pts.length - 1]!]) {
      for (const Bi of infos) {
        if (Bi === A) continue;
        let best = Infinity;
        let bx = 0;
        let bz = 0;
        for (let k = 0; k + 1 < Bi.road.pts.length; k++) {
          const p0 = Bi.road.pts[k]!;
          const p1 = Bi.road.pts[k + 1]!;
          const dx = p1.x - p0.x;
          const dz = p1.z - p0.z;
          const t = Math.max(0, Math.min(1, ((e.x - p0.x) * dx + (e.z - p0.z) * dz) / (dx * dx + dz * dz)));
          const px = p0.x + dx * t;
          const pz = p0.z + dz * t;
          const d = Math.hypot(e.x - px, e.z - pz);
          if (d < best) {
            best = d;
            bx = px;
            bz = pz;
          }
        }
        if (best < Bi.road.width / 2 + 12) add(bx, bz);
      }
    }
  }
  const out: Junction[] = [];
  for (const p of pts) {
    const arms: Arm[] = [];
    for (const info of infos) {
      let best = Infinity;
      let bi = 0;
      info.smp.forEach((q, i) => {
        const d = Math.hypot(q.x - p.x, q.z - p.z);
        if (d < best) {
          best = d;
          bi = i;
        }
      });
      if (best > info.road.width / 2 + 14) continue;
      const q = info.smp[bi]!;
      const tx = q.nz;
      const tz = -q.nx;
      const fwd = q.s + 40 < info.total;
      const back = q.s - 40 > 0;
      if (fwd) arms.push({ info, ax: tx, az: tz, through: back });
      if (back) arms.push({ info, ax: -tx, az: -tz, through: fwd });
    }
    if (arms.length >= 2) out.push({ x: p.x, z: p.z, arms });
  }
  return out;
}

/** The street name board (tile of the names cell) for a main road. */
const NAME_OF: Record<string, number> = { 'main-street': 1, 'east-road': 1, 'coast-road': 1 };

function junctionFurniture(B: Builder): void {
  for (const J of findJunctions(B.infos)) {
    // the main road of the junction: the widest one, through roads first
    const prio = (a: Arm): number => a.info.road.width + (a.through ? 0.5 : 0);
    const best = Math.max(...J.arms.map(prio));
    const M = J.arms.find((a) => prio(a) === best)!.info;
    const wM = M.road.width;
    // M's frame at the junction
    let bi = 0;
    let bd = Infinity;
    M.smp.forEach((q, i) => {
      const d = Math.hypot(q.x - J.x, q.z - J.z);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    const mq = M.smp[bi]!;
    const mtx = mq.nz;
    const mtz = -mq.nx;
    const mnx = mq.nx;
    const mnz = mq.nz;
    const stems = J.arms.filter((a) => a.info !== M && prio(a) < best);
    for (const a of stems) {
      const wS = a.info.road.width;
      const rid = a.info.road.id;
      const hw = wS / 2;
      // left of a vehicle driving towards the junction (direction -a)
      const lx = a.az;
      const lz = -a.ax;
      // Distance along the arm that puts a sign `lat` units to the left of the arm's centre line 24 units beyond the
      // main road's edge. The arm may be oblique, so the lateral offset counts too.
      const an = a.ax * mnx + a.az * mnz;
      const ln = lx * mnx + lz * mnz;
      const sig = an >= 0 ? 1 : -1;
      const along = (lat: number, gap: number): number => (sig * (wM / 2 + gap) - lat * ln) / (Math.abs(an) < 0.3 ? 0.3 * sig : an);
      // stop sign in front of the junction, with the name of the road ahead above it
      for (const [dd, kk] of [[0, 4.5], [8, 4.5], [16, 4.5], [0, 6], [-6, 4.5]] as const) {
        const lat = hw + kk;
        const s0 = along(lat, 24) + dd;
        const sx = J.x + a.ax * s0 + lx * lat;
        const sz = J.z + a.az * s0 + lz * lat;
        if (!B.roomFor(sx, sz, 5, { road: rid, roadMargin: 12, wall: 4, tall: true })) continue;
        const fr = frame(sx, sz, a.ax, a.az);
        B.record('stop', sx, sz, () => roadSign(B.c, fr, 'stop', NAME_OF[M.road.id] ?? 0));
        B.taken.add(sx, sz, 5);
        break;
      }
      // a speed limit sign further out on the other side of the lane
      if (wS <= 80) {
        for (const dd of [46, 60, 30]) {
          const lat = -(hw + 4.5);
          const s0 = along(lat, 24) + dd;
          const px = J.x + a.ax * s0 + lx * lat;
          const pz = J.z + a.az * s0 + lz * lat;
          if (!B.roomFor(px, pz, 4, { road: rid, roadMargin: 12, wall: 4, tall: true })) continue;
          const fr = frame(px, pz, a.ax, a.az);
          B.record('speed', px, pz, () => roadSign(B.c, fr, 'speed'));
          B.taken.add(px, pz, 4);
          break;
        }
      }
      // on the main road's kerb, both sides of the stem's mouth: bollards, a crossing sign, a guard pipe
      const sgn = a.ax * mnx + a.az * mnz >= 0 ? 1 : -1;
      for (const dir of [1, -1]) {
        const at2 = (delta: number, k: number): { x: number; z: number } => ({
          x: mq.x + mnx * sgn * (wM / 2 + k) + mtx * dir * (wS / 2 + delta),
          z: mq.z + mnz * sgn * (wM / 2 + k) + mtz * dir * (wS / 2 + delta),
        });
        const mo = { road: M.road.id, roadMargin: 3, wall: 3, tall: true };
        for (const delta of [4.5, 13]) {
          const p = at2(delta, 3.2);
          if (!B.roomFor(p.x, p.z, 2, mo)) continue;
          B.record('bollard', p.x, p.z, () => bollard(B.c, p.x, p.z, heightAt(p.x, p.z)));
          B.taken.add(p.x, p.z, 2);
        }
        const cs = at2(21, 4.8);
        if (B.roomFor(cs.x, cs.z, 5, mo)) {
          const fr = frame(cs.x, cs.z, mtx * dir, mtz * dir);
          B.record('crossing', cs.x, cs.z, () => roadSign(B.c, fr, 'crossing'));
          B.taken.add(cs.x, cs.z, 5);
        }
        const g0 = at2(31, 2.4);
        const g1 = at2(31 + 84, 2.4);
        const gm = at2(31 + 42, 2.4);
        if ([g0, gm, g1].every((p) => B.roomFor(p.x, p.z, 1.5, mo))) {
          let bays = 1;
          B.record('guard', g0.x, g0.z, () => {
            bays = guardPipe(B.c, g0.x, g0.z, g1.x, g1.z, heightAt(g0.x, g0.z));
          });
          for (let i = 0; i <= bays; i++) B.taken.add(g0.x + ((g1.x - g0.x) * i) / bays, g0.z + ((g1.z - g0.z) * i) / bays, 2);
        }
      }
      // a curve mirror on the far side of the main road (T junctions), turned towards the stem
      if (J.arms.length <= 3) {
        const mx = mq.x - mnx * sgn * (wM / 2 + 6) + mtx * 9;
        const mz = mq.z - mnz * sgn * (wM / 2 + 6) + mtz * 9;
        if (B.roomFor(mx, mz, 3, { road: M.road.id, roadMargin: 3, wall: 3, tall: true })) {
          const fr = frame(mx, mz, a.ax, a.az);
          B.record('mirror', mx, mz, () => curveMirror(B.c, fr));
          B.taken.add(mx, mz, 4);
        }
      }
    }
  }
}

// ---- plaza and station front ---------------------------------------------------------------------------------------

function plazaFurniture(B: Builder): void {
  const p = plazaW;
  // a row of bollards across every road that runs into the plaza
  const mouths: { x: number; z: number }[] = [];
  for (const info of B.infos) {
    for (const end of [0, 1]) {
      const pts = info.road.pts;
      const e = end === 0 ? pts[0]! : pts[pts.length - 1]!;
      const nb = end === 0 ? pts[1]! : pts[pts.length - 2]!;
      if (!inPlaza(e.x, e.z, -8) || mouths.some((m) => Math.hypot(m.x - e.x, m.z - e.z) < 120)) continue;
      mouths.push(e);
      const l = Math.hypot(e.x - nb.x, e.z - nb.z) || 1;
      const ux = (e.x - nb.x) / l; // pointing out of the road, into the plaza
      const uz = (e.z - nb.z) / l;
      const w = info.road.width;
      const n = Math.max(2, Math.floor((w - 20) / 26));
      for (let i = 0; i <= n; i++) {
        const t = (i / n - 0.5) * (w - 22);
        const x = e.x + ux * 10 - uz * t;
        const z = e.z + uz * 10 + ux * t;
        if (B.taken.hit(x, z, 1.5)) continue;
        B.record('bollard', x, z, () => bollard(B.c, x, z, heightAt(x, z)));
        // the row closes the street to cars only: the gaps stay wide enough to walk through
        B.solid({ minX: x - 1.4, maxX: x + 1.4, minZ: z - 1.4, maxZ: z + 1.4 });
        B.taken.add(x, z, 2);
      }
    }
  }
  // benches and lamps on the promenade between the lawn and the rim; post boxes at four corners
  const prom = (th: number, k: number): { x: number; z: number; ix: number; iz: number } => {
    const x = p.x + Math.cos(th) * p.rx * k;
    const z = p.z + Math.sin(th) * p.rz * k;
    // inward normal of the ellipse
    const nx = -(x - p.x) / (p.rx * p.rx);
    const nz = -(z - p.z) / (p.rz * p.rz);
    const l = Math.hypot(nx, nz) || 1;
    return { x, z, ix: nx / l, iz: nz / l };
  };
  const nearPath = (x: number, z: number): boolean => (Math.abs(x) < 70 && Math.abs(z) > 300) || (Math.abs(z) < 50 && Math.abs(x) > 500);
  const NB = 16;
  for (let i = 0; i < NB; i++) {
    const q = prom(((i + 0.5) / NB) * Math.PI * 2, 0.93);
    if (nearPath(q.x, q.z) || B.taken.hit(q.x, q.z, 10)) continue;
    const fr = frame(q.x, q.z, q.ix, q.iz);
    B.record('bench', q.x, q.z, () => bench(B.c, fr));
    B.solidBox(fr, -9.4, 9.4, -2.9, 2.9);
    B.taken.add(q.x, q.z, 10);
  }
  const NL = 18;
  for (let i = 0; i < NL; i++) {
    const q = prom((i / NL) * Math.PI * 2 + 0.07, 0.985);
    if (nearPath(q.x, q.z) || B.taken.hit(q.x, q.z, 8)) continue;
    const fr = frame(q.x, q.z, q.ix, q.iz);
    B.record('lamp', q.x, q.z, () => streetLamp(B.c, fr, i % 3 === 0 ? 1 : -1));
    B.taken.add(q.x, q.z, 4);
  }
  for (const th of [Math.PI * 0.27, Math.PI * 0.73, Math.PI * 1.27, Math.PI * 1.73]) {
    const q = prom(th, 0.955);
    if (B.taken.hit(q.x, q.z, 6)) continue;
    const fr = frame(q.x, q.z, q.ix, q.iz);
    B.record('post', q.x, q.z, () => postBox(B.c, fr));
    B.solidBox(fr, -3.3, 3.3, -3.3, 3.3);
    B.taken.add(q.x, q.z, 5);
  }
  // station front: benches facing the plaza, bollards along the forecourt edge, bicycle racks, a post box
  // (anything the station builder has already put there, as obstacles, is respected)
  const free = (x: number, z: number, r: number): boolean => !insideAny(x, z, B.c.obstacles, r) && !B.taken.hit(x, z, r);
  for (const x of [-120, 120]) {
    if (!free(x, 603, 11)) continue;
    const fr = frame(x, 603, 0, -1);
    B.record('bench', x, 603, () => bench(B.c, fr));
    B.solidBox(fr, -9.4, 9.4, -2.9, 2.9);
    B.taken.add(x, 603, 10);
  }
  for (const x of [-190, -166, -142, 142, 166, 190]) {
    if (!free(x, 583, 2.5)) continue;
    B.record('bollard', x, 583, () => bollard(B.c, x, 583, heightAt(x, 583)));
    B.taken.add(x, 583, 2);
  }
  if (free(-170, 606, 4.5)) {
    const fr = frame(-170, 606, 0, -1);
    B.record('post', -170, 606, () => postBox(B.c, fr));
    B.solidBox(fr, -3.3, 3.3, -3.3, 3.3);
    B.taken.add(-170, 606, 5);
  }
  for (const [x0, z, hd] of [[-215, 598, 1], [-215, 588, -1], [215, 598, 1], [215, 588, -1]] as const) {
    for (let i = 0; i < 3; i++) {
      const bx = x0 + (i - 1) * 25;
      if (!free(bx, z, 9)) continue;
      const bf = frame(bx, z, hd, 0);
      B.record('bike', bx, z, () => bicycle(B.c, bf, B.pick(BIKE_COLS), false));
      B.taken.add(bx, z, 8);
    }
  }
  if (free(-215, 609, 4)) {
    const fr = frame(-215, 609, 0, -1);
    B.record('bikesign', -215, 609, () => roadSign(B.c, fr, 'bike'));
  }
}

// ---- named shops ---------------------------------------------------------------------------------------------------

/** What each kind of shop puts out in front, in the order it is tried along the frontage. */
const FRONT_CYCLE: Record<string, string[]> = {
  conbini: ['bikes', 'vend', 'bikes', 'pots', 'bikes', 'planter'],
  cafe: ['pots', 'planter', 'bikes', 'pots', 'vend'],
  wagashi: ['planter', 'pots', 'vend', 'pots', 'bikes'],
  other: ['pots', 'bikes', 'vend', 'planter', 'pots', 'bikes'],
};

/** Bicycles, vending machines, bins and plants along the frontage of the named shops, clear of the door. */
function shopFronts(B: Builder): void {
  const posts = ['w-conbini', 'n-conbini', 'e-wagashi', 'w-cafe', 'n-cafe', 'w-book', 'e-super', 'e-sushi', 'w-flower', 'n-restaurant', 'e-restaurant', 'w-ramen'];
  for (const [id, sp] of Object.entries(B.c.spots)) {
    const rx = sp.fz;
    const rz = -sp.fx;
    const frontX = sp.x + sp.fx * sp.hv;
    const frontZ = sp.z + sp.fz * sp.hv;
    const rc = roadClearance(frontX, frontZ);
    const kfront = rc.d;
    // a shop far from any road (the lot was pulled back) still has its own frontage to decorate
    if (kfront < 18) continue;
    const doorU = (sp.hu > 60 ? 1 : 0) * sp.hu * 0.35 * (id.length % 2 ? 1 : -1);
    const type = id.includes('conbini') ? 'conbini' : id.includes('cafe') ? 'cafe' : id.includes('wagashi') ? 'wagashi' : 'other';
    const cycle = FRONT_CYCLE[type]!;
    const lively = type !== 'other';
    // the shop's own walls are not an obstacle for the things standing against them
    const o: RoomOpts = { road: rc.road?.id, roadMargin: 14, wall: 1.5, ownMargin: 15 };
    // positions along the frontage; v is measured from the front wall towards the road
    const along = (u: number, v: number): { x: number; z: number } => ({ x: frontX + rx * u + sp.fx * v, z: frontZ + rz * u + sp.fz * v });
    const v = 4.6;
    if (kfront - v < STRIP0 + 4) continue;
    let n = 0;
    if (type === 'conbini') {
      // the sorted-waste bins stand beside the door
      const m = along(doorU + (doorU >= 0 ? -1 : 1) * 24, 3.6);
      binRun(B, { x: m.x, z: m.z, fx: sp.fx, fz: sp.fz, opts: o }, 3);
    }
    for (const dir of [1, -1]) {
      let u = doorU + dir * 36;
      let idx = Math.floor(B.rnd() * cycle.length);
      while (Math.abs(u) < sp.hu - 12 && n < (lively ? 14 : 6)) {
        if (!B.chance(lively ? 0.92 : 0.55)) {
          u += dir * (18 + B.rnd() * 18);
          continue;
        }
        let kind = cycle[idx++ % cycle.length]!;
        // machines in front of the shop window would hide the goods: they stand towards the ends of the frontage
        if (kind === 'vend' && Math.abs(u) < sp.hu - 70) kind = 'pots';
        const len = kind === 'bikes' ? 75 : kind === 'vend' ? 44 : kind === 'pots' ? 22 : 24;
        const mid = along(u + (dir * len) / 2, v);
        const a: Anchor = { x: mid.x, z: mid.z, fx: sp.fx, fz: sp.fz, opts: o };
        let used = 0;
        if (kind === 'bikes') {
          used = bikeRun(B, a, type === 'conbini' ? 3 : 2);
          // a second row of bicycles further out in front of the convenience stores
          if (used && type === 'conbini' && kfront - 12.5 > STRIP0 + 4) {
            const m2 = along(u + (dir * len) / 2, 12.5);
            bikeRun(B, { ...a, x: m2.x, z: m2.z }, 3);
          }
        } else if (kind === 'vend') used = vendingRun(B, a, 2 + (B.chance(0.4) ? 1 : 0), 1 + (B.chance(0.5) ? 1 : 0));
        else if (kind === 'pots') used = potRun(B, a, 2 + Math.floor(B.rnd() * 3));
        else used = planterRun(B, a);
        if (used) n++;
        u += dir * ((used || 16) + 6 + B.rnd() * (lively ? 12 : 22));
      }
    }
    if (posts.includes(id)) {
      // a post box beside the shop, towards the end of the frontage that is farther from the door
      const u = (doorU >= 0 ? -1 : 1) * (sp.hu - 8);
      for (const du of [0, 14, -14, 28]) {
        const q = along(u + du, 5);
        if (!B.roomFor(q.x, q.z, 4, { ...o, tall: true })) continue;
        const fr = frame(q.x, q.z, sp.fx, sp.fz);
        B.record('post', q.x, q.z, () => postBox(B.c, fr));
        B.solidBox(fr, -3.3, 3.3, -3.3, 3.3);
        B.taken.add(q.x, q.z, 5);
        break;
      }
    }
  }
}

// ---- utility boxes beside the poles ----------------------------------------------------------------------------------

/** Grey-green equipment cabinets on the free strip next to some of the poles. */
function utilityBoxes(B: Builder): void {
  for (const p of poleList) {
    if (!B.chance(0.35)) continue;
    // beside the pole, towards the buildings, a little way along the street
    const tx = -p.oz;
    const tz = p.ox;
    const sgn = B.chance(0.5) ? 1 : -1;
    const x = p.x + p.ox * 7 + tx * sgn * 11;
    const z = p.z + p.oz * 7 + tz * sgn * 11;
    if (!B.roomFor(x, z, 6, { roadMargin: 14, wall: 8 })) continue;
    const fr = frame(x, z, -p.ox, -p.oz);
    B.record('cabinet', x, z, () => utilityBox(B.c, fr));
    B.solidBox(fr, -4.9, 4.9, -3, 3);
    B.taken.add(x, z, 6);
  }
}

// ---- lamps ---------------------------------------------------------------------------------------------------------

function lamps(B: Builder): void {
  // spacing along the road, and the banners that hang from the lamps (the shopping street advertises, the cherry
  // avenue announces its blossom festival)
  const plan: Record<string, { step: number; banners: number[] }> = {
    'main-street': { step: 110, banners: [0, 3] },
    'mountain-street': { step: 170, banners: [1] },
  };
  for (const ri of B.infos) {
    const p = plan[ri.road.id];
    if (!p) continue;
    let flip: 1 | -1 = 1;
    let n = 0;
    for (let s = 70; s < ri.total - 50; s += p.step) {
      flip = flip === 1 ? -1 : 1;
      const e = edge(ri, s, flip, 6.2);
      if (!B.roomFor(e.x, e.z, 3, { road: ri.road.id, roadMargin: 13, wall: 3, tall: true })) continue;
      const fr = frame(e.x, e.z, -e.ox, -e.oz);
      const banner = p.banners[n++ % p.banners.length]!;
      B.record('lamp', e.x, e.z, () => streetLamp(B.c, fr, banner));
      B.taken.add(e.x, e.z, 4);
    }
  }
}

// ---- the clutter along the sidewalks ------------------------------------------------------------------------------

/** Cumulative shares of: bicycles, vending machines, plants, planters, benches (the rest: post boxes). */
const STREET_MIX = [0.3, 0.46, 0.8, 0.92, 1.0];
const AVENUE_MIX = [0.1, 0.14, 0.5, 0.62, 0.93];

/** A post box on the free strip. */
function postRun(B: Builder, a: Anchor): number {
  if (!B.roomFor(a.x, a.z, 4, { ...a.opts, roadMargin: 15, wall: Math.min(a.opts.wall ?? 5, 4), tall: true })) return 0;
  const fr = frame(a.x, a.z, a.fx, a.fz);
  B.record('post', a.x, a.z, () => postBox(B.c, fr));
  B.solidBox(fr, -3.3, 3.3, -3.3, 3.3);
  B.taken.add(a.x, a.z, 5);
  return 12;
}

function stripClutter(B: Builder): void {
  for (const ri of B.infos) {
    for (const side of [1, -1] as const) {
      let s = 30 + B.rnd() * 50;
      while (s < ri.total - 30) {
        const e0 = edge(ri, s, side, 17);
        if (!groundOk(e0.x, e0.z) || inPlaza(e0.x, e0.z, 10)) {
          s += 30;
          continue;
        }
        if (B.rnd() > B.density(e0.x, e0.z) * CLUTTER) {
          s += 24 + B.rnd() * 30;
          continue;
        }
        // how deep is the free strip here? (the nearest wall; houses have a block wall just in front of it)
        const kb = Math.min(
          B.wallK((k) => edge(ri, s - 20, side, k)),
          B.wallK((k) => edge(ri, s, side, k)),
          B.wallK((k) => edge(ri, s + 20, side, k)),
        );
        const back = Math.min(STRIP_MAX, kb - 12.5);
        const depth = back - STRIP0;
        if (depth < 5.5 || kb >= 58) {
          s += 18;
          continue;
        }
        const tryAt = (len: number, d: number, place: (a: Anchor) => number): number => {
          if (depth < d) return 0;
          const e = edge(ri, s + len / 2, side, back - d / 2);
          return place({ x: e.x, z: e.z, fx: -e.ox, fz: -e.oz, opts: { road: ri.road.id } });
        };
        // what stands here: the cherry avenue gets more benches and post boxes than the shop streets
        const mix = ri.road.id === 'mountain-street' ? AVENUE_MIX : STREET_MIX;
        const r = B.rnd();
        let used = 0;
        if (r < mix[0]) used = tryAt(60, 6, (a) => bikeRun(B, a, 2 + Math.floor(B.rnd() * 2)));
        else if (r < mix[1]) {
          if (kb < 46) used = tryAt(50, VEND_D, (a) => vendingRun(B, a, 2 + (B.chance(0.4) ? 1 : 0), B.chance(0.85) ? 1 + (B.chance(0.4) ? 1 : 0) : 0));
        } else if (r < mix[2]) used = tryAt(30, 6, (a) => potRun(B, a, 2 + Math.floor(B.rnd() * 3)));
        else if (r < mix[3]) used = tryAt(30, 6, (a) => planterRun(B, a));
        else if (r < mix[4]) used = tryAt(24, 6, (a) => benchRun(B, a));
        else used = tryAt(14, 6.6, (a) => postRun(B, a));
        s += (used || 14) + 14 + B.rnd() * 36;
      }
    }
  }
}

// ---- school zone ---------------------------------------------------------------------------------------------------

function schoolSigns(B: Builder): void {
  const ri = B.infos.find((i) => i.road.id === 'east-lane');
  if (!ri) return;
  // the high school lies on the west side of the east lane, between these two latitudes
  for (const z of [-1330, -2790]) {
    let bs = 0;
    let bd = Infinity;
    for (const q of ri.smp) {
      const d = Math.abs(q.z - z);
      if (d < bd) {
        bd = d;
        bs = q.s;
      }
    }
    for (const side of [1, -1] as const) {
      const e = edge(ri, bs, side, 4.5);
      if (e.x > ri.smp[0]!.x) continue; // west side only
      if (!B.roomFor(e.x, e.z, 4, { road: ri.road.id, roadMargin: 8, wall: 4, tall: true })) continue;
      const fr = frame(e.x, e.z, 0, z === -1330 ? 1 : -1); // faces the traffic coming from the north / the south
      B.record('school', e.x, e.z, () => roadSign(B.c, fr, 'school'));
      B.taken.add(e.x, e.z, 4);
    }
  }
}

// ---- the zebra crossing, signs along the roads, mirrors at alley mouths ---------------------------------------------

/** Bollards, crossing signs and guard pipes either side of the zebra that `buildCrossings` paints on the main street. */
function zebraFurniture(B: Builder): void {
  const ri = B.infos.find((i) => i.road.id === 'main-street');
  if (!ri) return;
  const zc = ri.road.pts[0]!.z - 160;
  let sc = 0;
  let bd = Infinity;
  for (const q of ri.smp) {
    const d = Math.abs(q.z - zc);
    if (d < bd) {
      bd = d;
      sc = q.s;
    }
  }
  const o = { road: ri.road.id, roadMargin: 3, wall: 3, tall: true };
  for (const side of [1, -1] as const) {
    for (const dir of [1, -1] as const) {
      const bo = edge(ri, sc + dir * 21, side, 3.2);
      if (B.roomFor(bo.x, bo.z, 2, o)) {
        B.record('bollard', bo.x, bo.z, () => bollard(B.c, bo.x, bo.z, heightAt(bo.x, bo.z)));
        B.taken.add(bo.x, bo.z, 2);
      }
      const cs = edge(ri, sc + dir * 32, side, 4.8);
      if (B.roomFor(cs.x, cs.z, 5, o)) {
        const fr = frame(cs.x, cs.z, cs.tx * dir, cs.tz * dir);
        B.record('crossing', cs.x, cs.z, () => roadSign(B.c, fr, 'crossing'));
        B.taken.add(cs.x, cs.z, 5);
      }
      const g0 = edge(ri, sc + dir * 42, side, 2.4);
      const g1 = edge(ri, sc + dir * 126, side, 2.4);
      const gm = edge(ri, sc + dir * 84, side, 2.4);
      if ([g0, gm, g1].every((p) => B.roomFor(p.x, p.z, 1.5, o))) {
        let bays = 1;
        B.record('guard', g0.x, g0.z, () => {
          bays = guardPipe(B.c, g0.x, g0.z, g1.x, g1.z, heightAt(g0.x, g0.z));
        });
        for (let i = 0; i <= bays; i++) B.taken.add(g0.x + ((g1.x - g0.x) * i) / bays, g0.z + ((g1.z - g0.z) * i) / bays, 2);
      }
    }
  }
}

/** Speed limit and no-stopping signs now and then along the roads, facing the traffic. */
function roadSigns(B: Builder): void {
  const plan: { id: string; every: number; kind: 'speed' | 'nostop'; at: number }[] = [
    { id: 'mountain-street', every: 760, kind: 'speed', at: 380 },
    { id: 'east-lane', every: 900, kind: 'speed', at: 300 },
    { id: 'south-lane', every: 900, kind: 'speed', at: 330 },
    { id: 'tower-lane', every: 900, kind: 'speed', at: 330 },
    { id: 'univ-north-road', every: 1000, kind: 'speed', at: 450 },
    { id: 'main-street', every: 760, kind: 'nostop', at: 330 },
    { id: 'east-road', every: 1000, kind: 'nostop', at: 520 },
  ];
  for (const p of plan) {
    const ri = B.infos.find((i) => i.road.id === p.id);
    if (!ri) continue;
    let flip: 1 | -1 = 1;
    for (let s = p.at; s < ri.total - 60; s += p.every) {
      flip = flip === 1 ? -1 : 1;
      const side = flip;
      const e = edge(ri, s, side, 4.6);
      if (!B.roomFor(e.x, e.z, 4, { road: ri.road.id, roadMargin: 14, wall: 4, tall: true })) continue;
      // faces the traffic on its side of the road: drivers keep to the left, so the +normal side serves the
      // traffic that runs along +t and the sign looks back along -t
      const fr = frame(e.x, e.z, -e.tx * side, -e.tz * side);
      B.record(p.kind, e.x, e.z, () => roadSign(B.c, fr, p.kind));
      B.taken.add(e.x, e.z, 4);
    }
  }
}

/** Curve mirrors across the road from the mouths of alleys (gaps in the building line that lead deep into a block). */
function alleyMirrors(B: Builder): void {
  let n = 0;
  for (const ri of B.infos) {
    for (const side of [1, -1] as const) {
      let open = -1;
      for (let s = 40; s < ri.total - 40 && n < 14; s += 8) {
        const kb = B.wallK((k) => edge(ri, s, side, k));
        if (kb >= 58) {
          if (open < 0) open = s;
          continue;
        }
        if (open >= 0) {
          const w = s - open;
          if (w >= 24 && w <= 72) {
            const mid = (open + s) / 2;
            const here = edge(ri, mid, side, 0);
            const across = edge(ri, mid + 10, (side === 1 ? -1 : 1) as 1 | -1, 4.6);
            if (B.roomFor(across.x, across.z, 3, { road: ri.road.id, roadMargin: 14, wall: 4, tall: true }) && groundOk(here.x, here.z)) {
              const fr = frame(across.x, across.z, here.ox, here.oz);
              B.record('mirror', across.x, across.z, () => curveMirror(B.c, fr));
              B.taken.add(across.x, across.z, 4);
              n++;
            }
          }
          open = -1;
        }
      }
    }
  }
}

/** Builds all the street furniture. Call after the poles (they are avoided) and before the forest. */
export function buildFurniture(c: Ctx): FurnitureStats {
  const B = new Builder(c);
  junctionFurniture(B);
  zebraFurniture(B);
  plazaFurniture(B);
  roadSigns(B);
  alleyMirrors(B);
  schoolSigns(B);
  lamps(B);
  utilityBoxes(B);
  shopFronts(B);
  stripClutter(B);
  const total = Object.values(B.verts).reduce((a, b) => a + b, 0);
  c.report.push(`street furniture: ${Object.entries(B.counts).map(([k, n]) => `${k} ${n}`).join(', ')} (${total} vertices)`);
  return { counts: B.counts, verts: B.verts, items: B.items };
}


/** Fill a few quiet frontage gaps after all original builders, using a separate random stream. */
export function addNeighbourhoodDetails(c: Ctx, existing: FurnitureStats): FurnitureStats {
  const B = new Builder({ ...c, rnd: makeRng(20261017) }, 1, (x, z, radius) => !clearDoor(x, z, radius));
  for (const item of existing.items) B.taken.add(item.x, item.z, 14);
  const centres = [plazaW, ...['e-wagashi', 'w-cafe', 'w-conbini'].map(id => c.spots[id]).filter(Boolean)];
  const doors = Object.values(c.spots);
  const clearDoor = (x: number, z: number, radius = 0): boolean => {
    if (c.home && Math.hypot(x - c.home.x, z - c.home.z) < 32 + radius) return false;
    return !doors.some(s => {
      const dx = x - s.x, dz = z - s.z, u = dx * s.fz - dz * s.fx, v = dx * s.fx + dz * s.fz;
      return Math.abs(u) < 27 + radius && v > s.hv - 6 - radius && v < s.hv + 80 + radius;
    });
  };
  const buckets = B.infos.map(info => {
    const anchors: (Anchor & { distance: number })[] = [];
    for (const side of [-1, 1] as const) for (let s = 80; s < info.total - 40; s += 64) {
      const e = edge(info, s, side, 18.8), distance = Math.min(...centres.map(p => Math.hypot(e.x - p.x, e.z - p.z)));
      if (distance > 1000 || !clearDoor(e.x, e.z)) continue;
      anchors.push({ x: e.x, z: e.z, fx: -e.ox, fz: -e.oz, distance,
        opts: { road: info.road.id, roadMargin: 17, ownMargin: 17, wall: 6 } });
    }
    return anchors.sort((a, b) => a.distance - b.distance);
  });
  const vertexCount = (): number => c.main.vertexCount + c.signs.vertexCount + (c.foliage?.vertexCount ?? 0) + (c.topiary?.vertexCount ?? 0);
  const first = vertexCount(); let groups = 0;
  const defaults = c.main.all().map(([, batch]) => ({ batch, surface: batch.surface, axis: batch.axis }));
  for (const { batch } of defaults) { batch.surface = SURF.plain; batch.axis = 0; }
  try {
  // Round robin keeps the additions spread across streets instead of filling only the first road.
  for (let round = 0; round < 4 && groups < 24 && vertexCount() - first < 12000; round++) {
    for (let road = 0; road < buckets.length && groups < 24 && vertexCount() - first < 12000; road++) {
      const anchors = buckets[road]!;
      while (anchors.length) {
        const a = anchors.shift()!, before = B.items.length;
        const kind = (road + round) % 3;
        if (kind === 0) potRun(B, a, 2);
        else if (kind === 1) bikeRun(B, a, 1);
        else planterRun(B, a);
        if (B.items.length > before) { groups++; break; }
      }
    }
  }
  // A pair of garden cherries gives the shopping streets a spring canopy too.
  const shopFronts = ['e-wagashi', 'w-conbini', 'w-cafe'].map(id => c.spots[id]).filter(Boolean)
    .map(s => ({ x: s.x + s.fx * s.hv, z: s.z + s.fz * s.hv }));
  let cherries = 0, post = 0;
  const added: { x: number; z: number }[] = [];
  for (const shop of shopFronts) {
    if (cherries >= 2 || vertexCount() - first > 10000) break;
    const road = roadClearance(shop.x, shop.z).road;
    const info = B.infos.find(info => info.road.id === road?.id);
    if (!info || info.road.id === 'mountain-street' || info.road.id === 'coast-road') continue;
    const candidates: (Edge & { distance: number })[] = [];
    for (const side of [-1, 1] as const) for (let s = 80; s < info.total - 40; s += 96) {
      const e = edge(info, s, side, 22), distance = Math.hypot(e.x - shop.x, e.z - shop.z);
      if (distance >= 130 && distance <= 550) candidates.push({ ...e, distance });
    }
    for (const e of candidates.sort((a, b) => a.distance - b.distance)) {
      if (added.some(t => Math.hypot(t.x - e.x, t.z - e.z) < 140)) continue;
      if (!B.roomFor(e.x, e.z, 7, { road: info.road.id, ownMargin: 19, roadMargin: 18, wall: 8 })) continue;
      B.record('cherry', e.x, e.z, () => addCherry(B.c, e.x, e.z, .82));
      B.taken.add(e.x, e.z, 9); added.push(e); cherries++; break;
    }
  }
  // A single residential postal point, outside the walking strip on the cherry avenue.
  const avenue = B.infos.find(info => info.road.id === 'mountain-street');
  if (avenue) for (const side of [1, -1] as const) {
    for (let s = 560; s <= Math.min(900, avenue.total - 40); s += 80) {
      const e = edge(avenue, s, side, 38.8);
      if (avenueTrees.some(tree => Math.hypot(tree.x - e.x, tree.z - e.z) < 23)) continue;
      if (!B.roomFor(e.x, e.z, 4, { road: avenue.road.id, ownMargin: 17, roadMargin: 17, wall: 5, tall: true })) continue;
      B.record('post', e.x, e.z, () => postBox(B.c, frame(e.x, e.z, -e.ox - e.tx * .7, -e.oz - e.tz * .7)));
      B.taken.add(e.x, e.z, 5); post++; break;
    }
    if (post) break;
  }
  c.report.push(`shopping street trees: ${cherries}, avenue postal points: ${post}`);
  } finally {
    for (const { batch, surface, axis } of defaults) { batch.surface = surface; batch.axis = axis; }
  }
  c.report.push(`neighbourhood details: ${groups} small groups, ${B.items.length} objects, ${vertexCount() - first} vertices; original layout/random stream retained`);
  return { counts: B.counts, verts: B.verts, items: B.items };
}
