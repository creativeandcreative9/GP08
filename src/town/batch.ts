import { Mesh, VertexData, type Material, type Scene } from '@babylonjs/core';
import type { RGB, V3 } from './util';

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

const UP: V3 = [0, 1, 0];

/**
 * Accumulates flat-shaded, vertex-coloured geometry that is later turned into ONE mesh
 * (so that thousands of small shapes cost a single draw call).
 * Winding is chosen automatically from the outward `hint` direction.
 */
export class MeshBatch {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  uvs: number[] = [];
  idx: number[] = [];
  constructor(readonly withUV = false) {}

  get vertexCount(): number {
    return this.pos.length / 3;
  }
  get triangleCount(): number {
    return this.idx.length / 3;
  }
  get empty(): boolean {
    return this.idx.length === 0;
  }

  private push(p: V3, n: V3, c: RGB, u = 0, v = 0): void {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.col.push(c[0], c[1], c[2], 1);
    if (this.withUV) this.uvs.push(u, v);
  }

  /** A triangle. `hint` is the desired outward direction; the winding is flipped to match. */
  tri(a: V3, b: V3, c: V3, color: RGB, hint?: V3, uv?: [number, number][]): void {
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
    const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) return;
    nx /= l; ny /= l; nz /= l;
    // In Babylon's default (left-handed) setup front faces are wound so that the geometric cross
    // product points AWAY from the viewer; so emit the winding reversed relative to the outward normal.
    const along = !hint || nx * hint[0] + ny * hint[1] + nz * hint[2] >= 0;
    const base = this.vertexCount;
    const n: V3 = along ? [nx, ny, nz] : [-nx, -ny, -nz];
    if (!along) {
      this.push(a, n, color, uv?.[0]?.[0], uv?.[0]?.[1]);
      this.push(b, n, color, uv?.[1]?.[0], uv?.[1]?.[1]);
      this.push(c, n, color, uv?.[2]?.[0], uv?.[2]?.[1]);
    } else {
      this.push(a, n, color, uv?.[0]?.[0], uv?.[0]?.[1]);
      this.push(c, n, color, uv?.[2]?.[0], uv?.[2]?.[1]);
      this.push(b, n, color, uv?.[1]?.[0], uv?.[1]?.[1]);
    }
    this.idx.push(base, base + 1, base + 2);
  }

  /** Quad a,b,c,d in order around the perimeter. `uv` = four [u,v] pairs. */
  quad(a: V3, b: V3, c: V3, d: V3, color: RGB, hint?: V3, uv?: [number, number][]): void {
    this.tri(a, b, c, color, hint, uv ? [uv[0]!, uv[1]!, uv[2]!] : undefined);
    this.tri(a, c, d, color, hint, uv ? [uv[0]!, uv[2]!, uv[3]!] : undefined);
  }

  /** Axis-aligned box. */
  box(
    x0: number, x1: number, y0: number, y1: number, z0: number, z1: number,
    color: RGB,
    o: { top?: RGB; bottom?: boolean; sides?: RGB } = {},
  ): void {
    const side = o.sides ?? color;
    const top = o.top ?? color;
    // +y
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], top, UP);
    if (o.bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], side, [0, -1, 0]);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], side, [0, 0, 1]);
    this.quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], side, [0, 0, -1]);
    this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], side, [1, 0, 0]);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], side, [-1, 0, 0]);
  }

  /** Gable roof. Ridge runs along `ridge` axis ('x' or 'z'). Footprint is the wall rectangle. */
  gable(
    x0: number, x1: number, z0: number, z1: number, yEave: number, rise: number,
    ridge: 'x' | 'z', overhang: number, roof: RGB, gableWall: RGB,
  ): void {
    const drop = Math.min(3, rise * 0.15);
    if (ridge === 'z') {
      const cx = (x0 + x1) / 2;
      const yr = yEave + rise;
      const ya = x0 - overhang, yb = x1 + overhang, za = z0 - overhang, zb = z1 + overhang;
      this.quad([ya, yEave - drop, za], [cx, yr, za], [cx, yr, zb], [ya, yEave - drop, zb], roof, [-rise, (x1 - x0) / 2, 0]);
      this.quad([yb, yEave - drop, zb], [cx, yr, zb], [cx, yr, za], [yb, yEave - drop, za], roof, [rise, (x1 - x0) / 2, 0]);
      this.tri([x0, yEave, z0], [cx, yr, z0], [x1, yEave, z0], gableWall, [0, 0, -1]);
      this.tri([x0, yEave, z1], [x1, yEave, z1], [cx, yr, z1], gableWall, [0, 0, 1]);
    } else {
      const cz = (z0 + z1) / 2;
      const yr = yEave + rise;
      const xa = x0 - overhang, xb = x1 + overhang, za = z0 - overhang, zb = z1 + overhang;
      this.quad([xa, yEave - drop, za], [xa, yr, cz], [xb, yr, cz], [xb, yEave - drop, za], roof, [0, (z1 - z0) / 2, -rise]);
      this.quad([xb, yEave - drop, zb], [xb, yr, cz], [xa, yr, cz], [xa, yEave - drop, zb], roof, [0, (z1 - z0) / 2, rise]);
      this.tri([x0, yEave, z0], [x0, yr, cz], [x0, yEave, z1], gableWall, [-1, 0, 0]);
      this.tri([x1, yEave, z0], [x1, yEave, z1], [x1, yr, cz], gableWall, [1, 0, 0]);
    }
  }

  /** Vertical (optionally tapered) prism with `sides` sides; y0..y1. */
  cylinder(cx: number, cz: number, y0: number, y1: number, r0: number, r1: number, sides: number, color: RGB, cap = true): void {
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const am = (a0 + a1) / 2;
      const hint: V3 = [Math.cos(am), 0, Math.sin(am)];
      this.quad(
        [cx + c0 * r0, y0, cz + s0 * r0], [cx + c1 * r0, y0, cz + s1 * r0],
        [cx + c1 * r1, y1, cz + s1 * r1], [cx + c0 * r1, y1, cz + s0 * r1],
        color, hint,
      );
      if (cap && r1 > 0) this.tri([cx, y1, cz], [cx + c0 * r1, y1, cz + s0 * r1], [cx + c1 * r1, y1, cz + s1 * r1], color, UP);
    }
  }

  /** Flat horizontal polygon (disc) at height y. */
  disc(cx: number, cz: number, y: number, rx: number, rz: number, sides: number, color: RGB): void {
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      this.tri([cx, y, cz], [cx + Math.cos(a0) * rx, y, cz + Math.sin(a0) * rz], [cx + Math.cos(a1) * rx, y, cz + Math.sin(a1) * rz], color, UP);
    }
  }

  /** Low-poly blob (flat shaded icosahedron), `jitter` varies the brightness per facet. */
  blob(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, color: RGB, jitter = 0.08, seed = 0): void {
    for (let f = 0; f < ICO_F.length; f++) {
      const [i, j, k] = ICO_F[f]!;
      const v = [ICO_V[i!]!, ICO_V[j!]!, ICO_V[k!]!];
      const h = Math.sin((f + 1) * 12.9898 + seed * 78.233) * 43758.5453;
      const f01 = h - Math.floor(h);
      const m = 1 + (f01 - 0.5) * 2 * jitter;
      const c: RGB = [Math.min(1, color[0] * m), Math.min(1, color[1] * m), Math.min(1, color[2] * m)];
      const p = v.map((q) => [cx + q[0] * rx, cy + q[1] * ry, cz + q[2] * rz] as V3);
      const mid: V3 = [(v[0]![0] + v[1]![0] + v[2]![0]) / 3, (v[0]![1] + v[1]![1] + v[2]![1]) / 3, (v[0]![2] + v[1]![2] + v[2]![2]) / 3];
      this.tri(p[0]!, p[1]!, p[2]!, c, mid);
    }
  }

  /** Strip between two polylines of equal length (left and right edges), facing up. */
  strip(left: readonly V3[], right: readonly V3[], color: RGB): void {
    for (let i = 0; i + 1 < left.length; i++) {
      this.quad(left[i]!, left[i + 1]!, right[i + 1]!, right[i]!, color, UP);
    }
  }

  /** A thin wire: points joined by crossed vertical+horizontal quads of the given width. */
  wire(points: readonly V3[], width: number, color: RGB): void {
    const h = width / 2;
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i]!;
      const b = points[i + 1]!;
      let dx = b[0] - a[0];
      let dz = b[2] - a[2];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      const nx = -dz * h, nz = dx * h;
      this.quad([a[0] - nx, a[1], a[2] - nz], [b[0] - nx, b[1], b[2] - nz], [b[0] + nx, b[1], b[2] + nz], [a[0] + nx, a[1], a[2] + nz], color, UP);
      this.quad([a[0], a[1] - h, a[2]], [b[0], b[1] - h, b[2]], [b[0], b[1] + h, b[2]], [a[0], a[1] + h, a[2]], color, [-dz, 0, dx]);
    }
  }

  toMesh(name: string, scene: Scene, material: Material): Mesh {
    const mesh = new Mesh(name, scene);
    const vd = new VertexData();
    vd.positions = new Float32Array(this.pos);
    vd.normals = new Float32Array(this.nor);
    vd.colors = new Float32Array(this.col);
    if (this.withUV) vd.uvs = new Float32Array(this.uvs);
    vd.indices = this.vertexCount > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx);
    vd.applyToMesh(mesh);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    mesh.doNotSyncBoundingInfo = true;
    return mesh;
  }
}

/** Splits geometry into spatial chunks (so the engine can frustum-cull far parts). */
export class ChunkedBatch {
  private chunks = new Map<string, MeshBatch>();
  constructor(readonly size: number, readonly withUV = false) {}
  at(x: number, z: number): MeshBatch {
    const key = `${Math.floor(x / this.size)},${Math.floor(z / this.size)}`;
    let b = this.chunks.get(key);
    if (!b) {
      b = new MeshBatch(this.withUV);
      this.chunks.set(key, b);
    }
    return b;
  }
  all(): [string, MeshBatch][] {
    return [...this.chunks.entries()];
  }
  toMeshes(prefix: string, scene: Scene, material: Material): Mesh[] {
    return this.all()
      .filter(([, b]) => !b.empty)
      .map(([k, b]) => b.toMesh(`${prefix}_${k}`, scene, material));
  }
  get vertexCount(): number {
    let n = 0;
    for (const b of this.chunks.values()) n += b.vertexCount;
    return n;
  }
}

/** Oriented horizontal beam from a to b (rails, crossbars, rails of fences...). */
export function beam(
  b: MeshBatch,
  a: V3, c: V3, width: number, height: number, color: RGB,
): void {
  let dx = c[0] - a[0];
  let dz = c[2] - a[2];
  const l = Math.hypot(dx, dz) || 1;
  dx /= l; dz /= l;
  const nx = (-dz * width) / 2;
  const nz = (dx * width) / 2;
  const h = height / 2;
  const p = (s: number, t: number, e: V3): V3 => [e[0] + nx * s, e[1] + h * t, e[2] + nz * s];
  b.quad(p(-1, 1, a), p(-1, 1, c), p(1, 1, c), p(1, 1, a), color, [0, 1, 0]);
  b.quad(p(-1, -1, a), p(1, -1, a), p(1, -1, c), p(-1, -1, c), color, [0, -1, 0]);
  b.quad(p(1, -1, a), p(1, 1, a), p(1, 1, c), p(1, -1, c), color, [nx, 0, nz]);
  b.quad(p(-1, -1, a), p(-1, -1, c), p(-1, 1, c), p(-1, 1, a), color, [-nx, 0, -nz]);
}
