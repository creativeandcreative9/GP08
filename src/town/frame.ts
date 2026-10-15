import type { MeshBatch } from './batch';
import type { RGB, V3 } from './util';

/**
 * A local, axis-aligned frame for a building: `v` points to the front (towards the street),
 * `u` points to the right when facing out of the front. Only the four axis-aligned orientations exist,
 * so every local box stays an axis-aligned world box (matching the AABB footprints used for collisions).
 */
export class Frame {
  readonly rx: number;
  readonly rz: number;
  constructor(readonly cx: number, readonly cz: number, readonly fx: number, readonly fz: number) {
    this.rx = fz;
    this.rz = -fx;
  }
  /** Local (u, y, v) -> world point. */
  pt(u: number, y: number, v: number): V3 {
    return [this.cx + this.rx * u + this.fx * v, y, this.cz + this.rz * u + this.fz * v];
  }
  /** Local direction -> world direction. */
  dir(du: number, dy: number, dv: number): V3 {
    return [this.rx * du + this.fx * dv, dy, this.rz * du + this.fz * dv];
  }
  /** Local axis-aligned box. */
  box(b: MeshBatch, u0: number, u1: number, y0: number, y1: number, v0: number, v1: number, color: RGB, o: { top?: RGB; bottom?: boolean; sides?: RGB } = {}): void {
    const a = this.pt(u0, y0, v0);
    const c = this.pt(u1, y1, v1);
    b.box(Math.min(a[0], c[0]), Math.max(a[0], c[0]), y0, y1, Math.min(a[2], c[2]), Math.max(a[2], c[2]), color, o);
  }
  /** Quad on the plane v = const, between u0..u1 and y0..y1, facing `dir` (+1 front, -1 back). */
  facade(b: MeshBatch, u0: number, u1: number, y0: number, y1: number, v: number, dir: 1 | -1, color: RGB): void {
    // order so that the viewer standing outside sees increasing "right"
    const p = this.pt.bind(this);
    b.quad(p(u0, y0, v), p(u1, y0, v), p(u1, y1, v), p(u0, y1, v), color, this.dir(0, 0, dir));
  }
  /** Quad on the plane u = const (a side wall), between v0..v1, facing `dir` (+1 right, -1 left). */
  side(b: MeshBatch, v0: number, v1: number, y0: number, y1: number, u: number, dir: 1 | -1, color: RGB): void {
    b.quad(this.pt(u, y0, v0), this.pt(u, y0, v1), this.pt(u, y1, v1), this.pt(u, y1, v0), color, this.dir(dir, 0, 0));
  }
  /** Gable roof over the local rectangle. `ridge` = 'u' (ridge along local u) or 'v'. */
  gable(b: MeshBatch, u0: number, u1: number, v0: number, v1: number, yEave: number, rise: number, ridge: 'u' | 'v', overhang: number, roof: RGB, wall: RGB): void {
    const a = this.pt(u0, yEave, v0);
    const c = this.pt(u1, yEave, v1);
    const ridgeAlongX = (this.fx === 0) === (ridge === 'u');
    b.gable(Math.min(a[0], c[0]), Math.max(a[0], c[0]), Math.min(a[2], c[2]), Math.max(a[2], c[2]), yEave, rise, ridgeAlongX ? 'x' : 'z', overhang, roof, wall);
  }
}

export function frameFacing(cx: number, cz: number, tx: number, tz: number): Frame {
  // front axis = dominant direction from the building towards (tx,tz)
  const dx = tx - cx;
  const dz = tz - cz;
  if (Math.abs(dx) > Math.abs(dz)) return new Frame(cx, cz, Math.sign(dx) || 1, 0);
  return new Frame(cx, cz, 0, Math.sign(dz) || 1);
}
