import type { MeshBatch } from '../town/batch';
import type { RGB, V3 } from '../town/util';

/**
 * Small solid-shape helpers on top of `MeshBatch` for the cars and people: every face gets its outward direction
 * from its position relative to the centre of the (convex) shape, so winding and normals come out right.
 */

export const v3 = (x: number, y: number, z: number): V3 => [x, y, z];

const mid = (pts: readonly V3[]): V3 => {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
    z += p[2];
  }
  const n = pts.length;
  return [x / n, y / n, z / n];
};

/** Quad whose outward side faces away from `c`. */
export function faceQuad(b: MeshBatch, p0: V3, p1: V3, p2: V3, p3: V3, color: RGB, c: V3): void {
  const m = mid([p0, p1, p2, p3]);
  b.quad(p0, p1, p2, p3, color, [m[0] - c[0], m[1] - c[1], m[2] - c[2]]);
}

/** Triangle whose outward side faces away from `c`. */
export function faceTri(b: MeshBatch, p0: V3, p1: V3, p2: V3, color: RGB, c: V3): void {
  const m = mid([p0, p1, p2]);
  b.tri(p0, p1, p2, color, [m[0] - c[0], m[1] - c[1], m[2] - c[2]]);
}

/** Convex polygon (fan from its centroid) facing `hint`. */
export function fan(b: MeshBatch, pts: readonly V3[], color: RGB, hint: V3): void {
  const m = mid(pts);
  for (let i = 0; i < pts.length; i++) b.tri(m, pts[i]!, pts[(i + 1) % pts.length]!, color, hint);
}

/** Band of quads between two equally long rings (closed), facing away from `c`. `col` may vary per face. */
export function band(b: MeshBatch, r0: readonly V3[], r1: readonly V3[], col: RGB | ((i: number) => RGB), c: V3, closed = true): void {
  const n = r0.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const j = (i + 1) % n;
    faceQuad(b, r0[i]!, r0[j]!, r1[j]!, r1[i]!, typeof col === 'function' ? col(i) : col, c);
  }
}

export interface Rect4 {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface FaceColors {
  top?: RGB;
  bottom?: RGB;
  front?: RGB; // +z
  back?: RGB; // -z
  left?: RGB; // -x
  right?: RGB; // +x
}

/** Box whose top and bottom rectangles differ (a frustum with axis-aligned sides). */
export function taperBox(b: MeshBatch, y0: number, y1: number, bot: Rect4, top: Rect4, color: RGB, o: FaceColors = {}): void {
  const c: V3 = [(bot.x0 + bot.x1 + top.x0 + top.x1) / 4, (y0 + y1) / 2, (bot.z0 + bot.z1 + top.z0 + top.z1) / 4];
  const B: V3[] = [
    [bot.x0, y0, bot.z0],
    [bot.x1, y0, bot.z0],
    [bot.x1, y0, bot.z1],
    [bot.x0, y0, bot.z1],
  ];
  const T: V3[] = [
    [top.x0, y1, top.z0],
    [top.x1, y1, top.z0],
    [top.x1, y1, top.z1],
    [top.x0, y1, top.z1],
  ];
  faceQuad(b, T[0]!, T[3]!, T[2]!, T[1]!, o.top ?? color, c);
  if (o.bottom) faceQuad(b, B[0]!, B[1]!, B[2]!, B[3]!, o.bottom, c);
  faceQuad(b, B[2]!, B[3]!, T[3]!, T[2]!, o.front ?? color, c); // +z
  faceQuad(b, B[0]!, B[1]!, T[1]!, T[0]!, o.back ?? color, c); // -z
  faceQuad(b, B[0]!, B[3]!, T[3]!, T[0]!, o.left ?? color, c); // -x
  faceQuad(b, B[1]!, B[2]!, T[2]!, T[1]!, o.right ?? color, c); // +x
}

/** Axis-aligned box from centre and half sizes. */
export function boxC(b: MeshBatch, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, color: RGB, o: FaceColors = {}): void {
  taperBox(b, cy - hy, cy + hy, { x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz }, { x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz }, color, o);
}

/** One level of an octagonal body section: half width `a` (x), half depth `c` (z), chamfer `k`, centre offset (cx, cz). */
export interface Oct {
  y: number;
  a: number;
  c: number;
  k: number;
  cx?: number;
  cz?: number;
}

/** The eight corners of an octagon section. Face i runs from corner i to corner i+1; face 7 is the front (+z), 3 the back, 1 the right (+x), 5 the left. */
export function octRing(s: Oct): V3[] {
  const cx = s.cx ?? 0;
  const cz = s.cz ?? 0;
  const { a, c, k, y } = s;
  return [
    [cx + (a - k), y, cz + c],
    [cx + a, y, cz + (c - k)],
    [cx + a, y, cz - (c - k)],
    [cx + (a - k), y, cz - c],
    [cx - (a - k), y, cz - c],
    [cx - a, y, cz - (c - k)],
    [cx - a, y, cz + (c - k)],
    [cx - (a - k), y, cz + c],
  ];
}

export interface OctColors {
  front?: RGB;
  back?: RGB;
  left?: RGB;
  right?: RGB;
  top?: RGB;
  bottom?: RGB;
}

/** Octagonal frustum between two sections. */
export function octBand(b: MeshBatch, s0: Oct, s1: Oct, color: RGB, o: OctColors = {}): void {
  const r0 = octRing(s0);
  const r1 = octRing(s1);
  const c: V3 = [((s0.cx ?? 0) + (s1.cx ?? 0)) / 2, (s0.y + s1.y) / 2, ((s0.cz ?? 0) + (s1.cz ?? 0)) / 2];
  band(
    b,
    r0,
    r1,
    (i) => {
      if (i === 7) return o.front ?? color;
      if (i === 3) return o.back ?? color;
      if (i === 5) return o.left ?? color;
      if (i === 1) return o.right ?? color;
      if (i === 0 || i === 6) return o.front ?? color;
      return o.back ?? color;
    },
    c,
  );
  if (o.top) fan(b, r1, o.top, [0, 1, 0]);
  if (o.bottom) fan(b, r0, o.bottom, [0, -1, 0]);
}

export interface EllipsoidOpts {
  seg?: number;
  rings?: number;
  /** Rings to draw: from `ringFrom` (0 = top pole) to `ringTo` (rings = bottom pole). */
  ringFrom?: number;
  ringTo?: number;
  /** Segment range (of `seg`) to draw, e.g. only the back half for hair. */
  segFrom?: number;
  segTo?: number;
  /** Rotation of the first segment boundary, in segments (0.5 puts a flat facet at the front). */
  phase?: number;
  /** Brightness variation per facet (0 = flat colour). */
  jitter?: number;
  seed?: number;
  /** Colour override per facet: (ring, segment, centre height 0..1 from top) => colour. */
  facetColor?: (ring: number, seg: number) => RGB | undefined;
}

const hash = (a: number, b: number, s: number): number => {
  const h = Math.sin(a * 12.9898 + b * 78.233 + s * 37.719) * 43758.5453;
  return h - Math.floor(h);
};

/** Faceted ellipsoid (or a cap / half shell of one). Segment 0 faces +z, increasing towards +x. */
export function ellipsoid(b: MeshBatch, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, color: RGB, o: EllipsoidOpts = {}): void {
  const seg = o.seg ?? 8;
  const rings = o.rings ?? 4;
  const r0 = o.ringFrom ?? 0;
  const r1 = o.ringTo ?? rings;
  const s0 = o.segFrom ?? 0;
  const s1 = o.segTo ?? seg;
  const phase = o.phase ?? 0.5;
  const jit = o.jitter ?? 0;
  const c: V3 = [cx, cy, cz];
  const P = (j: number, k: number): V3 => {
    const th = (Math.PI * j) / rings;
    const ph = ((k + phase) * Math.PI * 2) / seg;
    const st = Math.sin(th);
    return [cx + rx * st * Math.sin(ph), cy + ry * Math.cos(th), cz + rz * st * Math.cos(ph)];
  };
  const tint = (j: number, k: number): RGB => {
    const f = o.facetColor?.(j, k);
    const base = f ?? color;
    if (jit === 0) return base;
    const m = 1 + (hash(j, k, o.seed ?? 0) - 0.5) * 2 * jit;
    return [Math.min(1, base[0] * m), Math.min(1, base[1] * m), Math.min(1, base[2] * m)];
  };
  for (let j = r0; j < r1; j++) {
    for (let k = s0; k < s1; k++) {
      const a = P(j, k);
      const bb = P(j, k + 1);
      const cc = P(j + 1, k + 1);
      const d = P(j + 1, k);
      const col = tint(j, k);
      if (j === 0) faceTri(b, a, cc, d, col, c);
      else if (j === rings - 1) faceTri(b, a, bb, d, col, c);
      else faceQuad(b, a, bb, cc, d, col, c);
    }
  }
}

export interface PrismOpts {
  cap0?: RGB | false;
  cap1?: RGB | false;
  /** Vertical squash of the cross-section (1 = round). */
  ratio?: number;
  /** Rotation of the first corner, radians. */
  rot?: number;
  /** Colour per side face. */
  sideColor?: (i: number) => RGB;
}

/** Prism (or cone frustum) along an arbitrary axis from p0 (radius r0) to p1 (radius r1). */
export function prism(b: MeshBatch, p0: V3, p1: V3, r0: number, r1: number, sides: number, color: RGB, o: PrismOpts = {}): void {
  let ax = p1[0] - p0[0];
  let ay = p1[1] - p0[1];
  let az = p1[2] - p0[2];
  const L = Math.hypot(ax, ay, az) || 1;
  ax /= L;
  ay /= L;
  az /= L;
  // a vector not parallel to the axis
  const hx = Math.abs(ay) < 0.9 ? 0 : 1;
  const hy = Math.abs(ay) < 0.9 ? 1 : 0;
  // u = axis x helper, v = axis x u
  let ux = ay * 0 - az * hy;
  let uy = az * hx - ax * 0;
  let uz = ax * hy - ay * hx;
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul;
  uy /= ul;
  uz /= ul;
  const vx = ay * uz - az * uy;
  const vy = az * ux - ax * uz;
  const vz = ax * uy - ay * ux;
  const ratio = o.ratio ?? 1;
  const rot = o.rot ?? 0;
  const ring = (p: V3, r: number): V3[] => {
    const out: V3[] = [];
    for (let i = 0; i < sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2;
      const cu = Math.cos(a) * r;
      const sv = Math.sin(a) * r * ratio;
      out.push([p[0] + ux * cu + vx * sv, p[1] + uy * cu + vy * sv, p[2] + uz * cu + vz * sv]);
    }
    return out;
  };
  const A = ring(p0, r0);
  const B = ring(p1, r1);
  const c: V3 = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
  band(b, A, B, o.sideColor ?? color, c);
  if (o.cap0 !== false && r0 > 0) fan(b, A, o.cap0 ?? color, [-ax, -ay, -az]);
  if (o.cap1 !== false && r1 > 0) fan(b, B, o.cap1 ?? color, [ax, ay, az]);
}

/** A flat rectangle (plate, light, window decal) centred at `c`, spanned by the half vectors `u` and `v`, facing `n`. */
export function plate(b: MeshBatch, c: V3, u: V3, v: V3, color: RGB, n: V3): void {
  b.quad(
    [c[0] - u[0] - v[0], c[1] - u[1] - v[1], c[2] - u[2] - v[2]],
    [c[0] + u[0] - v[0], c[1] + u[1] - v[1], c[2] + u[2] - v[2]],
    [c[0] + u[0] + v[0], c[1] + u[1] + v[1], c[2] + u[2] + v[2]],
    [c[0] - u[0] + v[0], c[1] - u[1] + v[1], c[2] - u[2] + v[2]],
    color,
    n,
  );
}

/** Regular polygon disc in a plane through `c` spanned by unit vectors `u`,`v`, facing `n`; corner colours may alternate. */
export function disc(b: MeshBatch, c: V3, u: V3, v: V3, r: number, sides: number, color: RGB | ((i: number) => RGB), n: V3, rot = 0): void {
  for (let i = 0; i < sides; i++) {
    const a0 = rot + (i / sides) * Math.PI * 2;
    const a1 = rot + ((i + 1) / sides) * Math.PI * 2;
    const p0: V3 = [c[0] + (u[0] * Math.cos(a0) + v[0] * Math.sin(a0)) * r, c[1] + (u[1] * Math.cos(a0) + v[1] * Math.sin(a0)) * r, c[2] + (u[2] * Math.cos(a0) + v[2] * Math.sin(a0)) * r];
    const p1: V3 = [c[0] + (u[0] * Math.cos(a1) + v[0] * Math.sin(a1)) * r, c[1] + (u[1] * Math.cos(a1) + v[1] * Math.sin(a1)) * r, c[2] + (u[2] * Math.cos(a1) + v[2] * Math.sin(a1)) * r];
    b.tri(c, p0, p1, typeof color === 'function' ? color(i) : color, n);
  }
}

export const shadeRGB = (c: RGB, f: number): RGB => [Math.min(1, c[0] * f), Math.min(1, c[1] * f), Math.min(1, c[2] * f)];
export const mixRGB = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Appends a copy of `src` translated by (dx, dy, dz) to `dst` (to fuse separately built parts into one mesh). */
export function mergeInto(dst: MeshBatch, src: MeshBatch, dx: number, dy: number, dz: number): void {
  const base = dst.vertexCount;
  for (let i = 0; i < src.pos.length; i += 3) dst.pos.push(src.pos[i]! + dx, src.pos[i + 1]! + dy, src.pos[i + 2]! + dz);
  for (const n of src.nor) dst.nor.push(n);
  for (const c of src.col) dst.col.push(c);
  for (const i of src.idx) dst.idx.push(base + i);
}
