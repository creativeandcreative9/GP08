import type { MeshBatch } from './batch';
import type { RGB, V3 } from './util';

/**
 * Small geometry helpers for street furniture (poles, signs, bicycles...). Unlike `Frame` (which only knows the
 * four axis-aligned orientations) these work in any yaw, because roads run in any direction.
 * Everything is flat-shaded triangles in a `MeshBatch`; the vertex count of each helper is noted so that the
 * budget of the town stays visible.
 */

const UPV: V3 = [0, 1, 0];

/** Per-face colours of a box: a colour overrides, `false` leaves the face out (hidden faces cost vertices). */
export interface BoxFaces {
  top?: RGB | false;
  /** `true` = same colour as the sides. Omitted by default (nobody looks at the underside). */
  bottom?: RGB | boolean;
  front?: RGB | false;
  back?: RGB | false;
  left?: RGB | false;
  right?: RGB | false;
  /** Colour of left/right/front/back unless given individually. */
  sides?: RGB;
}

/**
 * A local frame at (x, y, z) with the front pointing along the unit vector (fx, fz): `u` runs to the right
 * when facing the front, `v` runs to the front, `y` is up (the same convention as `Frame`, but any yaw).
 */
export class Fx {
  readonly rx: number;
  readonly rz: number;
  readonly fx: number;
  readonly fz: number;
  constructor(readonly x: number, readonly y: number, readonly z: number, fx: number, fz: number) {
    const l = Math.hypot(fx, fz) || 1;
    this.fx = fx / l;
    this.fz = fz / l;
    this.rx = this.fz;
    this.rz = -this.fx;
  }

  /** Local (u, y, v) -> world point. */
  p(u: number, y: number, v: number): V3 {
    return [this.x + this.rx * u + this.fx * v, this.y + y, this.z + this.rz * u + this.fz * v];
  }

  /** Local direction -> world direction. */
  d(du: number, dy: number, dv: number): V3 {
    return [this.rx * du + this.fx * dv, dy, this.rz * du + this.fz * dv];
  }

  /** Box in local coordinates: 5 quads (30 vertices) by default. */
  box(b: MeshBatch, u0: number, u1: number, y0: number, y1: number, v0: number, v1: number, color: RGB, o: BoxFaces = {}): void {
    const side = o.sides ?? color;
    if (o.top !== false) b.quad(this.p(u0, y1, v0), this.p(u1, y1, v0), this.p(u1, y1, v1), this.p(u0, y1, v1), o.top ?? color, UPV);
    if (o.bottom) b.quad(this.p(u0, y0, v0), this.p(u1, y0, v0), this.p(u1, y0, v1), this.p(u0, y0, v1), o.bottom === true ? side : o.bottom, [0, -1, 0]);
    if (o.front !== false) b.quad(this.p(u0, y0, v1), this.p(u1, y0, v1), this.p(u1, y1, v1), this.p(u0, y1, v1), o.front ?? side, this.d(0, 0, 1));
    if (o.back !== false) b.quad(this.p(u0, y0, v0), this.p(u0, y1, v0), this.p(u1, y1, v0), this.p(u1, y0, v0), o.back ?? side, this.d(0, 0, -1));
    if (o.right !== false) b.quad(this.p(u1, y0, v0), this.p(u1, y1, v0), this.p(u1, y1, v1), this.p(u1, y0, v1), o.right ?? side, this.d(1, 0, 0));
    if (o.left !== false) b.quad(this.p(u0, y0, v0), this.p(u0, y0, v1), this.p(u0, y1, v1), this.p(u0, y1, v0), o.left ?? side, this.d(-1, 0, 0));
  }

  /** Upright quad on the plane v = const, facing +v (dir 1) or -v (dir -1). */
  facade(b: MeshBatch, u0: number, u1: number, y0: number, y1: number, v: number, dir: 1 | -1, color: RGB): void {
    b.quad(this.p(u0, y0, v), this.p(u1, y0, v), this.p(u1, y1, v), this.p(u0, y1, v), color, this.d(0, 0, dir));
  }

  /** Horizontal quad at height y facing up. */
  floor(b: MeshBatch, u0: number, u1: number, v0: number, v1: number, y: number, color: RGB): void {
    b.quad(this.p(u0, y, v0), this.p(u1, y, v0), this.p(u1, y, v1), this.p(u0, y, v1), color, UPV);
  }
}

export interface TubeOpts {
  /** Start angle of the first corner (radians). */
  phase?: number;
}

/** Open prism/cone between two points, `n` sides, radius r0 at `p0` and r1 at `p1`: 6n vertices (no caps). */
export function tube(b: MeshBatch, p0: V3, p1: V3, r0: number, r1: number, n: number, color: RGB, o: TubeOpts = {}): void {
  let ax = p1[0] - p0[0];
  let ay = p1[1] - p0[1];
  let az = p1[2] - p0[2];
  const l = Math.hypot(ax, ay, az);
  if (l < 1e-6) return;
  ax /= l;
  ay /= l;
  az /= l;
  // helper vector (hx, hy, 0) not parallel to the axis: up, or +x when the axis is nearly vertical
  const hx = Math.abs(ay) < 0.9 ? 0 : 1;
  const hy = 1 - hx;
  // e1 = axis x helper, e2 = axis x e1
  let e1x = -az * hy;
  let e1y = az * hx;
  let e1z = ax * hy - ay * hx;
  const e1l = Math.hypot(e1x, e1y, e1z) || 1;
  e1x /= e1l;
  e1y /= e1l;
  e1z /= e1l;
  const e2x = ay * e1z - az * e1y;
  const e2y = az * e1x - ax * e1z;
  const e2z = ax * e1y - ay * e1x;
  const ph = o.phase ?? 0;
  const ring = (base: V3, r: number): V3[] => {
    const out: V3[] = [];
    for (let i = 0; i < n; i++) {
      const a = ph + (i / n) * Math.PI * 2;
      const c = Math.cos(a) * r;
      const s = Math.sin(a) * r;
      out.push([base[0] + e1x * c + e2x * s, base[1] + e1y * c + e2y * s, base[2] + e1z * c + e2z * s]);
    }
    return out;
  };
  const A = ring(p0, r0);
  const B = ring(p1, r1);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const am = ph + ((i + 0.5) / n) * Math.PI * 2;
    const c = Math.cos(am);
    const s = Math.sin(am);
    b.quad(A[i]!, A[j]!, B[j]!, B[i]!, color, [e1x * c + e2x * s, e1y * c + e2y * s, e1z * c + e2z * s]);
  }
}

/** Flat-shaded octahedron "puff" (foliage, flowers): 8 triangles = 24 vertices. `j` jitters the radii. */
export function puff(b: MeshBatch, x: number, y: number, z: number, rx: number, ry: number, rz: number, color: RGB, j = 0): void {
  const k = (s: number): number => 1 + (Math.sin(j * 12.9898 + s * 78.233) * 43758.5453 % 1) * 0.18;
  const top: V3 = [x, y + ry * k(1), z];
  const bot: V3 = [x, y - ry * 0.55, z];
  const e: V3[] = [
    [x + rx * k(2), y, z],
    [x, y, z + rz * k(3)],
    [x - rx * k(4), y, z],
    [x, y, z - rz * k(5)],
  ];
  for (let i = 0; i < 4; i++) {
    const a = e[i]!;
    const c = e[(i + 1) % 4]!;
    const mx = (a[0] + c[0]) / 2 - x;
    const mz = (a[2] + c[2]) / 2 - z;
    b.tri(top, a, c, color, [mx, 0.8, mz]);
    // the underside is shaded darker so that a foliage ball does not look flat
    b.tri(bot, c, a, [color[0] * 0.78, color[1] * 0.78, color[2] * 0.78], [mx, -0.8, mz]);
  }
}

export interface FaceUv {
  /** Centre and half extent of the circle/rectangle in uv space. */
  cu: number;
  cv: number;
  ru: number;
  rv: number;
}

/**
 * Round (or n-gon) face looking along N (towards the viewer), with up vector U: a fan of n triangles.
 * With `uv` the disc is textured with the matching circle of a sprite tile.
 */
export function discFace(b: MeshBatch, c: V3, N: V3, U: V3, r: number, n: number, color: RGB, uv?: FaceUv): void {
  const R = cross(N, U);
  const pt = (a: number): V3 => [c[0] + (R[0] * Math.cos(a) + U[0] * Math.sin(a)) * r, c[1] + (R[1] * Math.cos(a) + U[1] * Math.sin(a)) * r, c[2] + (R[2] * Math.cos(a) + U[2] * Math.sin(a)) * r];
  const tuv = (a: number): [number, number] => [uv!.cu + Math.cos(a) * uv!.ru, uv!.cv + Math.sin(a) * uv!.rv];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    b.tri(c, pt(a0), pt(a1), color, N, uv ? [[uv.cu, uv.cv], tuv(a0), tuv(a1)] : undefined);
  }
}

/** Flat ring (annulus) in the plane with normal N: n quads = 6n vertices (bicycle wheels, mirror rims). */
export function annulus(b: MeshBatch, c: V3, N: V3, U: V3, rOut: number, rIn: number, n: number, color: RGB): void {
  const R = cross(N, U);
  const pt = (a: number, r: number): V3 => [c[0] + (R[0] * Math.cos(a) + U[0] * Math.sin(a)) * r, c[1] + (R[1] * Math.cos(a) + U[1] * Math.sin(a)) * r, c[2] + (R[2] * Math.cos(a) + U[2] * Math.sin(a)) * r];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    b.quad(pt(a0, rOut), pt(a1, rOut), pt(a1, rIn), pt(a0, rIn), color, N);
  }
}

/** Triangle face for a sprite: corners in the viewer's frame (right, up) with their uv. */
export function sprite(
  b: MeshBatch, c: V3, N: V3, U: V3,
  pts: readonly [number, number][], uvs: readonly [number, number][], color: RGB = [1, 1, 1],
): void {
  const R = cross(N, U);
  const w = (p: [number, number]): V3 => [c[0] + R[0] * p[0] + U[0] * p[1], c[1] + R[1] * p[0] + U[1] * p[1], c[2] + R[2] * p[0] + U[2] * p[1]];
  for (let i = 1; i + 1 < pts.length; i++) {
    b.tri(w(pts[0]!), w(pts[i]!), w(pts[i + 1]!), color, N, [uvs[0]!, uvs[i]!, uvs[i + 1]!]);
  }
}

/** Textured rectangle facing N (towards the viewer) with up vector U, centred at c. */
export function signQuad(b: MeshBatch, c: V3, N: V3, U: V3, w: number, h: number, uv: { u0: number; v0: number; u1: number; v1: number }): void {
  const R = cross(N, U);
  const hw = w / 2;
  const hh = h / 2;
  const q = (sx: number, sy: number): V3 => [c[0] + R[0] * hw * sx + U[0] * hh * sy, c[1] + R[1] * hw * sx + U[1] * hh * sy, c[2] + R[2] * hw * sx + U[2] * hh * sy];
  b.quad(q(-1, -1), q(1, -1), q(1, 1), q(-1, 1), [1, 1, 1], N, [
    [uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1],
  ]);
}

/** Plain rectangle facing N (towards the viewer) with up vector U, centred at c: a board, or the back of a sign. */
export function panel(b: MeshBatch, c: V3, N: V3, U: V3, w: number, h: number, color: RGB): void {
  const R = cross(N, U);
  const hw = w / 2;
  const hh = h / 2;
  const q = (sx: number, sy: number): V3 => [c[0] + R[0] * hw * sx + U[0] * hh * sy, c[1] + R[1] * hw * sx + U[1] * hh * sy, c[2] + R[2] * hw * sx + U[2] * hh * sy];
  b.quad(q(-1, -1), q(1, -1), q(1, 1), q(-1, 1), color, N);
}

/** Cross product in Babylon's left-handed system: viewer's right = N x U (see signQuad). */
export function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/**
 * A thin wire (or cable) along a polyline: a single ribbon tilted by `tilt` radians from the horizontal, so
 * that it stays visible both from the side and from below (6 vertices per segment).
 */
export function ribbon(b: MeshBatch, pts: readonly V3[], width: number, color: RGB, tilt = Math.PI / 4): void {
  const h = width / 2;
  const cs = Math.cos(tilt) * h;
  const sn = Math.sin(tilt) * h;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const c = pts[i + 1]!;
    let dx = c[0] - a[0];
    let dz = c[2] - a[2];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    // horizontal normal (-dz, dx)
    const ox = -dz * cs;
    const oz = dx * cs;
    b.quad(
      [a[0] - ox, a[1] - sn, a[2] - oz], [c[0] - ox, c[1] - sn, c[2] - oz],
      [c[0] + ox, c[1] + sn, c[2] + oz], [a[0] + ox, a[1] + sn, a[2] + oz],
      color, UPV,
    );
  }
}

/** Sag curve between two points: `n` segments, drooping by `sag` in the middle. */
export function catenary(a: V3, c: V3, sag: number, n: number): V3[] {
  const out: V3[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    out.push([a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (c[2] - a[2]) * t]);
  }
  return out;
}

/**
 * The uv rectangle of tile `k` (of `n` equal tiles side by side) of an atlas cell, shrunk by `insetU`/`insetV`
 * uv units on every side (keeps bilinear filtering from reaching into the neighbouring tile).
 */
export function tileUv(
  r: { u0: number; v0: number; u1: number; v1: number }, k: number, n: number, insetU = 0, insetV = 0,
): { u0: number; v0: number; u1: number; v1: number } {
  const w = (r.u1 - r.u0) / n;
  return { u0: r.u0 + w * k + insetU, u1: r.u0 + w * (k + 1) - insetU, v0: r.v0 + insetV, v1: r.v1 - insetV };
}
