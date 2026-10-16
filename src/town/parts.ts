import type { MeshBatch } from './batch';
import type { Ctx } from './ctx';
import type { Frame } from './frame';
import { hex, type RGB, type V3 } from './util';

export const GLASS = hex(0x9fd0ee);
export const GLASS_DARK = hex(0x6c9cc4);
export const SASH = hex(0xf7f7f4);
export const CONCRETE_GREY = hex(0xb9b6ae);
export const GREEN_LEAF = hex(0x6cb855);

export type Face = 'f' | 'b' | 'l' | 'r';

/** A window (sash + glass) on one face of a frame-aligned box with half extents hu, hv. */
export function windowOn(
  b: MeshBatch, f: Frame, hu: number, hv: number, face: Face,
  pos: number, y: number, w: number, h: number, glass: RGB = GLASS, sash: RGB = SASH,
): void {
  const o1 = 0.5;
  const o2 = 0.9;
  const hw = w / 2;
  if (face === 'f' || face === 'b') {
    const dir = face === 'f' ? 1 : -1;
    const v = (face === 'f' ? hv : -hv) * 1;
    f.facade(b, pos - hw, pos + hw, y, y + h, v + dir * o1, dir, sash);
    f.facade(b, pos - hw + 1.6, pos + hw - 1.6, y + 1.6, y + h - 1.6, v + dir * o2, dir, glass);
  } else {
    const dir = face === 'r' ? 1 : -1;
    const u = (face === 'r' ? hu : -hu) * 1;
    f.side(b, pos - hw, pos + hw, y, y + h, u + dir * o1, dir, sash);
    f.side(b, pos - hw + 1.6, pos + hw - 1.6, y + 1.6, y + h - 1.6, u + dir * o2, dir, glass);
  }
}

/** Evenly spaced windows on all four faces of a box, floor by floor. */
export function windowGrid(
  b: MeshBatch, f: Frame, hu: number, hv: number,
  y0: number, floorH: number, floors: number,
  o: { w?: number; h?: number; spacing?: number; sill?: number; skipFront?: (floor: number) => boolean; glass?: RGB; faces?: Face[] } = {},
): void {
  const w = o.w ?? 16;
  const h = o.h ?? 20;
  const sp = o.spacing ?? 34;
  const faces = o.faces ?? ['f', 'b', 'l', 'r'];
  for (const face of faces) {
    const len = face === 'f' || face === 'b' ? hu * 2 : hv * 2;
    const n = Math.max(1, Math.floor((len - 18) / sp));
    for (let fl = 0; fl < floors; fl++) {
      if ((face === 'f' || face === 'b') && o.skipFront && face === 'f' && o.skipFront(fl)) continue;
      const y = y0 + fl * floorH + (o.sill ?? (floorH - h) / 2 + 1);
      for (let i = 0; i < n; i++) {
        const pos = -len / 2 + ((i + 0.5) * len) / n;
        windowOn(b, f, hu, hv, face, pos, y, w, h, o.glass);
      }
    }
  }
}

/** Atlas sign on an upright board: `left`/`right` are its bottom corners as the reader sees them, `h` its height. */
export function signBoard(c: Ctx, label: string, left: V3, right: V3, h: number, normal: V3): void {
  const { v0, v1 } = c.atlas.uv(label);
  const sb = c.signs.at((left[0] + right[0]) / 2, (left[2] + right[2]) / 2);
  const w = Math.hypot(right[0] - left[0], right[2] - left[2]);
  // exact at both ends, so a board drawn as one strip keeps exactly the given corners
  const at = (t: number, dy: number): V3 => [left[0] * (1 - t) + right[0] * t, left[1] + dy, left[2] * (1 - t) + right[2] * t];
  for (const s of c.atlas.strips(label, w / h)) {
    sb.quad(at(s.x0, 0), at(s.x1, 0), at(s.x1, h), at(s.x0, h), [1, 1, 1], normal, [
      [s.u0, v0], [s.u1, v0], [s.u1, v1], [s.u0, v1],
    ]);
  }
}

/** Atlas sign quad on the plane v = const (front/back) of a frame, readable from outside. */
export function signOnFace(
  c: Ctx, f: Frame, label: string, uc: number, y0: number, w: number, h: number, v: number, dir: 1 | -1,
): void {
  // For the front (dir=1) the viewer's left is +u; for the back the viewer's left is -u.
  signBoard(c, label, f.pt(uc + dir * (w / 2), y0, v), f.pt(uc - dir * (w / 2), y0, v), h, f.dir(0, 0, dir));
}

/** A free-standing rooftop signboard (box with the sign on front and back). */
export function roofSign(c: Ctx, f: Frame, label: string, uc: number, yBase: number, w: number, h: number, v: number, body: RGB): void {
  const b = c.main.at(f.cx, f.cz);
  f.box(b, uc - w / 2 - 2, uc + w / 2 + 2, yBase, yBase + h + 2, v - 2.5, v + 2.5, body);
  // support legs
  f.box(b, uc - w / 2 + 6, uc - w / 2 + 10, yBase - 4, yBase, v - 1, v + 1, hex(0x555a62));
  f.box(b, uc + w / 2 - 10, uc + w / 2 - 6, yBase - 4, yBase, v - 1, v + 1, hex(0x555a62));
  signOnFace(c, f, label, uc, yBase + 1, w, h, v + 2.6, 1);
  signOnFace(c, f, label, uc, yBase + 1, w, h, v - 2.6, -1);
}

export function parapet(b: MeshBatch, f: Frame, hu: number, hv: number, y: number, hgt: number, color: RGB): void {
  const t = 2.5;
  f.box(b, -hu, hu, y, y + hgt, hv - t, hv, color);
  f.box(b, -hu, hu, y, y + hgt, -hv, -hv + t, color);
  f.box(b, -hu, -hu + t, y, y + hgt, -hv + t, hv - t, color);
  f.box(b, hu - t, hu, y, y + hgt, -hv + t, hv - t, color);
}

export function rooftopStuff(c: Ctx, f: Frame, hu: number, hv: number, y: number, count = 3): void {
  const b = c.main.at(f.cx, f.cz);
  const r = c.rnd;
  for (let i = 0; i < count; i++) {
    const u = (r() * 2 - 1) * (hu - 22);
    const v = (r() * 2 - 1) * (hv - 22);
    if (r() < 0.5) {
      f.box(b, u - 7, u + 7, y, y + 9, v - 6, v + 6, hex(0xc9ccd2));
      f.box(b, u - 5, u + 5, y + 9, y + 10, v - 4, v + 4, hex(0x8a8e96));
    } else {
      const p = f.pt(u, y, v);
      b.cylinder(p[0], p[2], y, y + 14, 5, 5, 8, hex(0xb9a48a));
      b.cylinder(p[0], p[2], y + 14, y + 18, 5, 1, 8, hex(0x8a735a));
    }
  }
}
