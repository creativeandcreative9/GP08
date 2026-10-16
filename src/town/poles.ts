import { beam } from './batch';
import type { Ctx } from './ctx';
import { Fx, catenary, panel, ribbon, signQuad, tileUv, tube } from './shapes';
import { SIGN, SLEEVE } from './streetsigns';
import { hex, type V3 } from './util';

/**
 * Utility poles (電柱): slender tapered concrete shaft, yellow/black guard sleeve, step bolts, a high-voltage
 * cross-arm with insulators, a low-voltage arm, and on some poles a transformer, a street light, a junction box
 * and a vertical advert; every pole carries a blue address plate (住居表示). Wires run between poles with sag:
 * three high-voltage lines, three low-voltage lines, a messenger wire and a thick dark cable bundle.
 */

const CONCRETE = hex(0xc9c7bf);
const STEEL = hex(0x7b838d);
const STEEL_DK = hex(0x4a4e56);
const PORCELAIN = hex(0xeceae0);
const XFMR = hex(0x9ea6a6);
const XFMR_LID = hex(0x6c7575);
const BOX = hex(0x8c9197);
const LAMP = hex(0x858a92);
const LENS = hex(0xfff4cc);
const WIRE_HV = hex(0x2d2e34);
const WIRE_LV = hex(0x2a2b30);
const WIRE_MSG = hex(0x777b83);
const WIRE_BUNDLE = hex(0x1d1e22);

export const POLE_R0 = 1.65;
export const POLE_R1 = 1.1;

export interface Pole {
  x: number;
  z: number;
  y0: number;
  /** Total height of the shaft. */
  H: number;
  /** Unit normal of the road at the pole (the direction of the cross-arms). */
  nx: number;
  nz: number;
  /** +1 if the pole stands on the +normal side of the road, -1 on the other side. */
  side: 1 | -1;
  /** 0..3: which block of the town (selects the address plate). */
  district: number;
  xfmr: boolean;
  lamp: boolean;
  box: boolean;
  /** Advert tile (0..3) or -1. */
  advert: number;
}

/**
 * Wire slots in the pole's frame (u along the road, v along the normal, `dy` relative to the shaft top).
 * `toRoad` slots hang on the road side of the pole, whichever side that is.
 */
interface Slot {
  v: number;
  dy: number;
  kind: 'hv' | 'lv' | 'msg' | 'bundle';
  toRoad?: boolean;
}
const SLOTS: readonly Slot[] = [
  { v: -11, dy: -3.2, kind: 'hv' },
  { v: 0, dy: 4.3, kind: 'hv' },
  { v: 11, dy: -3.2, kind: 'hv' },
  { v: -5.6, dy: -23.2, kind: 'lv' },
  { v: 2.9, dy: -23.2, kind: 'lv' },
  { v: 5.6, dy: -23.2, kind: 'lv' },
  { v: 3.4, dy: -48, kind: 'msg', toRoad: true },
  { v: 3.4, dy: -52.5, kind: 'bundle', toRoad: true },
];
const SAG: Record<Slot['kind'], number> = { hv: 0.024, lv: 0.03, msg: 0.03, bundle: 0.04 };

const slotV = (s: Slot, side: number): number => (s.toRoad ? -side * s.v : s.v);

/** Adds one pole with all its fittings to the town batches. */
export function addPole(c: Ctx, p: Pole): void {
  const b = c.main.at(p.x, p.z);
  const sb = c.signs.at(p.x, p.z);
  const fr = new Fx(p.x, p.y0, p.z, p.nx, p.nz); // v = across the road, u = along it
  const H = p.H;
  const road = -p.side; // sign of v that points to the road
  const rAt = (y: number): number => POLE_R0 + (POLE_R1 - POLE_R0) * (y / H);

  // shaft
  b.cylinder(p.x, p.z, p.y0, p.y0 + H, POLE_R0, POLE_R1, 8, CONCRETE, false);

  // yellow/black guard sleeve (巻き付け標識): the stripe picture wraps once around, 8 flat faces
  {
    const uv = c.atlas.uv(SIGN.stripe);
    const padV = ((uv.v1 - uv.v0) * SLEEVE.pad) / 128;
    const v0 = uv.v0 + padV;
    const v1 = uv.v1 - padV;
    const rs0 = rAt(0) + 0.45;
    const rs1 = rAt(SLEEVE.height) + 0.4;
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2;
      const a1 = ((i + 1) / 8) * Math.PI * 2;
      const ua = uv.u0 + ((uv.u1 - uv.u0) * i) / 8;
      const ub = uv.u0 + ((uv.u1 - uv.u0) * (i + 1)) / 8;
      const am = (a0 + a1) / 2;
      sb.quad(
        [p.x + Math.cos(a0) * rs0, p.y0, p.z + Math.sin(a0) * rs0],
        [p.x + Math.cos(a1) * rs0, p.y0, p.z + Math.sin(a1) * rs0],
        [p.x + Math.cos(a1) * rs1, p.y0 + SLEEVE.height, p.z + Math.sin(a1) * rs1],
        [p.x + Math.cos(a0) * rs1, p.y0 + SLEEVE.height, p.z + Math.sin(a0) * rs1],
        [1, 1, 1], [Math.cos(am), 0, Math.sin(am)],
        [[ua, v0], [ub, v0], [ub, v1], [ua, v1]],
      );
    }
  }

  // step bolts, alternating sides across the road
  for (let k = 0; k < 6; k++) {
    const y = 33 + k * 13.5;
    const s = k % 2 ? 1 : -1;
    const r = rAt(y);
    const a = fr.p(0, y, s * (r - 0.3));
    const e = fr.p(0, y, s * (r + 2.5));
    const hu = fr.d(0.35, 0, 0);
    b.quad([a[0] - hu[0], a[1], a[2] - hu[2]], [e[0] - hu[0], a[1], e[2] - hu[2]], [e[0] + hu[0], a[1], e[2] + hu[2]], [a[0] + hu[0], a[1], a[2] + hu[2]], STEEL_DK, [0, 1, 0]);
    b.quad([a[0], a[1] - 0.35, a[2]], [e[0], a[1] - 0.35, e[2]], [e[0], a[1] + 0.35, e[2]], [a[0], a[1] + 0.35, a[2]], STEEL_DK, fr.d(1, 0, 0));
  }

  // high-voltage cross-arm with three pin insulators (the middle one on the very top) and two braces
  beam(b, fr.p(0, H - 9, -13), fr.p(0, H - 9, 13), 1.5, 1.8, STEEL);
  for (const v of [-11, 11, 0]) {
    const q = fr.p(0, v === 0 ? H : H - 8.1, v);
    tube(b, q, [q[0], q[1] + 4.6, q[2]], 1.15, 0.65, 5, PORCELAIN);
  }
  for (const s of [-1, 1]) tube(b, fr.p(0, H - 22, s * 1.0), fr.p(0, H - 9, s * 9), 0.45, 0.45, 3, STEEL_DK);

  // low-voltage arm with three knobs
  beam(b, fr.p(0, H - 27, -6.8), fr.p(0, H - 27, 6.8), 1.2, 1.4, STEEL_DK);
  for (const v of [-5.6, 2.9, 5.6]) {
    const q = fr.p(0, H - 26.3, v);
    tube(b, q, [q[0], q[1] + 3, q[2]], 0.95, 0.6, 4, PORCELAIN);
  }

  // transformer (柱上変圧器) on the side away from the road: a grey can, a darker lid and three bushings
  if (p.xfmr) {
    const vc = -road * 5.8;
    const q = fr.p(0, H - 47, vc);
    const y1 = q[1] + 13;
    b.cylinder(q[0], q[2], q[1], y1, 4.3, 4.3, 8, XFMR, false);
    b.cylinder(q[0], q[2], y1, y1 + 1.2, 4.5, 3.6, 8, XFMR_LID, true);
    for (const du of [-2.2, 0, 2.2]) {
      const t = fr.p(du, H - 33.4, vc);
      tube(b, t, [t[0], t[1] + 2.6, t[2]], 0.8, 0.5, 4, PORCELAIN);
    }
    beam(b, fr.p(0, H - 44, -road * 1), fr.p(0, H - 44, -road * 3.6), 1.2, 1.2, STEEL_DK);
  }

  // street light on a short arm towards the road
  if (p.lamp) {
    tube(b, fr.p(0, H - 17, road * 1.0), fr.p(0, H - 12.5, road * 14), 0.6, 0.5, 4, LAMP);
    tube(b, fr.p(0, H - 24, road * 1.2), fr.p(0, H - 14.5, road * 8), 0.4, 0.4, 3, LAMP);
    fr.box(b, -2.3, 2.3, H - 14.4, H - 12.4, Math.min(road * 12, road * 19.5), Math.max(road * 12, road * 19.5), LAMP, { bottom: LENS });
  }

  // a grey junction box on the shaft (光ケーブルの接続箱), on the road side
  if (p.box) {
    fr.box(b, -1.6, 1.6, 44, 51, Math.min(road * 1.2, road * 3.8), Math.max(road * 1.2, road * 3.8), BOX, road > 0 ? { back: false } : { front: false });
  }

  // blue address plate (住居表示), mounted at 45 degrees so that it reads from along the street and from across it
  {
    const uv = tileUv(c.atlas.uv(p.district < 2 ? SIGN.plateA : SIGN.plateB), p.district % 2, 2, 0.0005, 0.0003);
    const y = 30.5;
    const n1 = fr.d(Math.SQRT1_2, 0, road * Math.SQRT1_2);
    const off = rAt(y) + 0.5;
    for (const s of [1, -1]) {
      const N: V3 = [n1[0] * s, 0, n1[2] * s];
      signQuad(sb, [p.x + N[0] * off, p.y0 + y, p.z + N[2] * off], N, [0, 1, 0], 8, 4, uv);
      // the grey back of the plate (without it the lettering would show mirrored from behind)
      panel(b, [p.x + N[0] * (off - 0.12), p.y0 + y, p.z + N[2] * (off - 0.12)], [-N[0], 0, -N[2]], [0, 1, 0], 8, 4, STEEL);
    }
  }

  // vertical advert on the other diagonal, further up
  if (p.advert >= 0) {
    const uv = tileUv(c.atlas.uv(SIGN.ads), p.advert, 4, 0.0005, 0.0003);
    const n1 = fr.d(-Math.SQRT1_2, 0, road * Math.SQRT1_2);
    const off = rAt(46) + 0.5;
    for (const s of [1, -1]) {
      const N: V3 = [n1[0] * s, 0, n1[2] * s];
      signQuad(sb, [p.x + N[0] * off, p.y0 + 46, p.z + N[2] * off], N, [0, 1, 0], 3, 10, uv);
      panel(b, [p.x + N[0] * (off - 0.12), p.y0 + 46, p.z + N[2] * (off - 0.12)], [-N[0], 0, -N[2]], [0, 1, 0], 3, 10, STEEL);
    }
  }
}

/** Wires between two neighbouring poles: 3 high-voltage, 3 low-voltage, a messenger wire and a cable bundle. */
export function wirePoles(c: Ctx, a: Pole, d: Pole): void {
  const L = Math.hypot(a.x - d.x, a.z - d.z);
  if (L > 420) return;
  const b = c.main.at(a.x, a.z);
  const fa = new Fx(a.x, a.y0, a.z, a.nx, a.nz);
  const fd = new Fx(d.x, d.y0, d.z, d.nx, d.nz);
  // the far pole's frame may be mirrored (the road bends): keep the lines parallel in plan
  const sgn = a.nx * d.nx + a.nz * d.nz >= 0 ? 1 : -1;
  const n = L > 150 ? 4 : 3;
  for (const s of SLOTS) {
    const pa = fa.p(0, a.H + s.dy, slotV(s, a.side));
    const pd = fd.p(0, d.H + s.dy, slotV(s, d.side) * sgn);
    const pts = catenary(pa, pd, L * SAG[s.kind], n);
    if (s.kind === 'bundle') {
      for (let i = 0; i + 1 < pts.length; i++) tube(b, pts[i]!, pts[i + 1]!, 0.95, 0.95, 4, WIRE_BUNDLE, { phase: Math.PI / 4 });
    } else if (s.kind === 'msg') {
      ribbon(b, pts, 0.45, WIRE_MSG);
    } else {
      ribbon(b, pts, 0.6, s.kind === 'hv' ? WIRE_HV : WIRE_LV);
    }
  }
}
