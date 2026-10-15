import { beam } from './batch';
import { DEC0_Y, type Ctx } from './ctx';
import { insideAny, plazaW, railDistance, roadClearance, roadsW, stationRect } from './site';
import { samplePolyline } from './network';
import { BEACH_WIDTH, SUMMIT_XZ, coastS, heightAt, mountainHeight, mountainT } from './terrain';
import { addCherry, addForestTree } from './trees';
import { hex, makeRng, V3 } from './util';

const POLE = hex(0xb4b6bb);
const POLE_DARK = hex(0x6b6e76);
const WIRE = hex(0x2c2d33);

function blockedForProp(c: Ctx, x: number, z: number, roadSkip: string | undefined, roadMargin: number): boolean {
  if (coastS(x, z) > -(BEACH_WIDTH - 5)) return true;
  if (roadClearance(x, z, roadSkip).d < roadMargin) return true;
  if (railDistance(x, z) < 40) return true;
  if (x > stationRect.minX - 20 && x < stationRect.maxX + 20 && z > stationRect.minZ - 20 && z < stationRect.maxZ + 20) return true;
  const ex = (x - plazaW.x) / (plazaW.rx + 6);
  const ez = (z - plazaW.z) / (plazaW.rz + 6);
  if (ex * ex + ez * ez < 1) return true;
  if (mountainHeight(x, z) > 6) return true;
  return insideAny(x, z, c.obstacles, 10);
}

interface PolePos {
  x: number;
  z: number;
  nx: number;
  nz: number;
}

/** Utility poles every ~250 units along the main roads, with crossbars and sagging wires. */
export function buildPoles(c: Ctx): { poles: number } {
  const ids = ['coast-road', 'west-road', 'mountain-street', 'main-street', 'ne-street', 'east-road', 'univ-north-road', 'east-lane', 'south-lane', 'tower-lane'];
  let count = 0;
  roadsW.forEach((road, ri) => {
    if (!ids.includes(road.id)) return;
    const smp = samplePolyline(road.pts, 10);
    const total = smp[smp.length - 1]!.s;
    const placed: PolePos[] = [];
    const side0 = ri % 2 ? 1 : -1;
    for (let d = 90 + ri * 37; d < total - 60; d += 250) {
      const q = smp.reduce((best, s) => (Math.abs(s.s - d) < Math.abs(best.s - d) ? s : best), smp[0]!);
      for (const side of [side0, -side0]) {
        const off = road.width / 2 + 10;
        const x = q.x + q.nx * side * off;
        const z = q.z + q.nz * side * off;
        if (blockedForProp(c, x, z, road.id, 16)) continue;
        // keep the same side along a run where possible
        placed.push({ x, z, nx: q.nx, nz: q.nz });
        break;
      }
    }
    const H = 128;
    for (const p of placed) {
      const y0 = heightAt(p.x, p.z);
      const b = c.main.at(p.x, p.z);
      b.cylinder(p.x, p.z, y0, y0 + H, 2.6, 1.6, 6, POLE);
      const dx = p.nx * 20;
      const dz = p.nz * 20;
      beam(b, [p.x - dx, y0 + 116, p.z - dz], [p.x + dx, y0 + 116, p.z + dz], 2, 3, POLE_DARK);
      beam(b, [p.x - dx * 0.7, y0 + 103, p.z - dz * 0.7], [p.x + dx * 0.7, y0 + 103, p.z + dz * 0.7], 1.8, 2.5, POLE_DARK);
      for (const s of [-1, 1]) b.cylinder(p.x + dx * s * 0.92, p.z + dz * s * 0.92, y0 + 116, y0 + 122, 1.5, 1.2, 5, hex(0xe4e6ea), true);
      b.cylinder(p.x, p.z, y0 + 120, y0 + 124, 1.5, 1.2, 5, hex(0xe4e6ea), true);
      if ((Math.round(p.x + p.z) & 3) === 0) {
        b.cylinder(p.x + p.nx * 5, p.z + p.nz * 5, y0 + 84, y0 + 98, 5, 5, 8, hex(0x9a9ca4));
      }
      count++;
    }
    // wires between consecutive poles
    for (let i = 0; i + 1 < placed.length; i++) {
      const a = placed[i]!;
      const b2 = placed[i + 1]!;
      const L = Math.hypot(a.x - b2.x, a.z - b2.z);
      if (L > 420) continue;
      const ya = heightAt(a.x, a.z);
      const yb = heightAt(b2.x, b2.z);
      const attach: [number, number][] = [[-20, 116], [20, 116], [0, 123], [0, 103]];
      for (const [o, hh] of attach) {
        const pts: V3[] = [];
        const nseg = 4;
        for (let k = 0; k <= nseg; k++) {
          const t = k / nseg;
          const x = a.x + a.nx * o + (b2.x + b2.nx * o - a.x - a.nx * o) * t;
          const z = a.z + a.nz * o + (b2.z + b2.nz * o - a.z - a.nz * o) * t;
          const y = ya + hh + (yb - ya) * t - L * 0.035 * 4 * t * (1 - t);
          pts.push([x, y, z]);
        }
        c.main.at(a.x, a.z).wire(pts, 0.9, WIRE);
      }
    }
  });
  return { poles: count };
}

/** Cherry trees along the mountain street, the coast road and around the plaza. */
export function buildAvenues(c: Ctx): number {
  let n = 0;
  const place = (x: number, z: number, sc: number): void => {
    addCherry(c, x, z, sc);
    n++;
  };
  const ms = roadsW.find((r) => r.id === 'mountain-street')!;
  const smp = samplePolyline(ms.pts, 10);
  for (let d = 150; d < smp[smp.length - 1]!.s - 80; d += 118) {
    const q = smp.reduce((best, s) => (Math.abs(s.s - d) < Math.abs(best.s - d) ? s : best), smp[0]!);
    for (const side of [-1, 1]) {
      const x = q.x + q.nx * side * (ms.width / 2 + 22);
      const z = q.z + q.nz * side * (ms.width / 2 + 22);
      if (blockedForProp(c, x, z, ms.id, 8)) continue;
      place(x, z, 1.0 + c.rnd() * 0.2);
    }
  }
  const cr = roadsW.find((r) => r.id === 'coast-road')!;
  const cs = samplePolyline(cr.pts, 10);
  for (let d = 180; d < cs[cs.length - 1]!.s - 100; d += 210) {
    const q = cs.reduce((best, s) => (Math.abs(s.s - d) < Math.abs(best.s - d) ? s : best), cs[0]!);
    // the sea-side of the coast road is the left-hand side when walking east
    const x = q.x + q.nx * (cr.width / 2 + 22);
    const z = q.z + q.nz * (cr.width / 2 + 22);
    if (coastS(x, z) > -(BEACH_WIDTH + 10)) continue;
    if (blockedForProp(c, x, z, cr.id, 8)) continue;
    place(x, z, 1.05);
  }
  // plaza ring
  const lx = plazaW.rx * 0.84;
  const lz = plazaW.rz * 0.8;
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + 0.05;
    const x = Math.cos(a) * lx * 0.93;
    const z = Math.sin(a) * lz * 0.93;
    if (Math.abs(x) < 58 || Math.abs(z) < 48) continue;
    place(x, z, 1.15 + c.rnd() * 0.25);
  }
  for (let i = 0; i < 14; i++) {
    const a = c.rnd() * Math.PI * 2;
    const r = 0.25 + c.rnd() * 0.5;
    const x = Math.cos(a) * lx * r;
    const z = Math.sin(a) * lz * r;
    if (Math.abs(x) < 60 || Math.abs(z) < 50 || Math.hypot(x, z) < 130) continue;
    place(x, z, 1.1 + c.rnd() * 0.3);
  }
  return n;
}

/** Wooded mountain: conifers, broadleaf trees and a few wild cherries. */
export function buildForest(c: Ctx, avoid: readonly { x: number; z: number }[]): number {
  const rnd = makeRng(777);
  let n = 0;
  const S = SUMMIT_XZ;
  const x0 = S.x - 3200;
  const x1 = -2300;
  const z0 = S.z - 3000;
  const z1 = -380;
  const step = 120;
  for (let x = x0; x < x1; x += step) {
    for (let z = z0; z < z1; z += step) {
      const px = x + (rnd() - 0.5) * step * 0.9;
      const pz = z + (rnd() - 0.5) * step * 0.9;
      const t = mountainT(px, pz);
      if (t < 0.012) continue;
      if (Math.hypot(px - S.x, pz - S.z) < 150) continue;
      if (roadClearance(px, pz).d < 30) continue;
      if (insideAny(px, pz, c.obstacles, 20)) continue;
      if (avoid.some((a) => Math.abs(a.x - px) < 34 && Math.abs(a.z - pz) < 34)) continue;
      const h = heightAt(px, pz);
      if (h > 880) continue;
      const k = rnd();
      const kind = k < 0.4 ? 0 : k < 0.9 ? 1 : 2;
      addForestTree(c, px, pz, 0.85 + rnd() * 0.55, kind);
      n++;
    }
  }
  return n;
}

/** Zig-zag footpath from the end of the mountain street up to the summit. */
export function buildTrail(c: Ctx): { x: number; z: number }[] {
  const ms = roadsW.find((r) => r.id === 'mountain-street')!;
  const e = ms.pts[ms.pts.length - 1]!;
  const S = SUMMIT_XZ;
  const dx = S.x - e.x;
  const dz = S.z - e.z;
  const len = Math.hypot(dx, dz);
  const px = -dz / len;
  const pz = dx / len;
  const pts: { x: number; z: number }[] = [];
  const legs = 9;
  for (let i = 0; i <= legs; i++) {
    const t = i / legs;
    const amp = 260 * Math.sin(Math.PI * Math.min(1, t * 1.1)) ;
    const side = i % 2 ? 1 : -1;
    pts.push({ x: e.x + dx * t + px * amp * side, z: e.z + dz * t + pz * amp * side });
  }
  pts.push({ x: S.x + 20, z: S.z + 20 });
  // smooth with a Catmull-Rom spline, then lay a ribbon along the terrain
  const smooth: { x: number; z: number }[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 1)]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    for (let k = 0; k < 12; k++) {
      const t = k / 12;
      const t2 = t * t;
      const t3 = t2 * t;
      smooth.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        z: 0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
      });
    }
  }
  smooth.push(pts[pts.length - 1]!);
  const sm = samplePolyline(smooth, 20);
  const left: V3[] = [];
  const right: V3[] = [];
  for (const q of sm) {
    const w = 11;
    const lx = q.x + q.nx * w, lz = q.z + q.nz * w, rx = q.x - q.nx * w, rz = q.z - q.nz * w;
    left.push([lx, heightAt(lx, lz) + DEC0_Y + 0.3, lz]);
    right.push([rx, heightAt(rx, rz) + DEC0_Y + 0.3, rz]);
  }
  c.dec1.strip(left, right, hex(0xd8c7a0));
  return sm.map((q) => ({ x: q.x, z: q.z }));
}
