import type { MeshBatch } from './batch';
import type { RGB, V3 } from './util';

const UP: V3 = [0, 1, 0];

export interface Hole {
  a0: number;
  a1: number;
  y0: number;
  y1: number;
}

export type UvFn = (a: number, y: number) => [number, number];

/**
 * A wall face (a rectangle in the plane x = const or z = const) with rectangular holes cut out of it.
 * `axis` is the direction the wall runs along; `a` runs along it, `facing` is the side the face looks to.
 */
export function faceWithHoles(
  b: MeshBatch, axis: 'x' | 'z', plane: number, a0: number, a1: number, y0: number, y1: number,
  holes: readonly Hole[], color: RGB, facing: 1 | -1, uv?: UvFn,
): void {
  const hs = holes
    .map((h) => ({ a0: Math.max(h.a0, a0), a1: Math.min(h.a1, a1), y0: Math.max(h.y0, y0), y1: Math.min(h.y1, y1) }))
    .filter((h) => h.a1 > h.a0 && h.y1 > h.y0);
  const ys = new Set<number>([y0, y1]);
  for (const h of hs) {
    ys.add(h.y0);
    ys.add(h.y1);
  }
  const yl = [...ys].sort((p, q) => p - q);
  const pt = (a: number, y: number): V3 => (axis === 'x' ? [a, y, plane] : [plane, y, a]);
  const hint: V3 = axis === 'x' ? [0, 0, facing] : [facing, 0, 0];
  const seg = (sa: number, sb: number, ya: number, yb: number): void => {
    b.quad(pt(sa, ya), pt(sb, ya), pt(sb, yb), pt(sa, yb), color, hint, uv ? [uv(sa, ya), uv(sb, ya), uv(sb, yb), uv(sa, yb)] : undefined);
  };
  for (let i = 0; i + 1 < yl.length; i++) {
    const ya = yl[i]!;
    const yb = yl[i + 1]!;
    if (yb - ya < 1e-6) continue;
    const row = hs.filter((h) => h.y0 <= ya + 1e-6 && h.y1 >= yb - 1e-6).sort((p, q) => p.a0 - q.a0);
    let a = a0;
    for (const h of row) {
      if (h.a0 > a + 1e-6) seg(a, h.a0, ya, yb);
      a = Math.max(a, h.a1);
    }
    if (a < a1 - 1e-6) seg(a, a1, ya, yb);
  }
}

/** The faces of the wall thickness around a hole (planes `pa` and `pb`). */
export function reveal(b: MeshBatch, axis: 'x' | 'z', pa: number, pb: number, h: Hole, color: RGB, sill: boolean): void {
  const P = (a: number, y: number, p: number): V3 => (axis === 'x' ? [a, y, p] : [p, y, a]);
  const da: V3 = axis === 'x' ? [1, 0, 0] : [0, 0, 1];
  const na: V3 = [-da[0], 0, -da[2]];
  b.quad(P(h.a0, h.y0, pa), P(h.a0, h.y1, pa), P(h.a0, h.y1, pb), P(h.a0, h.y0, pb), color, da);
  b.quad(P(h.a1, h.y0, pa), P(h.a1, h.y1, pa), P(h.a1, h.y1, pb), P(h.a1, h.y0, pb), color, na);
  b.quad(P(h.a0, h.y1, pa), P(h.a1, h.y1, pa), P(h.a1, h.y1, pb), P(h.a0, h.y1, pb), color, [0, -1, 0]);
  if (sill) b.quad(P(h.a0, h.y0, pa), P(h.a1, h.y0, pa), P(h.a1, h.y0, pb), P(h.a0, h.y0, pb), color, UP);
}

