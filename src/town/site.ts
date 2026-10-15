import { PLAZA, RAILWAY, ROADS, STATION, mapToWorld } from './layout';
import { BEACH_WIDTH, coastS, mountainHeight } from './terrain';
import { distPointSeg, type Rect } from './util';

export interface Pt {
  x: number;
  z: number;
}
export interface RoadW {
  id: string;
  pts: Pt[];
  width: number;
}

const EXTEND = 520;

function extendEnds(pts: Pt[], atStart: boolean, atEnd: boolean): Pt[] {
  const out = pts.slice();
  if (atStart) {
    const a = pts[0]!;
    const b = pts[1]!;
    const l = Math.hypot(a.x - b.x, a.z - b.z) || 1;
    out.unshift({ x: a.x + ((a.x - b.x) / l) * EXTEND, z: a.z + ((a.z - b.z) / l) * EXTEND });
  }
  if (atEnd) {
    const a = pts[pts.length - 1]!;
    const b = pts[pts.length - 2]!;
    const l = Math.hypot(a.x - b.x, a.z - b.z) || 1;
    out.push({ x: a.x + ((a.x - b.x) / l) * EXTEND, z: a.z + ((a.z - b.z) / l) * EXTEND });
  }
  return out;
}

const onMapEdge = (x: number, y: number): boolean => x <= 0 || x >= 1400 || y <= 0 || y >= 1050;

/** Roads in world units. Ends on the map edge are extended so the town does not stop abruptly. */
export const roadsW: RoadW[] = ROADS.map((r) => {
  const pts = r.points.map(([x, y]) => mapToWorld(x, y));
  const first = r.points[0]!;
  const last = r.points[r.points.length - 1]!;
  // the mountain street already runs into the hill, do not extend it
  const ext = r.id !== 'mountain-street';
  return { id: r.id, pts: extendEnds(pts, ext && onMapEdge(first[0], first[1]), ext && onMapEdge(last[0], last[1])), width: r.width };
});

/** Railway centre line in world units (west end extended; east end stops short of the sea). */
export const railW: Pt[] = extendEnds(
  RAILWAY.map(([x, y]) => mapToWorld(x, y)),
  true,
  false,
);
export const RAIL_HALF = 22; // half width of the ballast bed

export const stationRect: Rect = (() => {
  const a = mapToWorld(STATION.x0, STATION.y0);
  const b = mapToWorld(STATION.x1, STATION.y1);
  return { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
})();

export const plazaW = { x: mapToWorld(PLAZA.x, PLAZA.y).x, z: mapToWorld(PLAZA.x, PLAZA.y).z, rx: PLAZA.rx * 5.36, rz: PLAZA.ry * 5.36 };

export function lotRect(x: number, y: number, w: number, d: number): Rect {
  const a = mapToWorld(x - w / 2, y - d / 2);
  const b = mapToWorld(x + w / 2, y + d / 2);
  return { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
}

/** Distance from (x,z) to the nearest road edge (negative on the road), and that road. */
export function roadClearance(x: number, z: number, skipId?: string): { d: number; road: RoadW | null; px: number; pz: number } {
  let best = Infinity;
  let bestRoad: RoadW | null = null;
  let bpx = 0;
  let bpz = 0;
  for (const r of roadsW) {
    if (r.id === skipId) continue;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const a = r.pts[i]!;
      const b = r.pts[i + 1]!;
      const d = distPointSeg(x, z, a.x, a.z, b.x, b.z) - r.width / 2;
      if (d < best) {
        best = d;
        bestRoad = r;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
        bpx = a.x + dx * t;
        bpz = a.z + dz * t;
      }
    }
  }
  return { d: best, road: bestRoad, px: bpx, pz: bpz };
}

export function railDistance(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < railW.length; i++) {
    const a = railW[i]!;
    const b = railW[i + 1]!;
    best = Math.min(best, distPointSeg(x, z, a.x, a.z, b.x, b.z));
  }
  return best;
}

export type BlockReason = 'road' | 'rail' | 'station' | 'plaza' | 'sea' | 'mountain';

/** Why a building may not stand at (x,z) (undefined = free). Margins leave room for sidewalks/fences. */
export function siteBlock(x: number, z: number): BlockReason | undefined {
  if (coastS(x, z) > -(BEACH_WIDTH + 14)) return 'sea';
  if (roadClearance(x, z).d < 15) return 'road';
  if (railDistance(x, z) < RAIL_HALF + 18) return 'rail';
  const sr = stationRect;
  if (x > sr.minX - 14 && x < sr.maxX + 14 && z > sr.minZ - 14 && z < sr.maxZ + 14) return 'station';
  const p = plazaW;
  const ex = (x - p.x) / (p.rx + 24);
  const ez = (z - p.z) / (p.rz + 24);
  if (ex * ex + ez * ez < 1) return 'plaza';
  if (mountainHeight(x, z) > 6) return 'mountain';
  return undefined;
}

/**
 * Finds up to `maxPieces` large axis-aligned rectangles inside `lot` that are free of roads, railway,
 * sea, mountain, the plaza, the station and `taken` footprints. Uses a coarse occupancy grid and the
 * maximal-rectangle-in-histogram algorithm.
 */
export function freeRects(
  lot: Rect,
  taken: readonly Rect[],
  opts: { cell?: number; maxPieces?: number; minW: number; minD: number; takenGap?: number },
): { pieces: Rect[]; blocked: Partial<Record<BlockReason | 'building', number>>; total: number } {
  const cell = opts.cell ?? 8;
  const gap = opts.takenGap ?? 14;
  const nx = Math.max(1, Math.floor((lot.maxX - lot.minX) / cell));
  const nz = Math.max(1, Math.floor((lot.maxZ - lot.minZ) / cell));
  const blk = new Uint8Array(nx * nz);
  const reasons: Partial<Record<BlockReason | 'building', number>> = {};
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = lot.minX + (i + 0.5) * cell;
      const z = lot.minZ + (j + 0.5) * cell;
      let r: BlockReason | 'building' | undefined = siteBlock(x, z);
      if (!r) {
        for (const t of taken) {
          if (x > t.minX - gap && x < t.maxX + gap && z > t.minZ - gap && z < t.maxZ + gap) {
            r = 'building';
            break;
          }
        }
      }
      if (r) {
        blk[j * nx + i] = 1;
        reasons[r] = (reasons[r] ?? 0) + 1;
      }
    }
  }
  const pieces: Rect[] = [];
  const maxPieces = opts.maxPieces ?? 1;
  const hist = new Int32Array(nx);
  for (let p = 0; p < maxPieces; p++) {
    hist.fill(0);
    let best = { area: 0, i0: 0, i1: 0, j0: 0, j1: 0 };
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) hist[i] = blk[j * nx + i] ? 0 : hist[i]! + 1;
      // largest rectangle in histogram (stack)
      const st: number[] = [];
      for (let i = 0; i <= nx; i++) {
        const h = i === nx ? 0 : hist[i]!;
        while (st.length && hist[st[st.length - 1]!]! >= h) {
          const top = st.pop()!;
          const height = hist[top]!;
          const left = st.length ? st[st.length - 1]! + 1 : 0;
          const width = i - left;
          const area = width * height;
          if (area > best.area) best = { area, i0: left, i1: i, j0: j - height + 1, j1: j + 1 };
        }
        st.push(i);
      }
    }
    if (best.area === 0) break;
    const r: Rect = {
      minX: lot.minX + best.i0 * cell,
      maxX: lot.minX + best.i1 * cell,
      minZ: lot.minZ + best.j0 * cell,
      maxZ: lot.minZ + best.j1 * cell,
    };
    if (r.maxX - r.minX < opts.minW || r.maxZ - r.minZ < opts.minD) {
      // may still fit rotated (min sizes are for the long/short axes); accept if either orientation works
      if (!(r.maxX - r.minX >= opts.minD && r.maxZ - r.minZ >= opts.minW)) break;
    }
    pieces.push(r);
    // mark the piece (plus a gap) as taken
    const g = Math.ceil(gap / cell);
    for (let j = Math.max(0, best.j0 - g); j < Math.min(nz, best.j1 + g); j++) {
      for (let i = Math.max(0, best.i0 - g); i < Math.min(nx, best.i1 + g); i++) blk[j * nx + i] = 1;
    }
  }
  return { pieces, blocked: reasons, total: nx * nz };
}

/** Is a point inside any footprint (inflated by `m`)? */
export function insideAny(x: number, z: number, rects: readonly Rect[], m: number): boolean {
  for (const r of rects) if (x > r.minX - m && x < r.maxX + m && z > r.minZ - m && z < r.maxZ + m) return true;
  return false;
}

/**
 * Occupancy grid over (a margin around) the town: cells blocked by the site rules (roads, rail, sea, mountain,
 * plaza, station) or already claimed by buildings. Used to find room for infill buildings quickly.
 */
export class OccGrid {
  private constructor(
    readonly minX: number,
    readonly minZ: number,
    readonly nx: number,
    readonly nz: number,
    readonly cell: number,
    readonly data: Uint8Array,
  ) {}

  static build(bounds: Rect, cell = 10): OccGrid {
    const nx = Math.ceil((bounds.maxX - bounds.minX) / cell);
    const nz = Math.ceil((bounds.maxZ - bounds.minZ) / cell);
    const data = new Uint8Array(nx * nz);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = bounds.minX + (i + 0.5) * cell;
        const z = bounds.minZ + (j + 0.5) * cell;
        if (siteBlock(x, z)) data[j * nx + i] = 1;
      }
    }
    return new OccGrid(bounds.minX, bounds.minZ, nx, nz, cell, data);
  }

  private range(r: Rect, infl: number): [number, number, number, number] | null {
    const i0 = Math.floor((r.minX - infl - this.minX) / this.cell);
    const i1 = Math.floor((r.maxX + infl - this.minX) / this.cell);
    const j0 = Math.floor((r.minZ - infl - this.minZ) / this.cell);
    const j1 = Math.floor((r.maxZ + infl - this.minZ) / this.cell);
    if (i0 < 0 || j0 < 0 || i1 >= this.nx || j1 >= this.nz) return null;
    return [i0, i1, j0, j1];
  }

  /** True if every cell touched by the rectangle (grown by `infl`) is free. */
  free(r: Rect, infl: number): boolean {
    const g = this.range(r, infl);
    if (!g) return false;
    for (let j = g[2]; j <= g[3]; j++) for (let i = g[0]; i <= g[1]; i++) if (this.data[j * this.nx + i]) return false;
    return true;
  }

  claim(r: Rect, infl: number): void {
    const g = this.range(r, infl);
    if (!g) return;
    for (let j = g[2]; j <= g[3]; j++) for (let i = g[0]; i <= g[1]; i++) this.data[j * this.nx + i] = 1;
  }
}
