import type { Ctx } from './ctx';
import { frameFacing } from './frame';
import { addApartment, addHouse, addHouseLite } from './houses';
import type { Lot } from './layout';
import { addParking } from './parking';
import { addShop, SMALL_SHOPS } from './shops';
import { samplePolyline } from './network';
import { OccGrid, roadClearance, roadsW } from './site';
import { pick, type Rect } from './util';

export interface InfillStats {
  houses: number;
  shops: number;
  apartments: number;
  parking: number;
}

type Kind = 'house' | 'shop' | 'apart' | 'parking';

interface Spec {
  kind: Kind;
  W: number; // along-road length
  D: number; // depth
  floors: number;
  main: boolean;
}

/**
 * Fills the empty ground of the town with ordinary buildings: first rows of buildings facing every street
 * (bigger and taller on the main streets), then the interior blocks. Deterministic (uses the context RNG).
 */
export function buildInfill(c: Ctx, grid: OccGrid): InfillStats {
  const r = c.rnd;
  const stats: InfillStats = { houses: 0, shops: 0, apartments: 0, parking: 0 };
  const range = (a: number, b: number): number => a + (b - a) * r();
  let counter = 0;

  /** Try to build a spec with its centre at (cx,cz). Returns true on success. */
  const build = (s: Spec, cx: number, cz: number, wx: number, dz: number, lite: boolean): boolean => {
    const infl = s.kind === 'house' ? 11 : 6;
    const rect: Rect = { minX: cx - wx / 2, maxX: cx + wx / 2, minZ: cz - dz / 2, maxZ: cz + dz / 2 };
    if (!grid.free(rect, infl)) return false;
    grid.claim(rect, infl);
    const nr = roadClearance(cx, cz);
    const f = frameFacing(cx, cz, nr.px, nr.pz);
    const hu = f.fx === 0 ? wx / 2 : dz / 2;
    const hv = f.fx === 0 ? dz / 2 : wx / 2;
    switch (s.kind) {
      case 'house':
        if (lite) addHouseLite(c, rect, f, hu, hv, s.floors);
        else addHouse(c, rect, f, hu, hv, s.floors);
        stats.houses++;
        break;
      case 'apart': {
        addApartment(c, rect, f, hu, hv, s.floors, s.floors >= 4 && r() < 0.6 ? 'マンション' : 'アパート');
        stats.apartments++;
        break;
      }
      case 'shop': {
        const lot: Lot = { id: `infill-${counter++}`, label: pick(SMALL_SHOPS, r), kind: 'shop', x: 0, y: 0, w: 0, d: 0, floors: s.floors };
        addShop(c, lot, rect, f, hu, hv);
        stats.shops++;
        break;
      }
      case 'parking':
        addParking(c, f, hu, hv);
        stats.parking++;
        break;
    }
    return true;
  };

  const pickSpec = (main: boolean, nearCentre: number): Spec => {
    const k = r();
    if (main) {
      if (k < 0.34) return { kind: 'shop', W: range(110, 230), D: range(95, 130), floors: r() < 0.55 ? 2 : 3, main };
      if (k < 0.48) return { kind: 'apart', W: range(150, 260), D: range(115, 150), floors: 3 + Math.floor(r() * 3), main };
      if (k < 0.58) return { kind: 'parking', W: range(130, 200), D: range(100, 130), floors: 0, main };
      return { kind: 'house', W: range(110, 150), D: range(92, 118), floors: r() < 0.3 ? 3 : 2, main };
    }
    if (k < 0.07) return { kind: 'shop', W: range(100, 150), D: range(85, 105), floors: 2, main };
    if (k < 0.13 + nearCentre * 0.04) return { kind: 'apart', W: range(130, 190), D: range(100, 130), floors: 3 + Math.floor(r() * 2), main };
    return { kind: 'house', W: range(94, 128), D: range(78, 104), floors: r() < 0.82 ? 2 : 1, main };
  };

  // ---- pass A: rows of buildings facing each street, both sides ----
  for (const road of roadsW) {
    const smp = samplePolyline(road.pts, 10);
    const total = smp[smp.length - 1]!.s;
    const hw = road.width / 2;
    const main = road.width >= 90;
    const at = (s: number): { x: number; z: number; nx: number; nz: number } => {
      let lo = 0;
      let hi = smp.length - 1;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (smp[m]!.s < s) lo = m;
        else hi = m;
      }
      return smp[lo]!;
    };
    for (const side of [-1, 1]) {
      let s = 10 + r() * 30;
      while (s < total - 20) {
        const base = pickSpec(main, 0);
        let placed = false;
        for (const scale of [1, 0.82, 0.66]) {
          const Lw = base.W * scale;
          const Dp = base.D * (scale > 0.9 ? 1 : 0.9);
          const q = at(s + Lw / 2);
          const alongX = Math.abs(q.nz) > Math.abs(q.nx); // normal along z => road runs along x
          const wx = alongX ? Lw : Dp;
          const dz = alongX ? Dp : Lw;
          const infl = base.kind === 'house' ? 11 : 6;
          const half = (Math.abs(q.nx) * wx + Math.abs(q.nz) * dz) / 2;
          for (let off = 0; off <= 44; off += 4) {
            const d = hw + 15 + infl + half + off;
            const cx = q.x + q.nx * side * d;
            const cz = q.z + q.nz * side * d;
            if (build({ ...base, W: Lw, D: Dp }, cx, cz, wx, dz, !main && base.kind === 'house')) {
              placed = true;
              break;
            }
          }
          if (placed) {
            s += Lw + range(2, 12);
            break;
          }
        }
        if (!placed) s += 28;
      }
    }
  }

  // ---- pass B/C: interior blocks on staggered lattices ----
  const b = grid;
  const x0 = b.minX + 40;
  const x1 = b.minX + b.nx * b.cell - 40;
  const z0 = b.minZ + 40;
  const z1 = b.minZ + b.nz * b.cell - 40;
  const passes: { stepX: number; stepZ: number; scale: number }[] = [
    { stepX: 126, stepZ: 112, scale: 1 },
    { stepX: 96, stepZ: 88, scale: 0.72 },
  ];
  for (const ps of passes) {
    let row = 0;
    for (let z = z0; z < z1; z += ps.stepZ, row++) {
      for (let x = x0 + (row % 2) * (ps.stepX / 2); x < x1; x += ps.stepX) {
        const cx = x + (r() - 0.5) * 16;
        const cz = z + (r() - 0.5) * 12;
        const k = r();
        let spec: Spec;
        if (ps.scale === 1) {
          if (k < 0.06) spec = { kind: 'apart', W: range(130, 180), D: range(100, 125), floors: 3 + Math.floor(r() * 2), main: false };
          else if (k < 0.1) spec = { kind: 'parking', W: range(110, 150), D: range(90, 110), floors: 0, main: false };
          else if (k < 0.14) spec = { kind: 'shop', W: range(100, 140), D: range(85, 100), floors: 2, main: false };
          else spec = { kind: 'house', W: range(94, 124), D: range(78, 100), floors: r() < 0.85 ? 2 : 1, main: false };
        } else {
          spec = { kind: 'house', W: range(76, 100), D: range(66, 84), floors: r() < 0.6 ? 2 : 1, main: false };
        }
        for (const sc of [1, 0.85]) {
          const W = spec.W * sc;
          const D = spec.D * sc;
          const horiz = r() < 0.5;
          if (build(spec, cx, cz, horiz ? W : D, horiz ? D : W, true)) break;
        }
      }
    }
  }
  return stats;
}
