import type { MeshBatch } from './batch';
import type { Frame } from './frame';
import { clamp, makeRng, type RGB, type V3 } from './util';

/**
 * Drawing kit for the detailed houses and apartments.
 *
 * Everything here writes into a {@link MeshBatch} like the rest of the town, but with two differences that keep the
 * vertex count down (the town is merged into a few big meshes, so vertices are the cost):
 *  - quads are INDEXED (4 vertices + 6 indices instead of 6 vertices), flat shaded like `MeshBatch.quad`;
 *  - every corner can have its own colour, which gives cheap soft gradients (dirt at the foot of a wall, the
 *    shadow under every row of roof tiles, sky reflected in glass) without any extra geometry.
 */

export type Rng = () => number;
/** Local (u, y, v) coordinates of a building frame. */
export type L3 = readonly [number, number, number];
export type Face = 'f' | 'b' | 'l' | 'r';

/**
 * A deterministic generator for the details of ONE building. It is seeded from the numbers the builder already drew
 * from the shared town generator (`c.rnd()`) plus the position, so that drawing the details consumes nothing from the
 * shared stream: the layout of the rest of the town stays exactly as it was.
 */
export function houseRng(draws: readonly number[], x: number, z: number): Rng {
  let h = 0x811c9dc5;
  for (const d of draws) h = Math.imul(h ^ Math.floor(d * 4294967296), 0x01000193);
  h = Math.imul(h ^ Math.round(x * 16), 0x01000193);
  h = Math.imul(h ^ Math.round(z * 16), 0x01000193);
  return makeRng(h >>> 0);
}

/** Multiplies a colour, per channel. */
export const tone = (c: RGB, r: number, g = r, b = r): RGB => [clamp(c[0] * r, 0, 1), clamp(c[1] * g, 0, 1), clamp(c[2] * b, 0, 1)];

/** A colour with a small random brightness and hue drift (`amt` = total spread, e.g. 0.06). */
export function drift(c: RGB, rnd: Rng, amt: number): RGB {
  const k = 1 + (rnd() - 0.5) * amt;
  return tone(c, k * (1 + (rnd() - 0.5) * amt * 0.5), k * (1 + (rnd() - 0.5) * amt * 0.4), k * (1 + (rnd() - 0.5) * amt * 0.5));
}

/** Drawing brush bound to one batch and one building frame; all coordinates are local (u right, y up, v to the front). */
export class HB {
  constructor(readonly b: MeshBatch, readonly f: Frame) {}

  /** Indexed quad a,b,c,d (in order around the perimeter) with a colour per corner; `hint` = outward direction. */
  quadC(a: V3, b: V3, c: V3, d: V3, ca: RGB, cb: RGB, cc: RGB, cd: RGB, hint: V3): void {
    const B = this.b;
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
    const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) return;
    nx /= l; ny /= l; nz /= l;
    const along = nx * hint[0] + ny * hint[1] + nz * hint[2] >= 0;
    if (!along) { nx = -nx; ny = -ny; nz = -nz; }
    const base = B.vertexCount;
    B.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
    B.nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
    B.col.push(ca[0], ca[1], ca[2], 1, cb[0], cb[1], cb[2], 1, cc[0], cc[1], cc[2], 1, cd[0], cd[1], cd[2], 1);
    B.surf.push(0, 0, 0, 0); // plain surface (keeps the per-vertex tags aligned with the vertices)
    if (B.withUV) B.uvs.push(0, 0, 0, 0, 0, 0, 0, 0);
    // same winding rule as MeshBatch.tri (the lighting of back-face-culling-free, two-sided materials depends on it)
    if (along) B.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    else B.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Single-colour indexed quad. */
  quad(a: V3, b: V3, c: V3, d: V3, col: RGB, hint: V3): void {
    this.quadC(a, b, c, d, col, col, col, col, hint);
  }

  /** Triangle with a colour per corner. */
  triC(a: V3, b: V3, c: V3, ca: RGB, cb: RGB, cc: RGB, hint: V3): void {
    const B = this.b;
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
    const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) return;
    nx /= l; ny /= l; nz /= l;
    const along = nx * hint[0] + ny * hint[1] + nz * hint[2] >= 0;
    if (!along) { nx = -nx; ny = -ny; nz = -nz; }
    const base = B.vertexCount;
    B.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    B.nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    B.col.push(ca[0], ca[1], ca[2], 1, cb[0], cb[1], cb[2], 1, cc[0], cc[1], cc[2], 1);
    B.surf.push(0, 0, 0);
    if (B.withUV) B.uvs.push(0, 0, 0, 0, 0, 0);
    if (along) B.idx.push(base, base + 2, base + 1);
    else B.idx.push(base, base + 1, base + 2);
  }

  /** Quad from local corners. */
  quadL(a: L3, b: L3, c: L3, d: L3, ca: RGB, cb: RGB, cc: RGB, cd: RGB, hint: L3): void {
    const f = this.f;
    this.quadC(f.pt(a[0], a[1], a[2]), f.pt(b[0], b[1], b[2]), f.pt(c[0], c[1], c[2]), f.pt(d[0], d[1], d[2]), ca, cb, cc, cd, f.dir(hint[0], hint[1], hint[2]));
  }

  triL(a: L3, b: L3, c: L3, ca: RGB, cb: RGB, cc: RGB, hint: L3): void {
    const f = this.f;
    this.triC(f.pt(a[0], a[1], a[2]), f.pt(b[0], b[1], b[2]), f.pt(c[0], c[1], c[2]), ca, cb, cc, f.dir(hint[0], hint[1], hint[2]));
  }

  /** Quad in the plane v = const (a front or back wall), bottom colour `cb`, top colour `ct`. */
  wallV(u0: number, u1: number, y0: number, y1: number, v: number, dir: 1 | -1, cb: RGB, ct: RGB = cb): void {
    const f = this.f;
    this.quadC(f.pt(u0, y0, v), f.pt(u1, y0, v), f.pt(u1, y1, v), f.pt(u0, y1, v), cb, cb, ct, ct, f.dir(0, 0, dir));
  }

  /** Like {@link wallV}, with a small random drift of brightness at every corner (色むら) at no extra vertices. */
  wallVm(u0: number, u1: number, y0: number, y1: number, v: number, dir: 1 | -1, cb: RGB, ct: RGB, rnd: Rng, amt = 0.05): void {
    const f = this.f;
    const j = (c: RGB): RGB => tone(c, 1 + (rnd() - 0.5) * amt);
    this.quadC(f.pt(u0, y0, v), f.pt(u1, y0, v), f.pt(u1, y1, v), f.pt(u0, y1, v), j(cb), j(cb), j(ct), j(ct), f.dir(0, 0, dir));
  }

  /** Quad in the plane u = const (a side wall). */
  wallU(v0: number, v1: number, y0: number, y1: number, u: number, dir: 1 | -1, cb: RGB, ct: RGB = cb): void {
    const f = this.f;
    this.quadC(f.pt(u, y0, v0), f.pt(u, y0, v1), f.pt(u, y1, v1), f.pt(u, y1, v0), cb, cb, ct, ct, f.dir(dir, 0, 0));
  }

  /** Horizontal quad (`up` = facing up). `c0` at the v0 edge, `c1` at the v1 edge. */
  flat(u0: number, u1: number, v0: number, v1: number, y: number, c0: RGB, up = true, c1: RGB = c0): void {
    const f = this.f;
    this.quadC(f.pt(u0, y, v0), f.pt(u1, y, v0), f.pt(u1, y, v1), f.pt(u0, y, v1), c0, c0, c1, c1, f.dir(0, up ? 1 : -1, 0));
  }

  /**
   * Vertical (optionally tapered) prism with `sides` sides standing at WORLD position (cx, cz) between heights y0..y1,
   * with indexed quads for the sides and, if `cap`, a fan on top.
   */
  prism(cx: number, cz: number, y0: number, y1: number, r0: number, r1: number, sides: number, col: RGB, cap = true): void {
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const am = (a0 + a1) / 2;
      const hint: V3 = [Math.cos(am), 0, Math.sin(am)];
      this.quadC(
        [cx + c0 * r0, y0, cz + s0 * r0], [cx + c1 * r0, y0, cz + s1 * r0],
        [cx + c1 * r1, y1, cz + s1 * r1], [cx + c0 * r1, y1, cz + s0 * r1],
        col, col, col, col, hint,
      );
      if (cap && r1 > 0) this.triC([cx, y1, cz], [cx + c0 * r1, y1, cz + s0 * r1], [cx + c1 * r1, y1, cz + s1 * r1], col, col, col, [0, 1, 0]);
    }
  }

  /**
   * Axis-aligned box in local coordinates, only the faces named in `faces`:
   * f = +v, b = -v, r = +u, l = -u, t = top, d = bottom. Side faces fade from `lo` (bottom) to `col` (top).
   */
  box(u0: number, u1: number, y0: number, y1: number, v0: number, v1: number, col: RGB, faces = 'fblrt', o: { top?: RGB; lo?: RGB } = {}): void {
    const lo = o.lo ?? col;
    const top = o.top ?? col;
    for (const ch of faces) {
      switch (ch) {
        case 'f': this.wallV(u0, u1, y0, y1, v1, 1, lo, col); break;
        case 'b': this.wallV(u0, u1, y0, y1, v0, -1, lo, col); break;
        case 'r': this.wallU(v0, v1, y0, y1, u1, 1, lo, col); break;
        case 'l': this.wallU(v0, v1, y0, y1, u0, -1, lo, col); break;
        case 't': this.flat(u0, u1, v0, v1, y1, top, true); break;
        case 'd': this.flat(u0, u1, v0, v1, y0, lo, false); break;
      }
    }
  }
}

/**
 * One wall plane of a house box, described by the face it is on. Coordinates: `a` runs along the wall (u for the front
 * and back, v for the sides), `y` is the height and `n` the offset out of the wall plane. This lets windows, air
 * conditioners and drain pipes be written once and put on any face.
 */
export class Wall {
  constructor(readonly h: HB, readonly face: Face, readonly hu: number, readonly hv: number) {}

  /** Half length of the wall. */
  get half(): number {
    return this.face === 'f' || this.face === 'b' ? this.hu : this.hv;
  }

  /** Local point from wall coordinates (a along the wall, y, n out of the wall). */
  pt(a: number, y: number, n: number): L3 {
    switch (this.face) {
      case 'f': return [a, y, this.hv + n];
      case 'b': return [a, y, -this.hv - n];
      case 'r': return [this.hu + n, y, a];
      default: return [-this.hu - n, y, a];
    }
  }

  /** Local direction from a direction in wall coordinates. */
  dir(da: number, dy: number, dn: number): L3 {
    switch (this.face) {
      case 'f': return [da, dy, dn];
      case 'b': return [da, dy, -dn];
      case 'r': return [dn, dy, da];
      default: return [-dn, dy, da];
    }
  }

  /** Any quad, corners given in wall coordinates [a, y, n]; `hint` is the outward direction in wall coordinates. */
  wq(p0: L3, p1: L3, p2: L3, p3: L3, c0: RGB, c1: RGB, c2: RGB, c3: RGB, hint: L3): void {
    const q = (p: L3): L3 => this.pt(p[0], p[1], p[2]);
    this.h.quadL(q(p0), q(p1), q(p2), q(p3), c0, c1, c2, c3, this.dir(hint[0], hint[1], hint[2]));
  }

  /** A thin partition standing out of the wall at coordinate `a`, between offsets n0..n1. */
  part(a: number, y0: number, y1: number, n0: number, n1: number, cb: RGB, ct: RGB = cb): void {
    this.wq([a, y0, n0], [a, y0, n1], [a, y1, n1], [a, y1, n0], cb, cb, ct, ct, [1, 0, 0]);
  }

  /**
   * Like {@link q} for the big wall surfaces: every corner gets its own small random drift in brightness (`amt` = total
   * spread), so that a wall is not one flat colour but a little uneven like old paint (色むら), at no cost in vertices.
   */
  qm(a0: number, a1: number, y0: number, y1: number, n: number, cb: RGB, ct: RGB, rnd: Rng, amt = 0.05): void {
    const j = (c: RGB): RGB => tone(c, 1 + (rnd() - 0.5) * amt);
    this.wq([a0, y0, n], [a1, y0, n], [a1, y1, n], [a0, y1, n], j(cb), j(cb), j(ct), j(ct), [0, 0, 1]);
  }

  /** Quad parallel to the wall at offset n; `cb` at y0, `ct` at y1. */
  q(a0: number, a1: number, y0: number, y1: number, n: number, cb: RGB, ct: RGB = cb): void {
    switch (this.face) {
      case 'f': this.h.wallV(a0, a1, y0, y1, this.hv + n, 1, cb, ct); break;
      case 'b': this.h.wallV(a0, a1, y0, y1, -this.hv - n, -1, cb, ct); break;
      case 'r': this.h.wallU(a0, a1, y0, y1, this.hu + n, 1, cb, ct); break;
      case 'l': this.h.wallU(a0, a1, y0, y1, -this.hu - n, -1, cb, ct); break;
    }
  }

  /**
   * Box standing on the wall between offsets n0..n1. Faces: o = the outer face, a / z = the ends at a0 / a1,
   * t = top, d = bottom (the face against the wall is never drawn).
   */
  box(a0: number, a1: number, y0: number, y1: number, n0: number, n1: number, col: RGB, faces = 'oazt', o: { top?: RGB; lo?: RGB } = {}): void {
    const sideFace = this.face === 'f' || this.face === 'b';
    let u0: number, u1: number, v0: number, v1: number;
    switch (this.face) {
      case 'f': u0 = a0; u1 = a1; v0 = this.hv + n0; v1 = this.hv + n1; break;
      case 'b': u0 = a0; u1 = a1; v0 = -this.hv - n1; v1 = -this.hv - n0; break;
      case 'r': u0 = this.hu + n0; u1 = this.hu + n1; v0 = a0; v1 = a1; break;
      default: u0 = -this.hu - n1; u1 = -this.hu - n0; v0 = a0; v1 = a1; break;
    }
    let mapped = '';
    for (const ch of faces) {
      if (ch === 'o') mapped += this.face;
      else if (ch === 'a') mapped += sideFace ? 'l' : 'b';
      else if (ch === 'z') mapped += sideFace ? 'r' : 'f';
      else if (ch === 't' || ch === 'd') mapped += ch;
    }
    this.h.box(u0, u1, y0, y1, v0, v1, col, mapped, o);
  }
}
