import { HB, Wall, tone, type Rng } from './housekit';
import { hex, pick, type RGB, type V3 } from './util';

/**
 * Details of Japanese houses, written against a wall (see {@link Wall}): sashes with mullions and curtains, the
 * entrance with its canopy, air-conditioner outdoor units, drain pipes, meter boxes, balconies with laundry, the
 * gate, block wall and hedge at the street, a garage with a small car, and the odd antenna or solar panel on the roof.
 * Every item is a handful of quads; the callers decide how many of them a given house gets.
 */

export const SASH_FRAMES: RGB[] = [0xf4f4f0, 0xf4f4f0, 0xf4f4f0, 0xf4f4f0, 0xd3d7db, 0xc6cacf, 0x6d5948, 0x4b4c52].map(hex);
export const CURTAINS: RGB[] = [0xf4ecd8, 0xf2cfd4, 0xbfd6ee, 0xd3e6c4, 0xf3e1a6, 0xdcd4e8, 0xf6f2ea, 0xe8b8a0].map(hex);
export const GLASS_HI = hex(0xbde0f6);
export const GLASS_LO = hex(0x7aaed6);
export const CONCRETE = hex(0xc4c1b8);
const WHITE = hex(0xf6f6f2);
const LAUNDRY: RGB[] = [0xffffff, 0xf4d4da, 0xbcd8f2, 0xf6e6a0, 0xcfe8c8, 0xe58a8a, 0x7aa6d8, 0xf2f2f2].map(hex);
const CAR_COLS: RGB[] = [0xf2f2f2, 0xd8d8dc, 0x2a2d35, 0xc03434, 0x3f6fb0, 0x8a8e96, 0xe8d8a8, 0x4f8f5f, 0xf0c8d0].map(hex);

export interface WinOpts {
  /** 1 = a single pane, 2 = two sliding sashes with a mullion between (default). */
  panes?: 1 | 2;
  curtain?: RGB;
  /** Which end the curtain is gathered at (0 = both). */
  curtainSide?: -1 | 0 | 1;
  /** Colour of a sill (a thin slab under the window); `sillFront` adds its front edge. */
  sill?: RGB;
  sillFront?: boolean;
  /** Just a pane of glass on the wall, without a frame (windows nobody looks at closely). */
  bare?: boolean;
  /** Glass colours (lower, upper) instead of the usual sky blue. */
  glass?: readonly [RGB, RGB];
  /** Offset of the whole window out of the wall plane (for a window in the face of a bay). */
  off?: number;
}

/** A sash window: aluminium frame, two panes of glass that reflect the sky, optional curtain and sill. */
export function sashWindow(w: Wall, pos: number, y: number, ww: number, hh: number, frame: RGB, o: WinOpts = {}): void {
  const hw = ww / 2;
  const fw = o.bare ? 0 : 1.3;
  const n0 = o.off ?? 0;
  const gLo = o.glass ? o.glass[0] : GLASS_LO;
  const gHi = o.glass ? o.glass[1] : GLASS_HI;
  if (!o.bare) w.q(pos - hw, pos + hw, y, y + hh, n0 + 0.45, tone(frame, 0.88), frame);
  if (o.panes === 1) {
    w.q(pos - hw + fw, pos + hw - fw, y + fw, y + hh - fw, n0 + 0.85, gLo, gHi);
  } else {
    w.q(pos - hw + fw, pos - 0.6, y + fw, y + hh - fw, n0 + 0.85, gLo, gHi);
    w.q(pos + 0.6, pos + hw - fw, y + fw, y + hh - fw, n0 + 0.85, tone(gLo, 0.94), tone(gHi, 0.94));
  }
  if (o.curtain) {
    const side = o.curtainSide ?? -1;
    const lo = tone(o.curtain, 0.86);
    const iw = ww - fw * 2;
    if (side === 0) {
      w.q(pos - hw + fw, pos - hw + fw + iw * 0.3, y + fw, y + hh - fw, n0 + 1.05, lo, o.curtain);
      w.q(pos + hw - fw - iw * 0.3, pos + hw - fw, y + fw, y + hh - fw, n0 + 1.05, lo, o.curtain);
    } else if (side < 0) {
      w.q(pos - hw + fw, pos - hw + fw + iw * 0.5, y + fw, y + hh - fw, n0 + 1.05, lo, o.curtain);
    } else {
      w.q(pos + hw - fw - iw * 0.5, pos + hw - fw, y + fw, y + hh - fw, n0 + 1.05, lo, o.curtain);
    }
  }
  if (o.sill) w.box(pos - hw - 1.2, pos + hw + 1.2, y - 1.2, y, n0, n0 + 2.2, o.sill, o.sillFront ? 'ot' : 't');
}

/** A rain-shutter box (戸袋) standing against the wall beside a window. */
export function shutterBox(w: Wall, pos: number, y: number, hh: number, side: -1 | 1, col: RGB): void {
  const a0 = side > 0 ? pos : pos - 7;
  w.box(a0, a0 + 7, y - 1.5, y + hh + 1.5, 0, 3, col, side > 0 ? 'ozt' : 'oat', { lo: tone(col, 0.88) });
}

export interface EntranceOpts {
  door: RGB;
  trim: RGB;
  canopy: RGB;
  /** Two slim posts holding up the canopy. */
  posts?: boolean;
  /** Nameplate and intercom beside the door. */
  plate?: boolean;
  /** A door handle and a panel in the lower half of the door. */
  handle?: boolean;
}

/** Front door with frame, glass slit, canopy (庇) and the concrete step in front of it. y0 = floor level. */
export function entrance(w: Wall, pos: number, y0: number, o: EntranceOpts): void {
  w.q(pos - 7, pos + 7, y0, y0 + 26.5, 0.4, tone(o.trim, 0.9), o.trim);
  w.q(pos - 5.8, pos + 5.8, y0, y0 + 25, 0.8, tone(o.door, 0.9), o.door);
  w.q(pos - 3.4, pos + 3.4, y0 + 12.5, y0 + 22.5, 1.15, GLASS_LO, GLASS_HI);
  if (o.handle) {
    w.q(pos - 3.6, pos + 3.6, y0 + 2.5, y0 + 10.5, 1.0, tone(o.door, 0.8), tone(o.door, 0.92));
    w.q(pos + 4.0, pos + 4.8, y0 + 11, y0 + 15.5, 1.3, hex(0xd6d6d2));
  }
  // canopy: slab with its front edge and underside
  w.box(pos - 11, pos + 11, y0 + 27.5, y0 + 29.8, 0, 11, o.canopy, 'otd', { lo: tone(o.canopy, 0.8) });
  w.box(pos - 10, pos + 10, 0, y0 > 2 ? y0 - 0.8 : 2, 0, 7.5, CONCRETE, 'ot', { lo: tone(CONCRETE, 0.9) });
  if (o.posts) {
    for (const s of [-1, 1]) w.box(pos + s * 10 - 1, pos + s * 10 + 1, 0, y0 + 27.5, 8.8, 10.8, WHITE, 'oaz');
  }
  if (o.plate) {
    w.q(pos + 8.4, pos + 11.2, y0 + 15.5, y0 + 18, 0.5, WHITE);
    w.q(pos + 8.8, pos + 10.8, y0 + 19.2, y0 + 21.6, 0.5, hex(0x8c9096));
  }
}

/** Drain pipe (雨樋) running down a wall from the eave. */
export function downpipe(w: Wall, pos: number, yTop: number, col: RGB): void {
  w.q(pos - 0.9, pos + 0.9, 0.5, yTop, 1.2, tone(col, 0.85), col);
}

/** Outdoor unit of an air conditioner (室外機) with its fan grille, standing on the ground or on a balcony. */
export function acUnit(w: Wall, pos: number, y: number, rnd: Rng): void {
  const col = rnd() < 0.6 ? hex(0xf0f0ec) : hex(0xdedfe0);
  w.box(pos - 5.2, pos + 5.2, y + 0.6, y + 8.4, 0.5, 4.4, col, 'ot', { lo: tone(col, 0.9) });
  w.q(pos - 4, pos + 1.4, y + 1.8, y + 7.2, 4.45, hex(0x5d6168));
}

/** The tall hot-water tank (エコキュート) that stands beside many Japanese houses. */
export function heaterTank(w: Wall, pos: number): void {
  const col = hex(0xe9e6df);
  w.box(pos - 3.6, pos + 3.6, 0.5, 17, 0.6, 7.4, col, 'oazt', { lo: tone(col, 0.88) });
  w.q(pos - 2.4, pos + 2.4, 11, 14, 7.45, hex(0x9aa0a8));
}

/** A parked bicycle (ママチャリ) standing in the plane v = const at local (u, v), seen from the front of the building. */
export function bicycle(h: HB, u: number, v: number, col: RGB): void {
  const tyre = hex(0x2c2e33);
  const rim = hex(0xb9bcc2);
  const wheel = (cu: number): void => {
    const r = 4.2;
    // two squares, one turned by 45 degrees, make an octagon
    h.wallV(cu - r * 0.78, cu + r * 0.78, 0.2, 0.2 + r * 1.56, v, 1, tyre);
    h.quad(h.f.pt(cu, 0.2, v + 0.05), h.f.pt(cu + r, 0.2 + r, v + 0.05), h.f.pt(cu, 0.2 + 2 * r, v + 0.05), h.f.pt(cu - r, 0.2 + r, v + 0.05), tyre, h.f.dir(0, 0, 1));
    h.wallV(cu - r * 0.5, cu + r * 0.5, 0.2 + r * 0.5, 0.2 + r * 1.5, v + 0.1, 1, rim);
  };
  wheel(u - 6.5);
  wheel(u + 6.5);
  // frame: seat tube, top tube, down tube and the fork to the handlebar
  const f = h.f;
  const bar = (u0: number, y0: number, u1: number, y1: number): void =>
    h.quad(f.pt(u0, y0, v + 0.3), f.pt(u1, y1, v + 0.3), f.pt(u1 + 0.7, y1, v + 0.3), f.pt(u0 + 0.7, y0, v + 0.3), col, f.dir(0, 0, 1));
  bar(u - 6.5, 4.4, u - 1.5, 9.6);
  bar(u - 1.5, 9.6, u + 5.4, 9.2);
  bar(u - 1.5, 9.6, u + 0.5, 4.4);
  bar(u + 0.5, 4.4, u + 6.5, 4.4);
  h.wallV(u - 3.2, u - 0.2, 10, 10.9, v + 0.3, 1, hex(0x2c2e33));
  h.wallV(u + 4.2, u + 7.2, 9.4, 10.2, v + 0.3, 1, hex(0x8a8e96));
}

/** Gas / electricity meter box on a wall. */
export function meterBox(w: Wall, pos: number, y: number): void {
  w.q(pos - 2.8, pos + 2.8, y, y + 7, 1.6, hex(0xb4b6b9), hex(0xc9cbcd));
}

export interface BalconyOpts {
  /** Railing panel colour. */
  rail: RGB;
  /** Colour of the slab and parapet below. */
  slab: RGB;
  /** The window behind (掃き出し窓) frame colour. */
  frame: RGB;
  laundry?: boolean;
  futon?: boolean;
  ac?: boolean;
  curtain?: RGB;
}

/**
 * Balcony (ベランダ) on an upper floor: slab, solid railing, side panels, the sliding door behind it, and optionally
 * laundry, a futon over the rail and an air-conditioner unit. `y` = floor level of the storey it belongs to.
 */
export function balcony(w: Wall, pos: number, y: number, width: number, depth: number, o: BalconyOpts, rnd: Rng): void {
  const hw = width / 2;
  const railH = 8;
  // the sliding door
  sashWindow(w, pos, y + 0.6, Math.min(width - 6, 22), 22, o.frame, { curtain: o.curtain, curtainSide: -1 });
  // slab: top, edge, underside
  w.box(pos - hw, pos + hw, y - 2.4, y, 0, depth, o.slab, 'otd', { lo: tone(o.slab, 0.78) });
  // railing panel (two tones) and side panels
  const rl = tone(o.rail, 0.9);
  w.q(pos - hw, pos + hw, y, y + railH * 0.68, depth - 0.3, rl, o.rail);
  w.q(pos - hw, pos + hw, y + railH * 0.68, y + railH, depth - 0.3, tone(o.slab, 1.04), WHITE);
  for (const s of [-1, 1]) {
    const a = pos + s * hw;
    w.box(a - 0.2, a + 0.2, y, y + railH, 0, depth, o.rail, 'o', { lo: rl });
  }
  if (o.ac) acUnit(w, pos + hw - 8, y - 0.6, rnd);
  if (o.futon) {
    const c = pick(LAUNDRY, rnd);
    const fx = pos - hw + 3 + rnd() * (width - 22);
    w.q(fx, fx + 13, y + railH - 9.5, y + railH + 1.2, depth + 0.5, tone(c, 0.9), c);
  }
  if (o.laundry) {
    const n = 2 + Math.floor(rnd() * 3);
    const x0 = pos - hw + 4 + rnd() * 4;
    for (let i = 0; i < n; i++) {
      const c = pick(LAUNDRY, rnd);
      const lw = 3.6 + rnd() * 2.6;
      const lh = 6 + rnd() * 5;
      const ax = x0 + i * ((width - 12) / n) + rnd() * 2;
      w.q(ax, ax + lw, y + railH + 8 - lh, y + railH + 8, depth - 1.2, tone(c, 0.86), c);
    }
  }
}

/** Colours of a front yard boundary. */
export interface FenceOpts {
  wall: RGB;
  coping: RGB;
  /** Height of the block wall. */
  height: number;
  /** A few open decorative blocks (透かしブロック) near the top. */
  lattice?: boolean;
  /** Gives the wall an uneven, weathered colour. */
  rnd?: Rng;
}

/**
 * Block wall (ブロック塀) along the front of a plot between local u = a0..a1, v = v0..v1: two courses, coping and the
 * end face towards the gate (`endAt`: -1 = at a0, 1 = at a1, 0 = none).
 */
export function blockWall(h: HB, a0: number, a1: number, v0: number, v1: number, o: FenceOpts, endAt: -1 | 0 | 1): void {
  if (a1 - a0 < 2) return;
  const hh = o.height;
  const c = o.wall;
  if (o.rnd) {
    h.wallVm(a0, a1, 0, hh * 0.42, v1, 1, tone(c, 0.84), tone(c, 0.93), o.rnd, 0.07);
    h.wallVm(a0, a1, hh * 0.42, hh, v1, 1, tone(c, 0.98), tone(c, 1.04), o.rnd, 0.07);
  } else {
    h.wallV(a0, a1, 0, hh * 0.42, v1, 1, tone(c, 0.84), tone(c, 0.93));
    h.wallV(a0, a1, hh * 0.42, hh, v1, 1, tone(c, 0.98), tone(c, 1.04));
  }
  h.flat(a0 - 0.4, a1 + 0.4, v0 - 0.5, v1 + 0.5, hh + 0.5, o.coping, true);
  if (o.lattice && a1 - a0 > 24 && hh > 9) {
    const dark = tone(c, 0.42);
    const mid = (a0 + a1) / 2;
    for (let k = -1; k <= 1; k++) {
      const u = mid + k * 4.4;
      h.wallV(u - 1.4, u + 1.4, hh * 0.58, hh * 0.58 + 2.8, v1 + 0.15, 1, dark);
    }
  }
  if (endAt !== 0) {
    const ua = endAt < 0 ? a0 : a1;
    h.wallU(v0, v1, 0, hh, ua, endAt, tone(c, 0.8), tone(c, 0.9));
  }
}

export interface HedgeOpts {
  base: RGB;
  top: RGB;
  height: number;
  flowers?: RGB;
}

/** Clipped hedge (生け垣): a dark foot, a lighter face, a ruffled top and optional azalea blossoms. */
export function hedge(h: HB, a0: number, a1: number, v0: number, v1: number, o: HedgeOpts, endAt: -1 | 0 | 1, rnd: Rng): void {
  if (a1 - a0 < 2) return;
  const hh = o.height;
  h.wallV(a0, a1, 0, hh * 0.35, v1, 1, tone(o.base, 0.7), tone(o.base, 0.92));
  // the face and the top in lumps of slightly different green, each corner a little different
  const f = h.f;
  const jit = (c: RGB): RGB => tone(c, 0.93 + rnd() * 0.14);
  const cols = Math.max(1, Math.round((a1 - a0) / 11));
  for (let i = 0; i < cols; i++) {
    const k = 0.92 + rnd() * 0.16;
    const ua = a0 + ((a1 - a0) * i) / cols;
    const ub = a0 + ((a1 - a0) * (i + 1)) / cols;
    const lo = tone(o.base, k);
    const hi = tone(o.top, k);
    h.quadC(f.pt(ua, hh * 0.35, v1), f.pt(ub, hh * 0.35, v1), f.pt(ub, hh, v1), f.pt(ua, hh, v1), jit(lo), jit(lo), jit(hi), jit(hi), f.dir(0, 0, 1));
    h.quadC(f.pt(ua, hh, v0), f.pt(ub, hh, v0), f.pt(ub, hh, v1), f.pt(ua, hh, v1), jit(hi), jit(hi), jit(hi), jit(hi), f.dir(0, 1, 0));
  }
  if (endAt !== 0) h.wallU(v0, v1, 0, hh, endAt < 0 ? a0 : a1, endAt, tone(o.base, 0.8), tone(o.base, 0.95));
  if (o.flowers) {
    const n = Math.max(2, Math.floor((a1 - a0) / 7));
    for (let i = 0; i < n; i++) {
      const u = a0 + 2 + rnd() * (a1 - a0 - 4);
      const y = hh * (0.5 + rnd() * 0.45);
      const s = 0.9 + rnd() * 0.6;
      h.quad(h.f.pt(u, y, v1 + 0.2), h.f.pt(u + s, y, v1 + 0.2), h.f.pt(u + s, y + s, v1 + 0.2), h.f.pt(u, y + s, v1 + 0.2), tone(o.flowers, 0.92 + rnd() * 0.14), h.f.dir(0, 0, 1));
    }
  }
}

/** Gate pillar (門柱) with a nameplate and a letter box. */
export function gatePillar(h: HB, u: number, v0: number, v1: number, col: RGB, mail: RGB, plate: boolean): void {
  h.box(u - 3, u + 3, 0, 17, v0 - 0.4, v1 + 0.9, col, 'frlt', { lo: tone(col, 0.82), top: tone(col, 1.08) });
  if (plate) {
    const vf = v1 + 1.0;
    h.wallV(u - 2, u + 2, 11, 13.6, vf, 1, WHITE);
    h.wallV(u - 2.2, u + 2.2, 6.6, 10, vf + 0.5, 1, tone(mail, 0.85), mail);
  }
}

/** A pair of gate leaves (門扉) closing the opening a0..a1 of the fence. */
export function gateLeaves(h: HB, a0: number, a1: number, v: number, col: RGB, height: number): void {
  const mid = (a0 + a1) / 2;
  h.wallV(a0 + 0.3, mid - 0.2, 1.2, height, v + 0.3, 1, tone(col, 0.8), tone(col, 1.15));
  h.wallV(mid + 0.2, a1 - 0.3, 1.2, height, v + 0.3, 1, tone(col, 0.8), tone(col, 1.15));
}

/** Low-poly shrub (a squashed four-sided dome, 12 vertices). */
export function shrub(h: HB, u: number, v: number, r: number, col: RGB, rnd: Rng): void {
  const f = h.f;
  const c0 = f.pt(u, r * 0.35, v);
  const top = f.pt(u, r * 1.05, v);
  const a0 = rnd() * Math.PI;
  const ring = [0, 1, 2, 3].map((i) => {
    const a = a0 + (i / 4) * Math.PI * 2;
    return f.pt(u + Math.cos(a) * r, r * 0.35, v + Math.sin(a) * r * 0.9);
  });
  for (let i = 0; i < 4; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % 4]!;
    const c = tone(col, 0.9 + rnd() * 0.22);
    const hint: V3 = [(top[0] + p[0] + q[0]) / 3 - c0[0], (top[1] + p[1] + q[1]) / 3 - c0[1], (top[2] + p[2] + q[2]) / 3 - c0[2]];
    h.triC(top, p, q, tone(c, 1.1), c, tone(c, 0.94), hint);
  }
}

/** Flower pot with a plant: a small box and a leafy shrub on top. */
export function pot(h: HB, u: number, v: number, potCol: RGB, leaf: RGB, rnd: Rng): void {
  h.box(u - 2, u + 2, 0, 4.2, v - 2, v + 2, potCol, 'fbrl', { lo: tone(potCol, 0.82) });
  h.flat(u - 1.7, u + 1.7, v - 1.7, v + 1.7, 4.0, hex(0x5a4430), true);
  shrub(h, u, v, 3.4, leaf, rnd);
}

/** A small car seen from the front, parked with its nose towards the street at (u, v) on the local ground. */
export function smallCar(h: HB, u: number, y: number, v: number, col: RGB, rnd: Rng): void {
  const glass = tone(GLASS_LO, 0.75);
  const dark = hex(0x2a2c30);
  const body = col;
  const len = 38;
  const hw = 8.4;
  // lower body (nose, flanks, bonnet) and cabin
  h.wallV(u - hw, u + hw, y + 1.4, y + 6.6, v, 1, tone(body, 0.82), body);
  h.wallV(u - hw + 1.2, u + hw - 1.2, y + 1.4, y + 3.2, v + 0.2, 1, dark);
  h.box(u - hw + 0.4, u - hw + 2.4, y + 4, y + 5.6, v - 0.2, v + 0.3, hex(0xfff4c8), 'f');
  h.box(u + hw - 2.4, u + hw - 0.4, y + 4, y + 5.6, v - 0.2, v + 0.3, hex(0xfff4c8), 'f');
  h.quadL([u - hw, y + 6.6, v], [u + hw, y + 6.6, v], [u + hw - 0.8, y + 7, v - 9], [u - hw + 0.8, y + 7, v - 9], tone(body, 1.05), tone(body, 1.05), body, body, [0, 1, 0]);
  // windscreen, roof, sides
  h.quadL([u - hw + 0.9, y + 7, v - 9], [u + hw - 0.9, y + 7, v - 9], [u + hw - 1.6, y + 12.6, v - 15], [u - hw + 1.6, y + 12.6, v - 15], glass, glass, tone(glass, 1.15), tone(glass, 1.15), [0, 0.8, 0.6]);
  h.quadL([u - hw + 1.6, y + 12.6, v - 15], [u + hw - 1.6, y + 12.6, v - 15], [u + hw - 1.6, y + 12.8, v - len + 6], [u - hw + 1.6, y + 12.8, v - len + 6], tone(body, 1.06), tone(body, 1.06), body, body, [0, 1, 0]);
  for (const s of [-1, 1]) {
    h.quadL([u + s * hw, y + 1.4, v], [u + s * hw, y + 1.4, v - len], [u + s * hw, y + 7, v - len], [u + s * hw, y + 7, v], tone(body, 0.8), tone(body, 0.8), body, body, [s, 0, 0]);
    h.quadL([u + s * (hw - 0.9), y + 7, v - 9], [u + s * (hw - 0.9), y + 7, v - len + 7], [u + s * (hw - 1.6), y + 12.6, v - len + 8], [u + s * (hw - 1.6), y + 12.6, v - 15], glass, glass, tone(glass, 1.12), tone(glass, 1.12), [s, 0.2, 0]);
  }
  void rnd;
}

export const carColour = (rnd: Rng): RGB => pick(CAR_COLS, rnd);

/** Roof-top TV antenna (八木アンテナ): a pole, a boom and three elements, standing at local (u, v) on height y. */
export function antenna(h: HB, u: number, y: number, v: number): void {
  const col = hex(0x9a9ea4);
  const top = y + 13;
  h.wallV(u - 0.3, u + 0.3, y, top, v, 1, col);
  h.wallU(v - 0.3, v + 0.3, y, top, u, 1, col);
  h.wallU(v - 5, v + 5, top, top + 0.7, u, 1, col);
  for (const [dv, len] of [[-4.2, 9], [0, 8], [4.2, 7]] as const) h.wallV(u - len / 2, u + len / 2, top - 0.2, top + 0.5, v + dv, 1, col);
}
