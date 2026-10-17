import { ellipsoid } from '../life/geom';
import { foliageCluster } from './leaf';
import { roundedFoliage } from './topiary';
import { plantCards } from './greenery';
import type { CellName } from './leafcells';
import type { MeshBatch } from './batch';
import type { Ctx } from './ctx';
import type { Frame } from './frame';
import { quadUV, type UvRect } from './signs';
import { clamp, hex, type RGB, type V3 } from './util';

type RGBA = readonly [number, number, number, number];
export type Pt = readonly [number, number, number];
const WHITE: RGB = [1, 1, 1];
const UP: V3 = [0, 1, 0];

// unit icosahedron (same as the town batch's blobs)
const ICO_T = (1 + Math.sqrt(5)) / 2;
const ICO_V: V3[] = (
  [
    [-1, ICO_T, 0], [1, ICO_T, 0], [-1, -ICO_T, 0], [1, -ICO_T, 0],
    [0, -1, ICO_T], [0, 1, ICO_T], [0, -1, -ICO_T], [0, 1, -ICO_T],
    [ICO_T, 0, -1], [ICO_T, 0, 1], [-ICO_T, 0, -1], [-ICO_T, 0, 1],
  ] as V3[]
).map(([x, y, z]) => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l] as V3;
});
const ICO_F: [number, number, number][] = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

/** Per-face brightness of the self-lit interior boxes: a cheap stand-in for lighting (top brightest, bottom darkest). */
const FACE_LIGHT = { T: 1, F: 0.95, K: 0.84, R: 0.9, L: 0.8, B: 0.6 } as const;

/** Colours of the window glass: a little whiter and more mirror-like at the top, clearer at the bottom. */
export const GLASS_TOP: RGBA = [0.86, 0.94, 1, 0.52];
export const GLASS_BOTTOM: RGBA = [0.74, 0.88, 0.98, 0.3];

/**
 * Local-frame drawing for one detailed building: lit solid geometry (`m`, the town batch), picture and self-lit
 * geometry (`s`, the sign batch: shop interiors, signs, posters), and window glass (`g`). All coordinates are
 * local to the building's frame: u along the front (viewed from the street, +u is on the left), y up, v out of
 * the front.
 */
export class Kit {
  readonly m: MeshBatch;
  readonly s: MeshBatch;
  readonly g: MeshBatch;
  private readonly wuv: [number, number][];

  constructor(readonly c: Ctx, readonly f: Frame) {
    this.m = c.main.at(f.cx, f.cz);
    this.s = c.signs.at(f.cx, f.cz);
    this.g = c.glass.at(f.cx, f.cz);
    const w = c.atlas.white();
    this.wuv = [[w.u0, w.v0], [w.u0, w.v0], [w.u0, w.v0], [w.u0, w.v0]];
  }

  uv(key: string): UvRect {
    return this.c.atlas.uv(key);
  }

  // ---- lit solids (town batch) ------------------------------------------------------------------------------------

  box(u0: number, u1: number, y0: number, y1: number, v0: number, v1: number, col: RGB, o: { top?: RGB; bottom?: boolean; sides?: RGB } = {}): void {
    this.f.box(this.m, u0, u1, y0, y1, v0, v1, col, o);
  }

  /** Quad on the plane v = const (front or back wall piece). */
  fa(u0: number, u1: number, y0: number, y1: number, v: number, dir: 1 | -1, col: RGB): void {
    this.f.facade(this.m, u0, u1, y0, y1, v, dir, col);
  }

  /** Quad on the plane u = const (a side wall piece). */
  sd(v0: number, v1: number, y0: number, y1: number, u: number, dir: 1 | -1, col: RGB): void {
    this.f.side(this.m, v0, v1, y0, y1, u, dir, col);
  }

  /** Free quad given by four local points; `n` is the outward direction (local). */
  quad(a: Pt, b: Pt, c: Pt, d: Pt, col: RGB, n: Pt): void {
    const f = this.f;
    this.m.quad(f.pt(a[0], a[1], a[2]), f.pt(b[0], b[1], b[2]), f.pt(c[0], c[1], c[2]), f.pt(d[0], d[1], d[2]), col, f.dir(n[0], n[1], n[2]));
  }

  /** Vertical prism / cone centred at local (u, v). */
  cyl(u: number, v: number, y0: number, y1: number, r0: number, r1: number, sides: number, col: RGB, cap = true): void {
    const p = this.f.pt(u, 0, v);
    this.m.cylinder(p[0], p[2], y0, y1, r0, r1, sides, col, cap);
  }

  topiary(u: number, y: number, v: number, rx: number, ry: number, rz: number, col: RGB): void {
    const p = this.f.pt(u, y, v);
    roundedFoliage(this.c.topiary?.at(p[0], p[2]) ?? this.m, p[0], p[1], p[2], rx, ry, rz, col);
  }

  blob(u: number, y: number, v: number, rx: number, ry: number, rz: number, col: RGB, jitter = 0.08, seed = 0): void {
    const p = this.f.pt(u, y, v);
    if (this.c.foliage && col[1] > col[0] * 1.1 && col[1] > col[2] * 1.1 && rx > 1.5) {
      const radius = Math.max(rx, rz);
      foliageCluster(this.c.foliage.at(p[0], p[2]), p[0], p[1], p[2], radius, ry / radius, radius > 6 ? 'camphor' : 'hedgeA', seed % Math.PI);
    } else this.m.blob(p[0], p[1], p[2], rx, ry, rz, col, jitter, seed);
  }

  plant(u: number, y: number, v: number, size: number, cell: CellName): void {
    const p = this.f.pt(u, y, v); plantCards(this.c, p[0], p[1], p[2], size, cell, (u + v) % Math.PI);
  }

  /**
   * A wall slab between local u0..u1, y0..y1, v0..v1 with rectangular openings (u0,u1,y0,y1) left open:
   * piers between them, sills below and lintels above.
   */
  wall(u0: number, u1: number, y0: number, y1: number, v0: number, v1: number, col: RGB, openings: readonly (readonly [number, number, number, number])[], o: { sill?: RGB; lintel?: RGB } = {}): void {
    const sorted = [...openings].sort((a, b) => a[0] - b[0]);
    let cur = u0;
    for (const [a, b, ya, yb] of sorted) {
      if (a > cur) this.box(cur, a, y0, y1, v0, v1, col);
      if (ya > y0) this.box(a, b, y0, ya, v0, v1, o.sill ?? col);
      if (yb < y1) this.box(a, b, yb, y1, v0, v1, o.lintel ?? col);
      cur = b;
    }
    if (cur < u1) this.box(cur, u1, y0, y1, v0, v1, col);
  }

  // ---- self-lit solids and pictures (sign batch) ------------------------------------------------------------------

  private iq(a: V3, b: V3, c: V3, d: V3, col: RGB, k: number, n: V3): void {
    this.s.quad(a, b, c, d, [col[0] * k, col[1] * k, col[2] * k], n, this.wuv);
  }

  /** Box with fake lighting and no texture (interiors). `faces`: any of T B F K L R (K = back, F = front). */
  ibox(u0: number, u1: number, y0: number, y1: number, v0: number, v1: number, col: RGB, faces = 'TFKLR'): void {
    const p = (u: number, y: number, v: number): V3 => this.f.pt(u, y, v);
    const d = (du: number, dy: number, dv: number): V3 => this.f.dir(du, dy, dv);
    if (faces.includes('T')) this.iq(p(u0, y1, v0), p(u0, y1, v1), p(u1, y1, v1), p(u1, y1, v0), col, FACE_LIGHT.T, UP);
    if (faces.includes('B')) this.iq(p(u0, y0, v0), p(u1, y0, v0), p(u1, y0, v1), p(u0, y0, v1), col, FACE_LIGHT.B, [0, -1, 0]);
    if (faces.includes('F')) this.iq(p(u0, y0, v1), p(u1, y0, v1), p(u1, y1, v1), p(u0, y1, v1), col, FACE_LIGHT.F, d(0, 0, 1));
    if (faces.includes('K')) this.iq(p(u0, y0, v0), p(u0, y1, v0), p(u1, y1, v0), p(u1, y0, v0), col, FACE_LIGHT.K, d(0, 0, -1));
    if (faces.includes('R')) this.iq(p(u1, y0, v0), p(u1, y1, v0), p(u1, y1, v1), p(u1, y0, v1), col, FACE_LIGHT.R, d(1, 0, 0));
    if (faces.includes('L')) this.iq(p(u0, y0, v0), p(u0, y0, v1), p(u0, y1, v1), p(u0, y1, v0), col, FACE_LIGHT.L, d(-1, 0, 0));
  }

  /** Self-lit vertical prism / cone centred at local (u, v) (lamps, food, cups). */
  icyl(u: number, v: number, y0: number, y1: number, r0: number, r1: number, sides: number, col: RGB, cap = true): void {
    const p = this.f.pt(u, 0, v);
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);
      const am = (a0 + a1) / 2;
      const k = 0.78 + 0.22 * Math.cos(am - 0.9); // a little side-to-side shading
      const sc: RGB = [col[0] * k, col[1] * k, col[2] * k];
      this.s.quad(
        [p[0] + c0 * r0, y0, p[2] + s0 * r0], [p[0] + c1 * r0, y0, p[2] + s1 * r0],
        [p[0] + c1 * r1, y1, p[2] + s1 * r1], [p[0] + c0 * r1, y1, p[2] + s0 * r1],
        sc, [Math.cos(am), 0, Math.sin(am)], this.wuv,
      );
      if (cap && r1 > 0) this.s.tri([p[0], y1, p[2]], [p[0] + c0 * r1, y1, p[2] + s0 * r1], [p[0] + c1 * r1, y1, p[2] + s1 * r1], col, UP, this.wuv.slice(0, 3));
    }
  }

  /** Self-lit low-poly ball (lanterns, fruit, flowers); colours may exceed 1 to glow. */
  iblob(u: number, y: number, v: number, rx: number, ry: number, rz: number, col: RGB, jitter = 0.05, seed = 0): void {
    const p = this.f.pt(u, y, v);
    for (let n = 0; n < ICO_F.length; n++) {
      const [i, j, k2] = ICO_F[n]!;
      const q = [ICO_V[i]!, ICO_V[j]!, ICO_V[k2]!];
      const h = Math.sin((n + 1) * 12.9898 + seed * 78.233) * 43758.5453;
      const m = 1 + ((h - Math.floor(h)) - 0.5) * 2 * jitter;
      const pts = q.map((e): V3 => [p[0] + e[0] * rx, p[1] + e[1] * ry, p[2] + e[2] * rz]);
      const mid: V3 = [(q[0]![0] + q[1]![0] + q[2]![0]) / 3, (q[0]![1] + q[1]![1] + q[2]![1]) / 3, (q[0]![2] + q[1]![2] + q[2]![2]) / 3];
      this.s.tri(pts[0]!, pts[1]!, pts[2]!, [col[0] * m, col[1] * m, col[2] * m], mid, this.wuv.slice(0, 3));
    }
  }

  /** Rounded display sweets, with baked soft shading and the atlas white texel. */
  iball(u: number, y: number, v: number, rx: number, ry: number, rz: number, color: RGB): void {
    const p = this.f.pt(u, y, v), first = this.s.vertexCount;
    const swap = Math.abs(this.f.fx) === 1;
    ellipsoid(this.s, p[0], p[1], p[2], swap ? rz : rx, ry, swap ? rx : rz, color, { seg: 8, rings: 4, smooth: true });
    for (let i = first; i < this.s.vertexCount; i++) {
      this.s.uvs[i * 2] = this.wuv[0]![0]; this.s.uvs[i * 2 + 1] = this.wuv[0]![1];
      const shade = .88 + .12 * this.s.nor[i * 3 + 1]!;
      for (let c = 0; c < 3; c++) this.s.col[i * 4 + c]! *= shade;
    }
  }

  /** Plain self-lit quad on the plane v = const (an interior wall), facing `dir`. */
  ifa(u0: number, u1: number, y0: number, y1: number, v: number, dir: 1 | -1, col: RGB): void {
    const p = (u: number, y: number): V3 => this.f.pt(u, y, v);
    this.iq(p(u0, y0), p(u1, y0), p(u1, y1), p(u0, y1), col, dir > 0 ? FACE_LIGHT.F : FACE_LIGHT.K, this.f.dir(0, 0, dir));
  }

  /** Plain self-lit quad on the plane u = const, facing `dir` (+1: towards +u). */
  isd(v0: number, v1: number, y0: number, y1: number, u: number, dir: 1 | -1, col: RGB): void {
    const p = (v: number, y: number): V3 => this.f.pt(u, y, v);
    this.iq(p(v0, y0), p(v1, y0), p(v1, y1), p(v0, y1), col, dir > 0 ? FACE_LIGHT.R : FACE_LIGHT.L, this.f.dir(dir, 0, 0));
  }

  /** Plain self-lit horizontal quad; `up` = facing up (a floor) or down (a ceiling). */
  ihz(u0: number, u1: number, v0: number, v1: number, y: number, up: boolean, col: RGB): void {
    const p = (u: number, v: number): V3 => this.f.pt(u, y, v);
    this.iq(p(u0, v0), p(u1, v0), p(u1, v1), p(u0, v1), col, up ? FACE_LIGHT.T : 0.9, up ? UP : [0, -1, 0]);
  }

  /** Picture on the plane v = const, readable by a viewer on the `dir` side. */
  tf(uv: UvRect, u0: number, u1: number, y0: number, y1: number, v: number, dir: 1 | -1, tint: RGB = WHITE): void {
    const l = dir > 0 ? u1 : u0;
    const r = dir > 0 ? u0 : u1;
    const p = (u: number, y: number): V3 => this.f.pt(u, y, v);
    this.s.quad(p(l, y0), p(r, y0), p(r, y1), p(l, y1), tint, this.f.dir(0, 0, dir), quadUV(uv));
  }

  /** Picture on the plane u = const, readable by a viewer on the `dir` side (+1: at larger u). */
  ts(uv: UvRect, v0: number, v1: number, y0: number, y1: number, u: number, dir: 1 | -1, tint: RGB = WHITE): void {
    const l = dir > 0 ? v0 : v1;
    const r = dir > 0 ? v1 : v0;
    const p = (v: number, y: number): V3 => this.f.pt(u, y, v);
    this.s.quad(p(l, y0), p(r, y0), p(r, y1), p(l, y1), tint, this.f.dir(dir, 0, 0), quadUV(uv));
  }

  /** A curtain or banner attached along its top edge; ordinary signs still use tf/ts. */
  clothFront(uv: UvRect, u0: number, u1: number, y0: number, y1: number, v: number, dir: 1 | -1): void {
    if (!this.c.cloth) { this.tf(uv, u0, u1, y0, y1, v, dir); return; }
    const l = dir > 0 ? u1 : u0, r = dir > 0 ? u0 : u1;
    this.c.cloth.panel([this.f.pt(l, y0, v), this.f.pt(r, y0, v), this.f.pt(r, y1, v), this.f.pt(l, y1, v)], this.f.dir(0, 0, dir), uv);
  }

  clothSide(uv: UvRect, v0: number, v1: number, y0: number, y1: number, u: number, dir: 1 | -1): void {
    if (!this.c.cloth) { this.ts(uv, v0, v1, y0, y1, u, dir); return; }
    const l = dir > 0 ? v0 : v1, r = dir > 0 ? v1 : v0;
    this.c.cloth.panel([this.f.pt(u, y0, l), this.f.pt(u, y0, r), this.f.pt(u, y1, r), this.f.pt(u, y1, l)], this.f.dir(dir, 0, 0), uv, dir > 0 ? -1 : 1);
  }

  /** Picture on a free quad given by four local points: bottom-left, bottom-right, top-right, top-left as the viewer sees it. */
  tq(uv: UvRect, bl: Pt, br: Pt, tr: Pt, tl: Pt, n: Pt, tint: RGB = WHITE): void {
    const f = this.f;
    this.s.quad(f.pt(bl[0], bl[1], bl[2]), f.pt(br[0], br[1], br[2]), f.pt(tr[0], tr[1], tr[2]), f.pt(tl[0], tl[1], tl[2]), tint, f.dir(n[0], n[1], n[2]), quadUV(uv));
  }

  /** Picture on a horizontal quad: texture x runs along +u, texture y along +v. */
  th(uv: UvRect, u0: number, u1: number, v0: number, v1: number, y: number, up: boolean, tint: RGB = WHITE): void {
    const p = (u: number, v: number): V3 => this.f.pt(u, y, v);
    this.s.quad(p(u0, v0), p(u1, v0), p(u1, v1), p(u0, v1), tint, up ? UP : [0, -1, 0], [[uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1]]);
  }

  /** The same picture tiled `nu` x `nv` times over a horizontal rectangle. */
  thTiled(uv: UvRect, u0: number, u1: number, v0: number, v1: number, y: number, up: boolean, nu: number, nv: number, tint: RGB = WHITE): void {
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        this.th(uv, u0 + ((u1 - u0) * i) / nu, u0 + ((u1 - u0) * (i + 1)) / nu, v0 + ((v1 - v0) * j) / nv, v0 + ((v1 - v0) * (j + 1)) / nv, y, up, tint);
      }
    }
  }

  // ---- window glass -----------------------------------------------------------------------------------------------

  private tintLast(b: MeshBatch, from: number, y0: number, y1: number, bottom: RGBA, top: RGBA): void {
    for (let j = from; j < b.vertexCount; j++) {
      const t = clamp((b.pos[j * 3 + 1]! - y0) / (y1 - y0), 0, 1);
      for (let k = 0; k < 4; k++) b.col[j * 4 + k] = bottom[k]! + (top[k]! - bottom[k]!) * t;
    }
  }

  /** Window glass on the plane v = const. */
  pane(u0: number, u1: number, y0: number, y1: number, v: number, o: { top?: RGBA; bottom?: RGBA } = {}): void {
    const L = 140;
    const n0 = this.g.vertexCount;
    const p = (u: number, y: number): V3 => this.f.pt(u, y, v);
    this.g.quad(p(u0, y0), p(u1, y0), p(u1, y1), p(u0, y1), WHITE, this.f.dir(0, 0, 1), [[u0 / L, y0 / L], [u1 / L, y0 / L], [u1 / L, y1 / L], [u0 / L, y1 / L]]);
    this.tintLast(this.g, n0, y0, y1, o.bottom ?? GLASS_BOTTOM, o.top ?? GLASS_TOP);
  }
}

/** A horizontal slice (a..b of the width) of a picture. */
export const slice = (uv: UvRect, a: number, b: number): UvRect => ({
  u0: uv.u0 + (uv.u1 - uv.u0) * a,
  u1: uv.u0 + (uv.u1 - uv.u0) * b,
  v0: uv.v0,
  v1: uv.v1,
});

/** A のぼり banner on a pole, its cloth turned to face along the street (the way people walk past it). */
export function nobori(k: Kit, u: number, v: number, key: string, h = 30): void {
  k.cyl(u, v, 0, h, 0.45, 0.4, 5, hex(0x8a8f96));
  k.box(u - 0.3, u + 0.3, h - 1, h, v - 0.3, v + 6.4, hex(0x8a8f96)); // arm
  k.clothSide(k.uv(key), v + 0.3, v + 6.1, h - 24, h - 1, u + 0.2, 1);
  k.clothSide(k.uv(key), v + 0.3, v + 6.1, h - 24, h - 1, u - 0.2, -1);
}

