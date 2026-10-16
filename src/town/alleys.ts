import type { MeshBatch } from './batch';
import type { Ctx } from './ctx';
import { DEC1_Y, DEC2_Y, DEC3_Y } from './ctx';
import { Frame } from './frame';
import { samplePolyline } from './network';
import { signOnFace } from './parts';
import { OccGrid, roadClearance, roadsW } from './site';
import { addRoundTree } from './trees';
import { hex, pick, type RGB, type Rect, type V3 } from './util';

/** A back alley: a narrow lane from a street edge into a block, axis-aligned. */
interface Alley {
  /** start point on the street side (just past the sidewalk) */
  x: number;
  z: number;
  /** unit direction into the block (one of the four axes) */
  dx: number;
  dz: number;
  len: number;
  /** reaches another street (a shortcut) */
  through: boolean;
}

export interface AlleyStats {
  alleys: number;
  through: number;
  lots: number;
  /** A spot in a dead-end alley looking at its hidden lot (for the ?view=alley camera). */
  lookout?: { x: number; z: number; dx: number; dz: number };
}

const LANE_W = 30; // claimed width (≈2.4 m)
const PAINT_W = 26;
const SIDEWALK = 13; // sidewalk outer edge, measured from the road edge
const LANE_COL = hex(0xbcb6a7);
const GUTTER = hex(0x8c877c);
const WEEDS = hex(0xa3b45c);
const DIRT = hex(0xb39a74);
const TUFT = hex(0x7fa443);
const PIPE = hex(0xa9a59b);
const PIPE_IN = hex(0x4e4b45);

/** Rectangle covered by an alley from t0 to t1 along it, `w` wide. */
function laneRect(a: Alley, t0: number, t1: number, w: number): Rect {
  const px = -a.dz;
  const pz = a.dx;
  const xs = [a.x + a.dx * t0 + px * w / 2, a.x + a.dx * t1 - px * w / 2];
  const zs = [a.z + a.dz * t0 + pz * w / 2, a.z + a.dz * t1 - pz * w / 2];
  return { minX: Math.min(xs[0]!, xs[1]!), maxX: Math.max(xs[0]!, xs[1]!), minZ: Math.min(zs[0]!, zs[1]!), maxZ: Math.max(zs[0]!, zs[1]!) };
}

const flat = (r: Rect, y: number): [V3, V3, V3, V3] => [
  [r.minX, y, r.minZ], [r.maxX, y, r.minZ], [r.maxX, y, r.maxZ], [r.minX, y, r.maxZ],
];

/**
 * Cuts narrow back alleys (路地) into the blocks before any ordinary building is placed, and hides small
 * open lots (空き地) behind the street fronts at their ends or along them: concrete pipes, a bench under
 * a tree, or a plot for sale, sometimes with a cat. Everything claimed here stays free of buildings.
 */
export function buildAlleys(c: Ctx, grid: OccGrid, gap: number): AlleyStats {
  const r = c.rnd;
  const stats: AlleyStats = { alleys: 0, through: 0, lots: 0 };
  const range = (a: number, b: number): number => a + (b - a) * r();

  for (const road of roadsW) {
    const smp = samplePolyline(road.pts, 10);
    const total = smp[smp.length - 1]!.s;
    const hw = road.width / 2;
    let s = range(90, 260);
    while (s < total - 90) {
      const q = smp[Math.min(smp.length - 1, Math.round(s / 10))]!;
      s += range(240, 480);
      if (r() < 0.25) continue;
      // only streets running (almost) along an axis, so the alley and its lot stay axis-aligned
      if (Math.max(Math.abs(q.nx), Math.abs(q.nz)) < 0.97) continue;
      const side = r() < 0.5 ? -1 : 1;
      const dx = Math.abs(q.nx) > Math.abs(q.nz) ? Math.sign(q.nx) * side : 0;
      const dz = dx === 0 ? Math.sign(q.nz) * side : 0;
      const a: Alley = { x: q.x + q.nx * side * (hw + SIDEWALK - 1), z: q.z + q.nz * side * (hw + SIDEWALK - 1), dx, dz, len: 0, through: false };
      if (roadClearance(a.x, a.z).road !== road) continue; // too close to a junction

      // walk into the block until we meet another street (a shortcut) or something already there
      let end = 0;
      for (let t = 6; t <= 720; t += 5) {
        const x = a.x + dx * t;
        const z = a.z + dz * t;
        const rc = roadClearance(x, z);
        // the ground next to every street is reserved, so look for the other street a little ahead
        if (rc.road !== road && rc.d < 30) {
          a.through = true;
          end = t + Math.max(0, rc.d - (SIDEWALK - 1));
          break;
        }
        if (rc.road === road && rc.d < 16) continue; // still at the mouth
        if (!grid.free(laneRect(a, t, t + 5, LANE_W), 0)) break;
        end = t;
      }

      let lot: Rect | null = null;
      let lotFront = 0; // distance along the alley at which the lot's alley-side edge sits
      if (a.through) {
        a.len = end;
        if (a.len < 160) continue;
        // a lot beside a long shortcut, hidden behind both street fronts
        if (a.len > 440 && r() < 0.6) {
          const L = range(100, 150);
          const D = range(90, 120);
          const t0 = range(190, a.len - 190 - L);
          const off = (r() < 0.5 ? -1 : 1) * (LANE_W / 2 + gap + D / 2);
          lot = laneRect({ ...a, x: a.x - a.dz * off, z: a.z + a.dx * off }, t0, t0 + L, D);
          lotFront = Number.NaN;
        }
      } else {
        // a dead end: long ones open onto a hidden lot, short ones are just a nook
        if (end < 120) continue;
        if (end > 250 && r() < 0.8) {
          const D = range(95, 130);
          const W = range(110, 160);
          lotFront = end - D;
          lot = laneRect(a, lotFront, end, W);
          a.len = lotFront + 2;
        } else {
          a.len = Math.min(end, range(120, 220));
        }
      }
      if (lot && !grid.free(lot, gap)) {
        lot = null;
        if (!a.through) a.len = Math.min(end, range(120, 220));
      }

      grid.claim(laneRect(a, 0, a.len, LANE_W), 0);
      drawAlley(c, a);
      stats.alleys++;
      if (a.through) stats.through++;
      if (lot) {
        grid.claim(lot, gap);
        // the lot faces the alley: towards its start for a dead end, sideways for one beside a shortcut
        const cx = (lot.minX + lot.maxX) / 2;
        const cz = (lot.minZ + lot.maxZ) / 2;
        let f: Frame;
        if (Number.isNaN(lotFront)) {
          const ax = a.x + a.dx * ((cx - a.x) * a.dx + (cz - a.z) * a.dz);
          const az = a.z + a.dz * ((cx - a.x) * a.dx + (cz - a.z) * a.dz);
          f = new Frame(cx, cz, Math.sign(ax - cx), Math.sign(az - cz));
        } else {
          f = new Frame(cx, cz, -a.dx, -a.dz);
          stats.lookout ??= { x: a.x + a.dx * (lotFront - 70), z: a.z + a.dz * (lotFront - 70), dx: a.dx, dz: a.dz };
        }
        drawLot(c, lot, f);
        stats.lots++;
      }
    }
  }
  return stats;
}

function drawAlley(c: Ctx, a: Alley): void {
  const r = c.rnd;
  c.dec1.quad(...flat(laneRect(a, 0, a.len, PAINT_W), DEC1_Y), LANE_COL, [0, 1, 0]);
  // shallow gutters along both sides
  const px = -a.dz;
  const pz = a.dx;
  for (const sgn of [-1, 1]) {
    const o = sgn * (PAINT_W / 2 - 2.5);
    c.dec3.quad(...flat(laneRect({ ...a, x: a.x + px * o, z: a.z + pz * o }, 0, a.len, 2.2), DEC3_Y), GUTTER, [0, 1, 0]);
  }
  // potted plants, the odd bicycle and a vending machine near the mouth
  for (let t = 30; t < a.len - 12; t += 26) {
    const k = r();
    const sgn = r() < 0.5 ? -1 : 1;
    const o = sgn * (LANE_W / 2 - 3);
    const x = a.x + a.dx * t + px * o;
    const z = a.z + a.dz * t + pz * o;
    const b = c.main.at(x, z);
    if (t < 60 && k < 0.18) {
      const f = new Frame(x, z, -px * sgn, -pz * sgn);
      vendingMachine(b, f);
    } else if (k < 0.32) {
      pottedPlants(b, x, z, a.dx, a.dz, r);
    } else if (k < 0.38) {
      bicycle(b, x - px * sgn * 2, z - pz * sgn * 2, a.dx, a.dz, pick([hex(0xc94a4a), hex(0x4a78c9), hex(0xdedede), hex(0x3c3c3c)], r));
    }
  }
}

function pottedPlants(b: MeshBatch, x: number, z: number, dx: number, dz: number, r: () => number): void {
  const n = 1 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const ox = x + dx * (i - (n - 1) / 2) * 9;
    const oz = z + dz * (i - (n - 1) / 2) * 9;
    const h = 5 + r() * 3;
    b.cylinder(ox, oz, 0, h, 3.2, 4, 6, pick([hex(0xb8643c), hex(0x8a8f96), hex(0x6a4a34)], r));
    b.blob(ox, h + 4, oz, 4.5 + r() * 1.5, 4 + r() * 2, 4.5 + r() * 1.5, pick([hex(0x5fa548), hex(0x7cb55a), hex(0x4f8f3c)], r), 0.12, ox);
  }
}

const DRINKS = [hex(0x3c7fd0), hex(0xf0c040), hex(0x60b060), hex(0xe86a3a)];

function vendingMachine(b: MeshBatch, f: Frame): void {
  // f faces the lane centre; the machine stands with its back to the wall
  f.box(b, -7, 7, 0, 30, -5, 5, hex(0xf4f4f0));
  f.box(b, -6, 6, 15, 28, 5, 5.4, hex(0xd8443c));
  for (let i = 0; i < 4; i++) f.box(b, -5 + i * 2.8, -3.2 + i * 2.8, 18, 25, 5.4, 5.8, DRINKS[i]!);
  f.box(b, -6, 6, 3, 7, 5, 6, hex(0x2c2c30));
}

/** A parked bicycle along the lane direction (dx,dz). */
function bicycle(b: MeshBatch, x: number, z: number, dx: number, dz: number, col: RGB): void {
  const ax = Math.abs(dx);
  const az = Math.abs(dz);
  for (const s of [-1, 1]) {
    // wheels: thin upright slabs in the lane direction
    const wx = x + dx * s * 7;
    const wz = z + dz * s * 7;
    b.box(wx - ax * 4.5 - az * 0.4, wx + ax * 4.5 + az * 0.4, 0, 9, wz - az * 4.5 - ax * 0.4, wz + az * 4.5 + ax * 0.4, hex(0x2a2a2a));
  }
  b.box(x - ax * 7 - 0.6, x + ax * 7 + 0.6, 8, 9.5, z - az * 7 - 0.6, z + az * 7 + 0.6, col);
  b.box(x - 0.8, x + 0.8, 9, 13, z - 0.8, z + 0.8, col);
}

/** A horizontal pipe from (x0,z0) along (ux,uz), resting with its axis at height cy. */
function pipe(b: MeshBatch, x0: number, z0: number, ux: number, uz: number, len: number, cy: number, rad: number): void {
  const n = 10;
  const sx = -uz;
  const sz = ux;
  const ring = (t: number, rr: number): V3[] =>
    Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return [x0 + ux * t + sx * Math.cos(a) * rr, cy + Math.sin(a) * rr, z0 + uz * t + sz * Math.cos(a) * rr] as V3;
    });
  const r0 = ring(0, rad);
  const r1 = ring(len, rad);
  const i0 = ring(0, rad * 0.78);
  const i1 = ring(len, rad * 0.78);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const am = ((i + 0.5) / n) * Math.PI * 2;
    b.quad(r0[i]!, r1[i]!, r1[j]!, r0[j]!, PIPE, [sx * Math.cos(am), Math.sin(am), sz * Math.cos(am)]);
    // rim and dark inside at both ends
    b.quad(r0[i]!, r0[j]!, i0[j]!, i0[i]!, PIPE, [-ux, 0, -uz]);
    b.quad(r1[j]!, r1[i]!, i1[i]!, i1[j]!, PIPE, [ux, 0, uz]);
    b.tri([x0 + ux * 2, cy, z0 + uz * 2], i0[j]!, i0[i]!, PIPE_IN, [-ux, 0, -uz]);
    b.tri([x0 + ux * (len - 2), cy, z0 + uz * (len - 2)], i1[i]!, i1[j]!, PIPE_IN, [ux, 0, uz]);
  }
}

function cat(b: MeshBatch, f: Frame, u: number, v: number, col: RGB): void {
  const p = (du: number, y: number, dv: number): V3 => f.pt(u + du, y, v + dv);
  const body = p(0, 4.5, 0);
  b.blob(body[0], body[1], body[2], 3.6, 3.6, 3.6, col, 0.1, body[0]);
  const head = p(0, 9, 1.8);
  b.blob(head[0], head[1], head[2], 2.6, 2.4, 2.6, col, 0.1, head[2]);
  for (const s of [-1, 1]) {
    const e = p(s * 1.4, 11, 2);
    b.tri([e[0], e[1], e[2]], p(s * 2.6, 11, 1.6) as V3, p(s * 1.9, 13.6, 1.9) as V3, col, f.dir(0, 0, 1));
  }
  const t0 = p(0, 1.5, -3.5);
  b.box(t0[0] - 0.8, t0[0] + 0.8, 1, 2.2, t0[2] - 0.8, t0[2] + 0.8, col);
}

function drawLot(c: Ctx, lot: Rect, f: Frame): void {
  const r = c.rnd;
  const b = c.main.at(f.cx, f.cz);
  c.dec1.quad(...flat(lot, DEC1_Y), WEEDS, [0, 1, 0]);
  const W = lot.maxX - lot.minX;
  const D = lot.maxZ - lot.minZ;
  const rx = (): number => lot.minX + 8 + r() * (W - 16);
  const rz = (): number => lot.minZ + 8 + r() * (D - 16);
  for (let i = 0; i < 3; i++) c.dec2.disc(rx(), rz(), DEC2_Y, 10 + r() * 14, 8 + r() * 10, 9, DIRT);
  for (let i = 0; i < 14; i++) {
    const x = rx();
    const z = rz();
    b.blob(x, 2, z, 3 + r() * 3, 2 + r() * 3, 3 + r() * 3, TUFT, 0.15, x + z);
  }
  // local half sizes in the lot's own frame (front = towards the alley)
  const hu = f.fx === 0 ? W / 2 : D / 2;
  const hv = f.fx === 0 ? D / 2 : W / 2;
  const k = r();
  if (k < 0.45) {
    // the classic stack of concrete pipes
    const rad = 10;
    const len = 44;
    const u0 = (r() - 0.5) * (hu - 40);
    const v0 = -hv * 0.15;
    const d = f.dir(0, 0, 1);
    for (const [du, y] of [[-rad - 0.5, rad], [rad + 0.5, rad], [0, rad * 2.75]] as const) {
      const s = f.pt(u0 + du, 0, v0 - len / 2);
      pipe(b, s[0], s[2], d[0], d[2], len, y, rad);
    }
    const a = f.pt(u0 - rad * 2 - 1, 0, v0 - len / 2);
    const e = f.pt(u0 + rad * 2 + 1, 0, v0 + len / 2);
    c.obstacles.push({ minX: Math.min(a[0], e[0]), maxX: Math.max(a[0], e[0]), minZ: Math.min(a[2], e[2]), maxZ: Math.max(a[2], e[2]) });
  } else if (k < 0.75) {
    // a bench under a tree: someone's favourite spot
    const t = f.pt(-hu * 0.35, 0, -hv * 0.3);
    addRoundTree(c, t[0], t[2], 0.9 + r() * 0.3);
    f.box(b, -hu * 0.35 + 14, -hu * 0.35 + 44, 7, 9, -hv * 0.3 - 4, -hv * 0.3 + 4, hex(0x9a6a44));
    f.box(b, -hu * 0.35 + 14, -hu * 0.35 + 44, 9, 16, -hv * 0.3 - 5, -hv * 0.3 - 3.5, hex(0x9a6a44));
    for (const du of [16, 42]) f.box(b, -hu * 0.35 + du - 1, -hu * 0.35 + du + 1, 0, 7, -hv * 0.3 - 3, -hv * 0.3 + 3, hex(0x55524c));
  } else {
    // a plot for sale, roped off, with a signboard facing the alley
    const post = hex(0x6b6b70);
    for (const s of [-1, 1]) f.box(b, s * 12 - 1, s * 12 + 1, 0, 26, hv - 10, hv - 8, post);
    f.box(b, -16, 16, 14, 30, hv - 9.6, hv - 8.4, hex(0xf4f2ea));
    signOnFace(c, f, '売地', 0, 15, 30, 14, hv - 8.3, 1);
    for (const [u0, v0, u1, v1] of [[-hu + 4, -hv + 4, hu - 4, -hv + 4], [-hu + 4, -hv + 4, -hu + 4, hv - 4], [hu - 4, -hv + 4, hu - 4, hv - 4]] as const) {
      const p0 = f.pt(u0, 7, v0);
      const p1 = f.pt(u1, 7, v1);
      b.wire([p0, p1], 0.8, hex(0xe8e0c8));
      for (const p of [p0, p1]) b.box(p[0] - 0.8, p[0] + 0.8, 0, 8, p[2] - 0.8, p[2] + 0.8, hex(0xe8e0c8));
    }
  }
  if (r() < 0.55) cat(b, f, (r() - 0.5) * hu, hv * 0.35, pick([hex(0xe2a457), hex(0x2c2a28), hex(0xd9d4cc), hex(0x8a7a6a)], r));
}
