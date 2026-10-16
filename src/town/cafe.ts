import type { Ctx } from './ctx';
import type { Frame } from './frame';
import { Kit } from './kit';
import { hex, shade, type Rect, type RGB } from './util';

const CREAM = hex(0xf3e7cc);
const CREAM_SIDE = hex(0xe5d7b8);
const WOOD = hex(0x8c5c36);
const WOOD_DARK = hex(0x5a3820);
const WOOD_LIGHT = hex(0xcb9c64);
const BRICK = hex(0xa4513a);
const ROOF = hex(0x8b4637);
const RED = hex(0xc8281e);
const STRIPE_WHITE = hex(0xfbf6ea);
const SHUTTER = hex(0x587c5c);
const TERRACOTTA = hex(0xc0683f);
const FLOWERS: RGB[] = [hex(0xf29bb8), hex(0xf6d94a), hex(0xfaf6ee), hex(0xe9604f), hex(0xb89ae0), hex(0xf29bb8)];

function chair(k: Kit, u: number, v: number, y: number, towards: 1 | -1): void {
  // `towards`: direction of the table from the chair along v; the back is on the far side
  k.box(u - 2.8, u + 2.8, y + 5, y + 6, v - 2.8, v + 2.8, WOOD_LIGHT);
  const bv = towards > 0 ? v - 2.8 : v + 2;
  for (const du of [-2.2, 2.2]) k.box(u + du - 0.4, u + du + 0.4, y + 6, y + 12.5, bv, bv + 0.8, WOOD); // back posts
  k.box(u - 2.8, u + 2.8, y + 11, y + 12.5, bv, bv + 0.8, WOOD);
  k.box(u - 2.8, u + 2.8, y + 8.2, y + 9, bv, bv + 0.8, WOOD);
  for (const dv of [-2.2, 2.2]) for (const du of [-2.2, 2.2]) k.box(u + du - 0.4, u + du + 0.4, y, y + 5, v + dv - 0.4, v + dv + 0.4, WOOD);
}

function table(k: Kit, u: number, v: number, y: number, seed: number): void {
  k.cyl(u, v, y + 8.4, y + 9.2, 5.6, 5.6, 10, WOOD_LIGHT);
  k.cyl(u, v, y, y + 8.4, 0.7, 0.7, 5, WOOD_DARK);
  k.cyl(u, v, y, y + 0.8, 2.6, 2.6, 8, WOOD_DARK);
  k.cyl(u + 1, v, y + 9.2, y + 11.2, 0.55, 0.4, 5, hex(0xe8e3d6)); // little vase
  k.blob(u + 1, y + 12, v, 1.2, 1, 1.2, FLOWERS[seed % FLOWERS.length]!, 0.1, seed);
  chair(k, u, v + 8.4, y, -1);
  chair(k, u, v - 8.4, y, 1);
}

function pot(k: Kit, u: number, v: number, y: number, h: number, leaf: RGB): void {
  k.cyl(u, v, y, y + h, h * 0.42, h * 0.55, 8, TERRACOTTA);
  k.blob(u, y + h + 2.5, v, h * 0.62, h * 0.5, h * 0.62, leaf, 0.12, u + v);
}

export function addCafe(c: Ctx, rect: Rect, f: Frame, W: number, D: number): void {
  const k = new Kit(c, f);
  const P = 6; // deck and floor level
  const FL = 6.2;
  const GF = 54; // underside of the upper floor
  const UF = 88; // eave line
  const DK = 38; // depth of the deck
  const T = 5; // thickness of the front wall
  const doorC = 4;
  const bayA: [number, number] = [24, 60];
  const bayB: [number, number] = [-62, -16];

  // ---- body -------------------------------------------------------------------------------------------------------
  k.box(-W, W, 0, P, -D, D, hex(0xa8917a));
  k.fa(-W, W, P, GF, -D, -1, CREAM_SIDE);
  k.sd(-D, D, P, GF, -W, -1, CREAM_SIDE);
  k.sd(-D, D, P, GF, W, 1, CREAM_SIDE);
  k.box(-W, W, GF, UF, -D, D - 1.5, CREAM);
  const openings: [number, number, number, number][] = [[bayA[0], bayA[1], 13, 40], [bayB[0], bayB[1], 13, 40], [doorC - 10, doorC + 10, FL, 38.5]];
  k.wall(-W, W, P, GF, D - T, D, CREAM, openings);
  // window frames, glass and flower boxes
  for (const [a, b] of [bayA, bayB]) {
    const n = Math.max(2, Math.round((b - a) / 19));
    const pw = (b - a) / n;
    k.box(a - 1, b + 1, 11.6, 13, D - T - 0.2, D + 2.6, WOOD); // sill
    k.box(a - 1, b + 1, 40, 42.2, D - T, D + 1.2, WOOD); // head
    k.box(a - 1, a + 0.6, 13, 40, D - T, D + 0.8, WOOD);
    k.box(b - 0.6, b + 1, 13, 40, D - T, D + 0.8, WOOD);
    k.box(a, b, 29.4, 30.8, D - 4.6, D - 0.4, WOOD); // transom
    for (let i = 1; i < n; i++) k.box(a + pw * i - 0.8, a + pw * i + 0.8, 13, 40, D - 4.6, D - 0.4, WOOD);
    k.pane(a, b, 13, 40, D - 2.6);
    // flower box under the window
    k.box(a + 1, b - 1, 8.6, 12, D + 0.4, D + 4.6, WOOD_DARK);
    const nb = Math.round((b - a) / 9);
    for (let i = 0; i < nb; i++) k.blob(a + 5 + (i * (b - a - 10)) / Math.max(1, nb - 1), 13.2, D + 2.5, 2.8, 2.2, 2.6, FLOWERS[(i + (a > 0 ? 0 : 2)) % FLOWERS.length]!, 0.1, i + a);
  }
  // door
  k.pane(doorC - 9, doorC + 9, 17, 37.5, D - 2.6);
  k.box(doorC - 10, doorC + 10, FL, 17, D - 3.6, D - 1.6, WOOD);
  k.box(doorC - 10, doorC - 8.6, FL, 38.5, D - 4, D - 1.2, WOOD);
  k.box(doorC + 8.6, doorC + 10, FL, 38.5, D - 4, D - 1.2, WOOD);
  k.box(doorC - 10, doorC + 10, 37.3, 40.2, D - T, D + 1.2, WOOD);
  k.box(doorC - 0.7, doorC + 0.7, 17, 37.5, D - 3.8, D - 1.4, WOOD);
  k.box(doorC + 5.6, doorC + 6.4, 20, 27, D - 1.2, D + 0.2, hex(0xd8c070)); // handle
  k.tf(k.uv('OPEN'), doorC - 3.6, doorC + 3.6, 28, 32, D - 1.3, 1);
  // upper floor: shuttered windows with flower boxes
  for (const u of [-38, 0, 38]) {
    k.box(u - 8.6, u + 8.6, 61, 63, D - 1.5, D + 1.2, WOOD);
    k.fa(u - 7, u + 7, 63, 80, D - 1.2, 1, hex(0x7d93a9));
    k.fa(u - 0.4, u + 0.4, 63, 80, D - 1, 1, WOOD);
    k.fa(u - 7, u + 7, 70.8, 71.6, D - 1, 1, WOOD);
    k.box(u - 8.6, u + 8.6, 80, 82, D - 1.5, D + 1.2, WOOD);
    for (const s of [-1, 1] as const) {
      const a = u + s * 8.8;
      k.box(Math.min(a, a + s * 5.6), Math.max(a, a + s * 5.6), 62, 81, D - 1.5, D - 0.6, SHUTTER);
      for (let y = 64; y < 80; y += 3.2) k.fa(Math.min(a, a + s * 5.6) + 0.5, Math.max(a, a + s * 5.6) - 0.5, y, y + 0.9, D - 0.5, 1, shade(SHUTTER, 0.68));
    }
    k.box(u - 8, u + 8, 57.5, 61, D + 0.5, D + 4.4, WOOD_DARK);
    for (let i = 0; i < 4; i++) k.blob(u - 6 + i * 4, 62, D + 2.4, 2.2, 1.8, 2.2, FLOWERS[(i + 1) % FLOWERS.length]!, 0.1, i + u);
  }

  // windows on both side walls (the sides show from the street at an angle)
  for (const s of [-1, 1] as const) {
    const u = s * W;
    for (const v of [-24, 20]) {
      k.sd(v - 8.6, v + 8.6, 13.4, 38.6, u + s * 0.2, s, WOOD);
      k.sd(v - 7.2, v + 7.2, 15, 37, u + s * 0.3, s, hex(0x8aa0b4));
      k.sd(v - 0.4, v + 0.4, 15, 37, u + s * 0.4, s, WOOD);
    }
    for (const v of [-30, 0, 30]) {
      k.sd(v - 7.4, v + 7.4, 61.4, 80.6, u + s * 0.2, s, WOOD);
      k.sd(v - 6, v + 6, 63, 79, u + s * 0.3, s, hex(0x7d93a9));
      k.sd(v - 0.4, v + 0.4, 63, 79, u + s * 0.4, s, WOOD);
      for (const t of [-1, 1] as const) k.sd(Math.min(v + t * 7.6, v + t * 12.6), Math.max(v + t * 7.6, v + t * 12.6), 62, 80, u + s * 0.3, s, SHUTTER);
    }
  }

  // ---- roof -------------------------------------------------------------------------------------------------------
  f.gable(k.m, -W, W, -D, D - 1.5, UF, 24, 'u', 8, ROOF, CREAM);
  k.box(-W - 8.5, W + 8.5, UF + 23, UF + 26.5, -2.4, 2.4, shade(ROOF, 0.7));
  const slope = (t: number): [number, number] => [(D + 6.5) * (1 - t), UF - 3 + 27 * t];
  for (let i = 1; i < 8; i++) {
    const [va, ya] = slope(i / 8 - 0.012);
    const [vb, yb] = slope(i / 8 + 0.012);
    k.quad([-W - 8, ya + 0.12, va], [W + 8, ya + 0.12, va], [W + 8, yb + 0.12, vb], [-W - 8, yb + 0.12, vb], shade(ROOF, 0.72), [0, D + 6.5, 27]);
  }
  k.box(W - 26, W - 19, UF + 8, UF + 34, -D + 14, -D + 21, BRICK); // chimney
  k.box(W - 27, W - 18, UF + 34, UF + 36, -D + 13, -D + 22, hex(0x6a3a2c));

  // ---- the awning (red and white stripes) --------------------------------------------------------------------------
  const aOut = 26;
  const stripes = Math.round((2 * W) / 11);
  const sw = (2 * W) / stripes;
  for (let i = 0; i < stripes; i++) {
    const u0 = -W + i * sw;
    const u1 = u0 + sw;
    const col = i % 2 ? STRIPE_WHITE : RED;
    k.quad([u0, 46, D + 0.8], [u1, 46, D + 0.8], [u1, 38, D + aOut], [u0, 38, D + aOut], col, [0, aOut, 8]);
    k.quad([u0, 38, D + aOut], [u1, 38, D + aOut], [u1, 31.5, D + aOut + 0.4], [u0, 31.5, D + aOut + 0.4], col, [0, 0, 1]);
    k.quad([u0, 45.2, D + 0.8], [u0, 37.2, D + aOut], [u1, 37.2, D + aOut], [u1, 45.2, D + 0.8], shade(col, 0.72), [0, -1, 0]);
  }
  for (const u of [-W + 1.2, W - 1.2]) k.quad([u - 0.3, 46, D + 0.8], [u - 0.3, 38, D + aOut], [u - 0.3, 31.5, D + aOut + 0.4], [u - 0.3, 45, D + 0.8], shade(RED, 0.8), [u, 0, 0]);

  // ---- the sign, and a hanging board ------------------------------------------------------------------------------
  k.box(-32, 32, 48, 62, D + 0.5, D + 2.3, WOOD_DARK);
  k.ibox(-32, -24, 48.4, 61.6, D + 2.3, D + 2.6, hex(0x5a3a26), 'TFLR');
  k.ibox(24, 32, 48.4, 61.6, D + 2.3, D + 2.6, hex(0x5a3a26), 'TFLR');
  k.tf(k.uv('喫茶 はるいろ'), -24, 24, 48.5, 61.5, D + 2.6, 1);
  const bladeU = bayB[0] - 3;
  k.box(bladeU - 1.1, bladeU + 1.1, 29, 53, D + 3.2, D + 10.4, WOOD_DARK);
  k.ts(k.uv('v:カフェ'), D + 3.4, D + 10.2, 29.3, 52.7, bladeU + 1.2, 1);
  k.ts(k.uv('v:カフェ'), D + 3.4, D + 10.2, 29.3, 52.7, bladeU - 1.2, -1);
  k.box(bladeU - 0.4, bladeU + 0.4, 52.7, 54, D + 0.6, D + 10.6, WOOD_DARK);

  // ---- the room behind the glass -----------------------------------------------------------------------------------
  const rb = -D + 18;
  const rU = W - 2.5;
  const rf = D - T + 0.6;
  const cl = GF - 1.5;
  k.th(k.uv('floor:wood'), -rU, rU, rb, rf, FL + 0.02, true, [1.1, 1.02, 0.9]);
  k.ihz(-rU, rU, rb, rf, cl, false, hex(0xf4e6c8));
  k.ifa(-rU, rU, FL, cl, rb, 1, hex(0xeed6ac));
  k.ifa(-rU, rU, FL, 21, rb + 0.08, 1, hex(0x7e5434)); // wainscot
  k.isd(rb, rf, FL, cl, -rU, 1, hex(0xeed6ac));
  k.isd(rb, rf, FL, cl, rU, -1, hex(0xeed6ac));
  k.isd(rb, rf, FL, 21, -rU + 0.08, 1, hex(0x7e5434));
  k.tf(k.uv('in:bottles'), -52, 52, 24, 48, rb + 0.12, 1, [1.1, 1.02, 0.92]);
  k.ts(k.uv('chalk:cafe'), -24, -3, 22, 49, -rU + 0.2, 1);
  k.ts(k.uv('p:coffee'), 26, 38, 26, 42, -rU + 0.2, 1);
  for (const u of [-40, -6, 28]) {
    k.ibox(u - 0.15, u + 0.15, cl - 9, cl, 20, 20.3, hex(0x3a2a20)); // pendant lamps
    k.icyl(u, 20.1, cl - 15, cl - 9, 4.2, 1.4, 8, [1.55, 1.3, 0.92], false);
    k.icyl(u, 20.1, cl - 15.4, cl - 15, 1.8, 1.8, 6, [1.9, 1.7, 1.2], false);
  }
  for (let u = -66; u <= 66; u += 22) k.ibox(u - 1.7, u + 1.7, cl - 3.4, cl, rb, rf, hex(0x6a4630), 'BFL');
  // counter, espresso machine, cakes and stools
  k.ibox(-48, 8, FL, 17.5, rb + 6, rb + 17, hex(0x6a4630));
  k.ibox(-48.6, 8.6, 17.5, 18.6, rb + 5.4, rb + 17.6, hex(0xf2e8d4), 'TFKLR');
  k.ibox(-32, -19, 18.6, 24, rb + 8, rb + 14, hex(0x9aa0a8));
  k.ibox(-33, -18, 24, 25, rb + 7.6, rb + 14.4, hex(0x30343a));
  for (let i = 0; i < 4; i++) k.ibox(-10 + i * 4.6, -6.4 + i * 4.6, 18.6, 22.2, rb + 12, rb + 15.6, [hex(0xf3c7d4), hex(0xf7e6b0), hex(0xd9b48a), hex(0xfaf3ea)][i]!);
  for (const u of [-38, -22, -6]) {
    k.icyl(u, rb + 24, FL, FL + 7, 0.7, 0.7, 5, hex(0x3a2a20), false);
    k.icyl(u, rb + 24, FL + 7, FL + 8.4, 2.9, 2.9, 8, RED);
  }
  // two small tables near the window on the left bay
  const tv = D - 20;
  for (const u of [-52, -32]) {
    k.icyl(u, tv, FL + 8.4, FL + 9.2, 5, 5, 8, hex(0xd6b080));
    k.icyl(u, tv, FL, FL + 8.4, 0.6, 0.6, 5, hex(0x3a2a20), false);
    k.ibox(u - 2.6, u + 2.6, FL + 5, FL + 6, tv + 6.5, tv + 11.5, hex(0x7a5232));
    k.ibox(u - 2.6, u + 2.6, FL + 6, FL + 12, tv + 11, tv + 11.8, hex(0x5a3820));
  }

  // ---- the raised deck, steps, railing --------------------------------------------------------------------------
  const dw = W + 8;
  k.box(-dw, dw, 0, P, D, D + DK, WOOD_DARK);
  k.th(k.uv('deck'), -dw, dw, D, D + DK, P + 0.03, true);
  k.fa(-dw, dw, 0.4, P, D + DK + 0.02, 1, WOOD);
  k.box(-22, 22, 0, 3, D + DK, D + DK + 6, WOOD_LIGHT);
  k.box(-22, 22, 3, 3.5, D + DK - 0.4, D + DK + 6.4, hex(0xe0b57c));
  const rail = (u0: number, u1: number, v0: number, v1: number): void => {
    const alongU = Math.abs(u1 - u0) > Math.abs(v1 - v0);
    const n = Math.max(1, Math.round(Math.max(Math.abs(u1 - u0), Math.abs(v1 - v0)) / 20));
    for (let i = 0; i <= n; i++) {
      const u = u0 + ((u1 - u0) * i) / n;
      const v = v0 + ((v1 - v0) * i) / n;
      k.box(u - 0.9, u + 0.9, P, P + 10.5, v - 0.9, v + 0.9, WOOD);
    }
    if (alongU) {
      k.box(Math.min(u0, u1), Math.max(u0, u1), P + 9.6, P + 11, v0 - 0.8, v0 + 0.8, WOOD_LIGHT);
      k.box(Math.min(u0, u1), Math.max(u0, u1), P + 5, P + 6, v0 - 0.5, v0 + 0.5, WOOD);
    } else {
      k.box(u0 - 0.8, u0 + 0.8, P + 9.6, P + 11, Math.min(v0, v1), Math.max(v0, v1), WOOD_LIGHT);
      k.box(u0 - 0.5, u0 + 0.5, P + 5, P + 6, Math.min(v0, v1), Math.max(v0, v1), WOOD);
    }
  };
  rail(-dw + 1, -23, D + DK - 1, D + DK - 1);
  rail(23, dw - 1, D + DK - 1, D + DK - 1);
  rail(-dw + 1, -dw + 1, D + 2, D + DK - 1);
  rail(dw - 1, dw - 1, D + 2, D + DK - 1);

  // ---- on the deck: tables, planter, olive tree, chalkboard, potted plants ----------------------------------------------
  table(k, 34, D + 17, P, 1);
  table(k, -4, D + 14, P, 2);
  table(k, -44, D + 18, P, 3);
  // brick planter with flowers along the front edge
  const pl0 = 40;
  const pl1 = 66;
  const pv0 = D + DK - 11;
  const pv1 = D + DK - 3;
  k.box(pl0, pl1, P, P + 9, pv0, pv1, BRICK);
  k.tf(k.uv('brick'), pl0, pl1, P + 0.4, P + 8.6, pv1 + 0.05, 1);
  k.ts(k.uv('brick'), pv0, pv1, P + 0.4, P + 8.6, pl0 - 0.05, -1);
  k.ts(k.uv('brick'), pv0, pv1, P + 0.4, P + 8.6, pl1 + 0.05, 1);
  k.box(pl0 + 0.8, pl1 - 0.8, P + 9, P + 9.6, pv0 + 0.8, pv1 - 0.8, hex(0x4a3020));
  for (let i = 0; i < 8; i++) {
    const u = pl0 + 3 + (i * (pl1 - pl0 - 6)) / 7;
    const v = (pv0 + pv1) / 2 + (i % 2 ? 1.4 : -1.4);
    k.blob(u, P + 11, v, 3.4, 2.4, 2.8, hex(0x5e9a4c), 0.12, i);
    k.blob(u + 0.4, P + 13.2, v, 2.4, 1.9, 2.2, FLOWERS[i % FLOWERS.length]!, 0.1, i + 7);
  }
  // olive tree in a pot at the far end of the deck
  const ou = -dw + 10;
  k.cyl(ou, D + 9, P, P + 9, 4.2, 5.2, 8, hex(0xb9a48a));
  k.cyl(ou, D + 9, P + 9, P + 26, 1, 0.7, 6, hex(0x6a5a46), false);
  for (const [du, dy, dv, r] of [[0, 30, 0, 6.5], [-3.5, 26, 1.5, 5], [3.4, 27, -1.5, 5.2], [0.5, 35, 0.5, 4.6]] as const) {
    k.blob(ou + du, P + dy, D + 9 + dv, r, r * 0.8, r, hex(0x8fa586), 0.1, du + dy);
  }
  // A-frame chalkboard near the steps
  const au = 28;
  const av = D + DK - 14;
  k.tq(k.uv('chalk:cafe'), [au + 6, P, av + 4.4], [au - 6, P, av + 4.4], [au - 6, P + 17.5, av + 0.8], [au + 6, P + 17.5, av + 0.8], [0, 4, 8]);
  k.quad([au - 6, P, av - 4.4], [au + 6, P, av - 4.4], [au + 6, P + 17.5, av - 0.8], [au - 6, P + 17.5, av - 0.8], WOOD, [0, 4, -8]);
  k.box(au - 6.4, au + 6.4, P + 17.2, P + 18.2, av - 1.2, av + 1.2, WOOD_DARK);
  // potted plants by the door
  pot(k, doorC - 14, D + 4, P, 6, hex(0x5e9a4c));
  pot(k, doorC + 14, D + 4, P, 5, hex(0x6bab55));
  // hanging flower baskets under the awning front
  for (const u of [-40, 6, 48]) {
    k.box(u - 0.2, u + 0.2, 36, 41, D + aOut - 3.1, D + aOut - 2.7, WOOD_DARK);
    k.cyl(u, D + aOut - 2.9, 33.4, 36.4, 2.2, 3.2, 8, WOOD_DARK);
    k.blob(u, 37.2, D + aOut - 2.9, 3.4, 2.2, 3.2, hex(0x5e9a4c), 0.1, u);
    k.blob(u + 1, 38.4, D + aOut - 2.9, 2.2, 1.6, 2.1, FLOWERS[Math.abs(Math.round(u)) % FLOWERS.length]!, 0.1, u + 3);
  }

  c.obstacles.push(rect);
  // the raised deck is not walkable (the ground is flat here, a person would sink into it)
  const da = f.pt(-dw, 0, D);
  const db = f.pt(dw, 0, D + DK + 6);
  c.obstacles.push({ minX: Math.min(da[0], db[0]), maxX: Math.max(da[0], db[0]), minZ: Math.min(da[2], db[2]), maxZ: Math.max(da[2], db[2]) });
}
