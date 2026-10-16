import type { Ctx } from './ctx';
import type { Frame } from './frame';
import { HB, Wall, drift, tone, type Face, type Rng } from './housekit';
import { GLASS_HI, GLASS_LO, CURTAINS, acUnit, sashWindow } from './housedetail';
import { rooftopStuff, signOnFace } from './parts';
import { hex, pick, type RGB } from './util';

/**
 * Apartment blocks (アパート / マンション / タワーマンション). One long face carries the balconies, in bays separated by
 * partition boards, with sliding doors, laundry and air-conditioner units; the other has an exterior corridor (外廊下)
 * with a row of entrance doors and an open exterior staircase (外階段) at one end. The entrance on the front has a canopy,
 * glass doors, a row of letter boxes and the name of the building on a signboard.
 *
 * Balconies, corridor and stairs lie INSIDE the footprint handed in by the caller (the walls are set back from it), so the
 * building takes no more ground than the plain box it replaces.
 */

export interface AptPlan {
  c: Ctx;
  f: Frame;
  hu: number;
  hv: number;
  floors: number;
  label: string;
  tower: boolean;
  wallCol: RGB;
  bandCol: RGB;
  rnd: Rng;
}

const BASE = 4;
const DOORS: RGB[] = [0x3f5f54, 0x6a4a3a, 0x56687a, 0xc8bfa8, 0x7a3f3f, 0x4a4e58].map(hex);
const RAILS: RGB[] = [0xe9ecef, 0xd9dee4, 0xf1ede2, 0xcfd6dd].map(hex);
const LAUNDRY: RGB[] = [0xffffff, 0xf4d4da, 0xbcd8f2, 0xf6e6a0, 0xcfe8c8, 0xe58a8a, 0x7aa6d8, 0xf2f2f2].map(hex);
const WHITE = hex(0xf6f6f2);

/** The part of the front wall taken by the entrance: glass doors in the middle and the letter boxes beside them. */
const inEntrance = (a: number, half: number): boolean => a + half > -24 && a - half < 48;

export function buildApartment(p: AptPlan): void {
  const { c, f, floors, tower, rnd } = p;
  const hu = p.hu;
  const b = c.main.at(f.cx, f.cz);
  const h = new HB(b, f);
  const floorH = tower ? 35 : 36;
  const H = BASE + floors * floorH;
  const zd = Math.min(8, p.hv * 0.18); // depth of the balcony / corridor zone
  const wv = p.hv - zd;
  const wl: Record<Face, Wall> = { f: new Wall(h, 'f', hu, wv), b: new Wall(h, 'b', hu, wv), l: new Wall(h, 'l', hu, wv), r: new Wall(h, 'r', hu, wv) };
  const wall = drift(p.wallCol, rnd, 0.05);
  const ground = tone(wall, 0.93);
  const band = p.bandCol;
  const plinth = hex(0x9c9a94);
  const frame = tower ? hex(0x5a6678) : pick([WHITE, WHITE, hex(0xd3d7db), hex(0x6d5948), hex(0x4b4c52)], rnd);
  const glass: readonly [RGB, RGB] = tower ? [hex(0x5f94c8), hex(0xa8d2f0)] : [GLASS_LO, GLASS_HI];
  const rail = pick(RAILS, rnd);
  const slabCol = tone(wall, 0.9);
  const doorCol = pick(DOORS, rnd);
  const balconyFront = tower || rnd() < 0.6;
  const balF: Face = balconyFront ? 'f' : 'b';
  const corF: Face = balconyFront ? 'b' : 'f';

  // ---- walls ----
  for (const fc of ['f', 'b', 'l', 'r'] as const) {
    const w = wl[fc];
    const half = w.half;
    w.q(-half, half, -2, BASE, 0, tone(plinth, 0.85), plinth);
    for (let fl = 0; fl < floors; fl++) {
      const y0 = BASE + fl * floorH;
      const col = fl === 0 ? ground : wall;
      w.qm(-half, half, y0, y0 + floorH, 0, tone(col, fl === 0 ? 0.9 : 0.97), tone(col, fl === 0 ? 1.0 : 0.96), rnd, 0.05);
      if (fl > 0) w.q(-half - 0.4, half + 0.4, y0 - 1.6, y0 + 0.9, 0.4, tone(band, 0.92), band);
    }
  }

  // ---- roof edge, deck, penthouse ----
  const top = H;
  const par = tone(wall, 0.92);
  const cop = tone(wall, 1.04);
  for (const fc of ['f', 'b', 'l', 'r'] as const) {
    const w = wl[fc];
    w.q(-w.half, w.half, top, top + 5, 0, tone(par, 0.92), par);
  }
  h.wallV(-hu + 2.5, hu - 2.5, top, top + 5, wv - 2.5, -1, par);
  h.wallV(-hu + 2.5, hu - 2.5, top, top + 5, -wv + 2.5, 1, par);
  h.wallU(-wv + 2.5, wv - 2.5, top, top + 5, hu - 2.5, -1, par);
  h.wallU(-wv + 2.5, wv - 2.5, top, top + 5, -hu + 2.5, 1, par);
  h.flat(-hu, hu, wv - 2.5, wv, top + 5, cop);
  h.flat(-hu, hu, -wv, -wv + 2.5, top + 5, cop);
  h.flat(-hu, -hu + 2.5, -wv + 2.5, wv - 2.5, top + 5, cop);
  h.flat(hu - 2.5, hu, -wv + 2.5, wv - 2.5, top + 5, cop);
  h.flat(-hu + 2.5, hu - 2.5, -wv + 2.5, wv - 2.5, top, hex(0x8f978c));
  h.box(-hu * 0.35, hu * 0.35, top, top + 24, -wv * 0.3, wv * 0.3, tone(wall, 0.88), 'fblrt', { lo: tone(wall, 0.8) });

  // ---- bays along the long faces ----
  const nb = Math.max(2, Math.round((hu * 2 - 10) / (tower ? 36 : 34)));
  const bw = (hu * 2 - 10) / nb;
  const bayA = (i: number): number => -hu + 5 + (i + 0.5) * bw;

  // balcony side
  {
    const w = wl[balF];
    const depth = zd - 0.6;
    const railH = 8;
    for (let fl = 0; fl < floors; fl++) {
      const y0 = BASE + fl * floorH;
      if (fl > 0) {
        w.box(-hu + 1, hu - 1, y0 - 2.4, y0, 0, depth + 0.6, slabCol, 'otd', { lo: tone(slabCol, 0.8) });
        w.q(-hu + 1, hu - 1, y0, y0 + railH * 0.7, depth, tone(rail, 0.9), rail);
        w.q(-hu + 1, hu - 1, y0 + railH * 0.7, y0 + railH, depth, WHITE, WHITE);
      }
      for (let i = 0; i < nb; i++) {
        const a = bayA(i);
        if (fl === 0 && balF === 'f' && inEntrance(a, bw / 2)) continue;
        const curtain = !tower && rnd() < 0.35 ? pick(CURTAINS, rnd) : undefined;
        sashWindow(w, a, y0 + (fl > 0 ? 0.6 : 1.2), Math.min(bw - 8, 22), fl > 0 ? 23 : 22, frame, { glass, curtain, curtainSide: -1 });
        if (fl === 0) continue;
        if (i > 0) w.part(a - bw / 2, y0, y0 + railH + 1.5, 0, depth, tone(rail, 0.85), rail);
        if (!tower) {
          if (rnd() < 0.45) {
            const n = 2 + Math.floor(rnd() * 2);
            for (let k = 0; k < n; k++) {
              const col = pick(LAUNDRY, rnd);
              const lw = 3.2 + rnd() * 2.8;
              const lh = 6 + rnd() * 5;
              const ax = a - bw / 2 + 3 + k * ((bw - 8) / n) + rnd() * 1.5;
              w.q(ax, ax + lw, y0 + railH + 8 - lh, y0 + railH + 8, depth - 1, tone(col, 0.86), col);
            }
          } else if (rnd() < 0.18) {
            const col = pick(LAUNDRY, rnd);
            w.q(a - 7, a + 6, y0 + railH - 9, y0 + railH + 1.2, depth + 0.5, tone(col, 0.9), col);
          }
          if (rnd() < 0.3) acUnit(w, a + bw / 2 - 8, y0 - 0.6, rnd);
        }
      }
    }
  }

  // corridor side (not on towers: they have balconies on both long faces)
  const stairLen = tower ? 0 : 36;
  const stairDir: 1 | -1 = rnd() < 0.5 ? -1 : 1;
  {
    const w = wl[corF];
    const depth = zd;
    const railH = 7.5;
    const doorsA0 = stairDir > 0 ? -hu + 5 : -hu + 5 + stairLen;
    const doorsA1 = stairDir > 0 ? hu - 5 - stairLen : hu - 5;
    const nd = Math.max(1, Math.round((doorsA1 - doorsA0) / 30));
    for (let fl = 0; fl < floors; fl++) {
      const y0 = BASE + fl * floorH;
      if (fl > 0) {
        w.box(-hu + 1, hu - 1, y0 - 2.4, y0, 0, depth, slabCol, 'otd', { lo: tone(slabCol, 0.8) });
        w.q(-hu + 1, hu - 1, y0, y0 + railH * 0.7, depth - 0.3, tone(rail, 0.92), rail);
        w.q(-hu + 1, hu - 1, y0 + railH * 0.7, y0 + railH, depth - 0.3, WHITE, WHITE);
      }
      if (tower) {
        for (let i = 0; i < nb; i++) sashWindow(w, bayA(i), y0 + 6, Math.min(bw - 8, 22), 22, frame, { glass });
        continue;
      }
      for (let i = 0; i < nd; i++) {
        const a = doorsA0 + ((i + 0.5) * (doorsA1 - doorsA0)) / nd;
        if (fl === 0 && corF === 'f' && inEntrance(a, 14)) continue;
        w.q(a - 4.4, a + 4.4, y0, y0 + 24, 0.5, tone(doorCol, 0.82), doorCol);
        sashWindow(w, a + 11, y0 + 11, 8, 8, frame, { panes: 1 });
        if (rnd() < 0.25) w.q(a - 6.8, a - 5.6, y0 + 14, y0 + 20, 0.9, hex(0xd6d6d2)); // gas meter pipe
      }
    }
    if (!tower) stairs(w, stairDir > 0 ? hu - 5 - stairLen : -hu + 5 + stairLen, stairDir, floors, floorH, depth, tone(slabCol, 0.95), rail);
  }

  // ---- short sides ----
  for (const fc of ['l', 'r'] as const) {
    const w = wl[fc];
    const n = Math.max(1, Math.floor((w.half * 2 - 20) / 46));
    for (let fl = 0; fl < floors; fl++) {
      const y0 = BASE + fl * floorH;
      for (let i = 0; i < n; i++) {
        const a = -w.half + ((i + 0.5) * w.half * 2) / n;
        sashWindow(w, a, y0 + 10, 16, 15, frame, { glass, panes: 2 });
      }
    }
  }

  // ---- entrance on the front: glass doors, canopy, letter boxes, signboard ----
  {
    const w = wl.f;
    sashWindow(w, 0, BASE, 22, 26, tone(hex(0x4a5a6a), 1), { glass: [hex(0x8fb6d0), hex(0xcfe6f2)], panes: 2 });
    w.box(-26, 26, BASE + 27, BASE + 29.6, 0, 13, tone(wall, 0.78), 'otd');
    w.box(-16, 16, 0, BASE - 0.5, 0, 6, hex(0xc4c1b8), 'ot');
    // letter boxes: a panel with two rows of little doors
    const bx = 22;
    w.q(bx, bx + 22, BASE + 6, BASE + 21, 0.5, hex(0x9aa0a6), hex(0xb4bac0));
    for (let r = 0; r < 2; r++) {
      for (let k = 0; k < 4; k++) {
        const shade = 0.9 + rnd() * 0.18;
        const col: RGB = [0.82 * shade, 0.84 * shade, 0.86 * shade];
        const a0 = bx + 1.2 + k * 5.2;
        w.q(a0, a0 + 4.4, BASE + 7.2 + r * 6.8, BASE + 7.2 + r * 6.8 + 5.8, 0.8, tone(col, 0.9), col);
      }
    }
    const sw = Math.min(46, hu * 1.2);
    const sh = sw / 4;
    signOnFace(c, f, p.label, 0, BASE + 31, sw, sh, wv + 12, 1);
    // two supports under the signboard
    for (const s of [-1, 1]) w.box(s * (sw / 2 - 3) - 0.6, s * (sw / 2 - 3) + 0.6, BASE + 29.6, BASE + 31, 11.4, 12.2, hex(0x555a62), 'oazt');
  }

  // ---- rooftop equipment (draws from the shared generator, as before) ----
  rooftopStuff(c, f, hu, wv, top, tower ? 5 : 3);
  if (tower) {
    // crown + antenna
    h.box(-hu * 0.6, hu * 0.6, top + 24, top + 44, -wv * 0.6, wv * 0.6, tone(wall, 0.85), 'fblrt');
    const pt = f.pt(0, 0, 0);
    b.cylinder(pt[0], pt[2], top + 44, top + 110, 1.8, 0.6, 6, hex(0xd8d8de));
    b.blob(pt[0], top + 111, pt[2], 3, 3, 3, hex(0xe03030), 0);
  }
}

/**
 * Open exterior staircase (外階段) along a wall: switch-back flights between the corridor floors. `aS` is where it meets
 * the corridor, `dir` the direction it runs along the wall from there (towards the end of the building).
 */
function stairs(w: Wall, aS: number, dir: 1 | -1, floors: number, floorH: number, depth: number, col: RGB, rail: RGB): void {
  const len = 30;
  const aE = aS + dir * len;
  const nA1 = depth / 2 - 0.2;
  const nB0 = depth / 2 + 0.2;
  const half = floorH / 2;
  for (let fl = 0; fl < floors - 1; fl++) {
    const yA = BASE + fl * floorH;
    const yM = yA + half;
    const yB = yA + floorH;
    const lo = tone(col, 0.88);
    const hi = tone(col, 1.08);
    // lane A rises away from the corridor, lane B comes back
    w.wq([aS, yA, 0.3], [aE, yM, 0.3], [aE, yM, nA1], [aS, yA, nA1], lo, hi, hi, lo, [0, 1, 0]);
    w.wq([aE, yM, nB0], [aS, yB, nB0], [aS, yB, depth], [aE, yM, depth], hi, lo, lo, hi, [0, 1, 0]);
    // the outer side of lane B: stringer and railing in one board
    w.wq([aE, yM - 2.5, depth], [aS, yB - 2.5, depth], [aS, yB + 6.5, depth], [aE, yM + 6.5, depth], tone(rail, 0.85), tone(rail, 0.85), rail, rail, [0, 0, 1]);
    // the half landing
    const a0 = Math.min(aE, aE + dir * 5);
    const a1 = Math.max(aE, aE + dir * 5);
    w.box(a0, a1, yM - 2, yM, 0, depth, col, 'ot');
  }
}
