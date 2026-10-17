import { MeshBatch } from './batch';
import type { Ctx } from './ctx';
import type { Frame } from './frame';
import { hvacUnit, waterTank } from './facade';
import { houseRng } from './housekit';
import { HB, Wall, tone } from './housekit';
import { hex, type RGB } from './util';

export const GLASS = hex(0x9fd0ee);
export const GLASS_DARK = hex(0x6c9cc4);
export const SASH = hex(0xf7f7f4);
export const CONCRETE_GREY = hex(0xb9b6ae);
export const GREEN_LEAF = hex(0x6cb855);

export type Face = 'f' | 'b' | 'l' | 'r';

/**
 * A window (sash + glass) on one face of a frame-aligned box with half extents hu, hv. Wide windows get two sliding panes
 * with the mullion between them; the glass fades from darker at the sill to lighter at the head (the sky in it).
 * Quads are indexed (see housekit), so a window costs 8-12 vertices.
 */
export function windowOn(
  b: MeshBatch, f: Frame, hu: number, hv: number, face: Face,
  pos: number, y: number, w: number, h: number, glass: RGB = GLASS, sash: RGB = SASH,
): void {
  const wall = new Wall(new HB(b, f), face, hu, hv);
  const hw = w / 2;
  const fw = 1.6;
  const lo = tone(glass, 0.84);
  const hi = tone(glass, 1.06);
  wall.q(pos - hw, pos + hw, y, y + h, 0.5, tone(sash, 0.92), sash);
  if (w >= 14) {
    wall.q(pos - hw + fw, pos - 0.6, y + fw, y + h - fw, 0.9, lo, hi);
    wall.q(pos + 0.6, pos + hw - fw, y + fw, y + h - fw, 0.9, tone(lo, 0.95), tone(hi, 0.95));
  } else {
    wall.q(pos - hw + fw, pos + hw - fw, y + fw, y + h - fw, 0.9, lo, hi);
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

/** Atlas sign quad on the plane v = const (front/back) of a frame, readable from outside. */
export function signOnFace(
  c: Ctx, f: Frame, label: string, uc: number, y0: number, w: number, h: number, v: number, dir: 1 | -1,
): void {
  const uv = c.atlas.uv(label);
  const p = f.pt(uc, y0, v);
  const sb = c.signs.at(p[0], p[2]);
  // For the front (dir=1) the viewer's left is +u; for the back the viewer's left is -u.
  const left = uc + dir * (w / 2);
  const right = uc - dir * (w / 2);
  sb.quad(f.pt(left, y0, v), f.pt(right, y0, v), f.pt(right, y0 + h, v), f.pt(left, y0 + h, v), [1, 1, 1], f.dir(0, 0, dir), [
    [uv.u0, uv.v0], [uv.u1, uv.v0], [uv.u1, uv.v1], [uv.u0, uv.v1],
  ]);
}

/** A free-standing rooftop signboard (box with the sign on front and back). */
export function roofSign(c: Ctx, f: Frame, label: string, uc: number, yBase: number, w: number, h: number, v: number, body: RGB): void {
  const hb = new HB(c.main.at(f.cx, f.cz), f);
  hb.box(uc - w / 2 - 2, uc + w / 2 + 2, yBase, yBase + h + 2, v - 2.5, v + 2.5, body, 'fblrt');
  // support legs
  const leg = hex(0x555a62);
  hb.box(uc - w / 2 + 6, uc - w / 2 + 10, yBase - 4, yBase, v - 1, v + 1, leg, 'fblr');
  hb.box(uc + w / 2 - 10, uc + w / 2 - 6, yBase - 4, yBase, v - 1, v + 1, leg, 'fblr');
  signOnFace(c, f, label, uc, yBase + 1, w, h, v + 2.6, 1);
  signOnFace(c, f, label, uc, yBase + 1, w, h, v - 2.6, -1);
}

/** Roof-edge wall (パラペット): outer and inner faces and the top, 2.5 thick. */
export function parapet(b: MeshBatch, f: Frame, hu: number, hv: number, y: number, hgt: number, color: RGB): void {
  const t = 2.5;
  const h = new HB(b, f);
  const top = y + hgt;
  if (hgt > 0) {
    h.wallV(-hu, hu, y, top, hv, 1, color);
    h.wallV(-hu, hu, y, top, -hv, -1, color);
    h.wallU(-hv, hv, y, top, -hu, -1, color);
    h.wallU(-hv, hv, y, top, hu, 1, color);
    h.wallV(-hu + t, hu - t, y, top, hv - t, -1, color);
    h.wallV(-hu + t, hu - t, y, top, -hv + t, 1, color);
    h.wallU(-hv + t, hv - t, y, top, -hu + t, 1, color);
    h.wallU(-hv + t, hv - t, y, top, hu - t, -1, color);
  }
  h.flat(-hu, hu, hv - t, hv, top, color);
  h.flat(-hu, hu, -hv, -hv + t, top, color);
  h.flat(-hu, -hu + t, -hv + t, hv - t, top, color);
  h.flat(hu - t, hu, -hv + t, hv - t, top, color);
}

export function rooftopStuff(c: Ctx, f: Frame, hu: number, hv: number, y: number, count = 3, visible = true): void {
  // Consume the same town RNG for pitched roofs, while leaving their covered equipment out of the mesh.
  const b = visible ? c.main.at(f.cx, f.cz) : new MeshBatch();
  const h = new HB(b, f);
  const r = c.rnd;
  for (let i = 0; i < count; i++) {
    const u = (r() * 2 - 1) * (hu - 22);
    const v = (r() * 2 - 1) * (hv - 22);
    const local = houseRng([u, v, y], f.cx, f.cz);
    if (r() < 0.5) hvacUnit(h, u, v, y, 7, 6, 9, local);
    else waterTank(h, u, v, y, 5, 11, local);
  }
}
