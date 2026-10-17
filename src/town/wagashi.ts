import { HeightPass, SHOP_HEIGHT_SCALE } from './height-pass';
import type { Ctx } from './ctx';
import type { Frame } from './frame';
import { Kit, slice } from './kit';
import { hex, shade, type Rect } from './util';
import { ellipsoid } from '../life/geom';

// ---------------------------------------------------------------------------------------------------------------------
// 和菓子屋: a traditional wooden shopfront (ref1)

const PLASTER = hex(0xf1e8d3);
const PLASTER_SIDE = hex(0xe6dac0);
const WOOD_DARK = hex(0x5a3826);
const WOOD_MID = hex(0x7a5236);
const WOOD_LIGHT = hex(0xc9955c);
const STONE = hex(0x908c84);
const TILE_ROOF = hex(0x3b4150);
const TILE_ROOF2 = hex(0x4a5161);
const NAVY = hex(0x1c2d5e);
const RED_CLOTH = hex(0xb8322a);
const PAPER = hex(0xf6ecd2);

export function addWagashi(c: Ctx, rect: Rect, f: Frame, W: number, D: number): void {
  const heightPass = new HeightPass(c);
  const k = new Kit(c, f);
  const P = 3.5; // plinth top (outside floor level)
  const FL = 4; // interior floor level
  const GF = 58; // underside of the upper floor
  const UF = 94; // eave line of the main roof
  const T = 6; // thickness of the front wall
  const doorC = -2;

  // ---- plinth and the shell of the ground floor -------------------------------------------------------------------
  k.box(-W - 0.8, W + 0.8, 0, P, -D - 0.8, D + 0.8, STONE);
  k.fa(-W, W, P, GF, -D, -1, PLASTER_SIDE);
  k.sd(-D, D, P, GF, -W, -1, PLASTER_SIDE);
  k.sd(-D, D, P, GF, W, 1, PLASTER_SIDE);
  k.fa(-W, W, P, P + 12, -D - 0.25, -1, WOOD_DARK);
  k.sd(-D, D, P, P + 12, -W - 0.25, -1, WOOD_DARK);
  k.sd(-D, D, P, P + 12, W + 0.25, 1, WOOD_DARK);
  k.box(-W, W, GF, UF, -D, D - 3, PLASTER); // upper floor

  // ---- front wall with the window bays and the door ---------------------------------------------------------------
  const bays: [number, number][] = [[-68, -17], [12, 68]];
  const yw0 = 10;
  const yw1 = 34;
  const openings: [number, number, number, number][] = bays.map((b): [number, number, number, number] => [b[0], b[1], yw0, yw1]);
  openings.push([doorC - 11, doorC + 11, FL, yw1]);
  k.wall(-W, W, P, GF, D - T, D, PLASTER, openings, { sill: WOOD_MID });
  const posts: [number, number][] = [[-W - 0.4, -W + 5], [W - 5, W + 0.4], [-17, -13], [doorC + 11, doorC + 15]];
  for (const [a, b] of posts) {
    k.box(a, b, P, 38.5, D - T, D + 1.4, WOOD_DARK);
    k.box(a - 0.6, b + 0.6, P, P + 1.6, D - T - 0.4, D + 1.9, STONE); // foot stone
  }
  k.box(-W - 0.4, W + 0.4, 34, 38.5, D - T, D + 1.4, WOOD_DARK); // lintel beam
  k.box(-W - 0.4, W + 0.4, 55.5, 58.2, D - T, D + 1, WOOD_MID); // beam under the eave
  for (const [a, b] of bays) {
    const n = Math.round((b - a) / 17);
    const pw = (b - a) / n;
    k.box(a, b, yw0 - 1.4, yw0, D - T - 0.2, D + 1.8, WOOD_LIGHT); // window sill
    k.box(a, b, 26, 27.6, D - 5, D - 0.4, WOOD_DARK); // transom
    for (let i = 1; i < n; i++) k.box(a + pw * i - 0.9, a + pw * i + 0.9, yw0, yw1, D - 5, D - 0.4, WOOD_DARK); // mullions
    k.pane(a, b, yw0, yw1, D - 2.8);
    // Keep the display bays clear; the three door curtains retain the shop identity.
    k.ibox(a + 1, b - 1, 33, 33.9, D - 6.4, D - 5.6, WOOD_DARK, 'TF');
  }
  // Narrow timber boards beneath the display bays stay clear of the glass and entrance.
  for (const [a, b] of bays) {
    for (let u = a; u < b - .1; u += 2.8) {
      const end = Math.min(b, u + 2.65);
      const wood = shade(WOOD_MID, .94 + .05 * Math.sin(u * 1.7));
      k.box(u, end, P + .4, yw0 - 1.5, D + .04, D + .45, wood);
    }
    k.box(a - .3, b + .3, P, P + .65, D, D + .8, WOOD_DARK);
  }
  // sliding glass door
  k.pane(doorC - 11, doorC + 11, FL, yw1, D - 2.8);
  k.box(doorC - 11, doorC + 11, FL, FL + 2.6, D - 4.4, D - 1.2, WOOD_MID);
  k.box(doorC - 11, doorC + 11, 31.2, 34, D - 4.4, D - 1.2, WOOD_DARK);
  k.box(doorC - 1, doorC + 1, FL, 31.5, D - 4.4, D - 1.2, WOOD_DARK);
  k.box(doorC - 11, doorC - 9.6, FL, 31.5, D - 4.4, D - 1.2, WOOD_DARK);
  k.box(doorC + 9.6, doorC + 11, FL, 31.5, D - 4.4, D - 1.2, WOOD_DARK);
  // entrance steps
  k.box(doorC - 15, doorC + 15, 0, 1.8, D, D + 8, hex(0xb9b5ab));
  k.box(doorC - 14, doorC + 14, 1.8, P, D, D + 4.2, hex(0xa9a59b));

  // ---- the signboard (看板), the 営業中 plaque and the noren ----------------------------------------------------------
  const sy0 = 39.6;
  const sy1 = 52.4;
  k.box(-62, 62, sy0, sy1, D + 0.6, D + 2.2, WOOD_DARK); // backing board
  k.ibox(-62, -25, sy0, sy1, D + 2.2, D + 2.6, NAVY, 'TFLR');
  k.ibox(25, 62, sy0, sy1, D + 2.2, D + 2.6, NAVY, 'TFLR');
  k.tf(k.uv('和菓子'), -25, 25, sy0, sy1, D + 2.6, 1);
  k.ifa(-62, 62, sy1 - 1.7, sy1 - 0.9, D + 2.65, 1, PAPER);
  k.ifa(-62, 62, sy0 + 0.9, sy0 + 1.7, D + 2.65, 1, PAPER);
  // the plaque hangs from the left door post, turned to face along the street
  const pq = -18;
  // A small plaque above head height, close to the post rather than across the pedestrian's face.
  k.box(pq - .22, pq + .22, 29, 29.5, D + 1.2, D + 7.2, WOOD_DARK);
  k.box(pq - .15, pq + .15, 27, 29, D + 2, D + 6.8, WOOD_DARK);
  k.ts(k.uv('営業中'), D + 2, D + 6.8, 27, 29, pq + .18, 1);
  k.ts(k.uv('営業中'), D + 2, D + 6.8, 27, 29, pq - .18, -1);
  // noren over the door
  const nuv = k.uv('noren:wagashi');
  for (let i = 0; i < 3; i++) {
    const u = doorC - 7.7 + i * 7.7;
    k.clothFront(slice(nuv, (2 - i) / 3, (3 - i) / 3), u - 3.6, u + 3.6, 17.5, 32.4, D + 1.2, 1);
  }
  k.box(doorC - 12.5, doorC + 12.5, 32.4, 33.2, D + 0.8, D + 1.7, WOOD_DARK);

  // ---- the tiled eave (庇) -----------------------------------------------------------------------------------------
  const eIn = D - 3;
  const eOut = D + 21;
  const yIn = 62;
  const yOut = 57;
  const eu = W + 5;
  k.quad([-eu, yIn, eIn], [eu, yIn, eIn], [eu, yOut, eOut], [-eu, yOut, eOut], hex(0x5a3a28), [0, -1, 0]); // underside
  for (let u = -eu + 4; u < eu - 2; u += 7) k.quad([u, yIn - 0.05, eIn], [u + 1.3, yIn - 0.05, eIn], [u + 1.3, yOut - 0.05, eOut], [u, yOut - 0.05, eOut], WOOD_DARK, [0, -1, 0]); // rafters
  const tIn = yIn + 3.2;
  const tOut = yOut + 3.2;
  for (let i = 0; i < 6; i++) {
    const a = i / 6;
    const b = (i + 1) / 6;
    k.quad(
      [-eu, tIn + (tOut - tIn) * a, eIn + (eOut - eIn) * a], [eu, tIn + (tOut - tIn) * a, eIn + (eOut - eIn) * a],
      [eu, tIn + (tOut - tIn) * b, eIn + (eOut - eIn) * b], [-eu, tIn + (tOut - tIn) * b, eIn + (eOut - eIn) * b],
      i % 2 ? TILE_ROOF2 : TILE_ROOF, [0, 1, 0.3],
    );
  }
  k.box(-eu, eu, yOut, yOut + 3.2, eOut - 0.8, eOut + 0.2, WOOD_DARK); // fascia board
  for (let u = -eu, i = 0; u < eu - 2.4; u += 2.6, i++) k.fa(u, u + 2.2, yOut + 3.2, yOut + 5.4, eOut + 0.25, 1, i % 2 ? hex(0x2f3441) : TILE_ROOF); // tile ends
  for (const s of [-1, 1] as const) k.quad([s * eu, yIn, eIn], [s * eu, yOut, eOut], [s * eu, yOut + 3.2, eOut], [s * eu, tIn, eIn], WOOD_DARK, [s, 0, 0]);
  for (const u of [-W + 6, -22, 24, W - 6]) k.box(u - 1, u + 1, yIn - 1.4, yIn, eIn, eIn + 9, WOOD_DARK); // brackets

  // ---- upper floor: lattice windows, then the tiled gable roof ----------------------------------------------------
  for (const u of [-48, 0, 48]) {
    const v = D - 3;
    k.box(u - 10, u + 10, 68, 70, v - 0.2, v + 2.4, WOOD_DARK);
    k.box(u - 10, u + 10, 86, 88, v - 0.2, v + 2.4, WOOD_DARK);
    k.box(u - 10, u - 8.2, 70, 86, v - 0.2, v + 2, WOOD_DARK);
    k.box(u + 8.2, u + 10, 70, 86, v - 0.2, v + 2, WOOD_DARK);
    k.fa(u - 8.2, u + 8.2, 70, 86, v + 0.2, 1, hex(0x5a6f88));
    for (let i = -3; i <= 3; i++) k.box(u + i * 2.6 - 0.45, u + i * 2.6 + 0.45, 70, 86, v + 0.3, v + 1.6, WOOD_DARK);
  }
  f.gable(k.m, -W, W, -D, D - 3, UF, 24, 'u', 9, TILE_ROOF, PLASTER);
  k.box(-W - 9.5, W + 9.5, UF + 23, UF + 27, -2.6, 2.6, hex(0x2c313d)); // ridge cap
  for (const s of [-1, 1] as const) k.box(s * (W + 8) - 3, s * (W + 8) + 3, UF + 21, UF + 31, -2.2, 2.2, hex(0x2c313d)); // ridge ends
  const slope = (t: number): [number, number] => [(D + 6) * (1 - t), UF - 3 + 27 * t]; // (v, y) on the front slope
  for (let i = 1; i < 8; i++) {
    const [va, ya] = slope(i / 8 - 0.012);
    const [vb, yb] = slope(i / 8 + 0.012);
    k.quad([-W - 9, ya + 0.12, va], [W + 9, ya + 0.12, va], [W + 9, yb + 0.12, vb], [-W - 9, yb + 0.12, vb], hex(0x2a2f3a), [0, D + 6, 27]);
  }

  // Eave gutter and downpipes stand against the plaster, clear of the signs.
  const zinc = hex(0x727b7d);
  k.box(-eu, eu, yOut - .5, yOut + .4, eOut - .6, eOut + .6, zinc);
  for (const side of [-1, 1]) {
    const u = side * (W - 1.4);
    k.cyl(u, D + 1.8, .8, yOut - 1.4, .42, .42, 6, zinc, false);
    k.box(u - .42, u + .42, yOut - 1.8, yOut - .95, D + 1.4, eOut + .4, zinc);
    for (const y of [12, 31, 49]) k.box(u - .8, u + .8, y, y + .45, D + 1, D + 2.5, shade(zinc, .8));
  }

  heightPass.applyAbove(FL, SHOP_HEIGHT_SCALE);

  // ---- the room behind the glass ----------------------------------------------------------------------------------
  const rb = -D + 22; // back wall of the sales room
  const rU = W - 2.5;
  const rf = D - T + 0.6;
  const cl = GF - 1.5; // ceiling
  k.th(k.uv('floor:wood'), -rU, rU, rb, rf, FL + 0.02, true, [1.05, 1, 0.92]);
  k.ihz(-rU, rU, rb, rf, cl, false, hex(0xf2e4c4));
  k.ifa(-rU, rU, FL, cl, rb, 1, hex(0xe9cf9c)); // back wall
  k.isd(rb, rf, FL, cl, -rU, 1, hex(0xedd9ad)); // left wall (the one seen from the street)
  k.isd(rb, rf, FL, cl, rU, -1, hex(0xedd9ad));
  k.tf(k.uv('in:wagashi'), -58, 58, 9, 50, rb + 0.1, 1, [1.05, 1.02, 0.95]);
  k.ifa(-10, 10, FL, 36, rb + 0.14, 1, hex(0x3a2418)); // doorway to the kitchen
  for (const u of [-5, 5]) k.ifa(u - 4.8, u + 4.8, 24, 36.5, rb + 0.2, 1, hex(0x1f3263));
  // the left wall is what the sight lines through the windows end on: shelves of boxes, and the menu board above
  k.ts(slice(k.uv('in:wagashi'), 0, 0.74), -40, 56, 8, 41, -rU + 0.15, 1, [1.05, 1.02, 0.95]);
  k.ts(k.uv('menu:wagashi'), -12, 32, 41.5, 52, -rU + 0.15, 1);
  for (let u = -66; u <= 66; u += 22) k.ibox(u - 1.7, u + 1.7, cl - 3.6, cl, rb, rf, hex(0x5a3a26), 'BFL'); // ceiling beams
  for (const u of [-40, 6, 52]) {
    k.ibox(u - 0.15, u + 0.15, cl - 8, cl, 8, 8.3, hex(0x3a2a20)); // paper lanterns
    k.iblob(u, cl - 11, 8, 3.4, 4.4, 3.4, [1.5, 1.34, 1.04], 0.02, u);
  }
  heightPass.applyAbove(FL, SHOP_HEIGHT_SCALE);

  // counter with the glass case
  k.ibox(-52, 30, FL, 14, -26, -14, hex(0x4a2f1e));
  k.tf(k.uv('case:wagashi'), -52, 30, 14.2, 23, -14.1, 1);
  k.ibox(-52, 30, 23, 24, -26, -14, hex(0x4a2f1e), 'T');
  // window display: red tiers behind the right bay, rising towards the back
  // All three display levels sit above the ten-unit window sill.
  const tiers = [{ v0: 50, y: 11.2 }, { v0: 44, y: 14.6 }, { v0: 38, y: 18 }];
  const pastel = [hex(0xf4a9c0), hex(0xf7f1e2), hex(0xa7cc82), hex(0xf1d172), hex(0xc4a8dc), hex(0xf4a9c0)];
  for (const [row, t] of tiers.entries()) {
    k.ibox(31, 64, FL, t.y, t.v0, t.v0 + 6, hex(0x9a2a24), 'TFLR');
    for (let i = 0; i < 6; i++) {
      const u = 35 + i * 5.2, v = t.v0 + 3, y = t.y + .25;
      k.ibox(u - 2.1, u + 2.1, t.y, y, v - 1.8, v + 1.8, hex(0xeee2c8));
      if (i % 3 === 0) {
        for (const side of [-1, 1]) k.iball(u + side * .9, y + .7, v, .8, .7, .8, pastel[(i + row) % pastel.length]!);
      } else if (i % 3 === 1) {
        k.ibox(u - .07, u + .07, y + .45, y + .58, v - 1.9, v + 1.9, hex(0xbc9764));
        for (let sweet = 0; sweet < 3; sweet++) k.iball(u, y + .65, v + (sweet - 1) * .95, .55, .55, .55, pastel[sweet]!);
      } else {
        k.ibox(u - 1.6, u + 1.6, y, y + 1.8, v - 1.4, v + 1.4, pastel[(i + row) % pastel.length]!);
        k.ibox(u - .18, u + .18, y + 1.8, y + 1.9, v - 1.4, v + 1.4, hex(0xfcf6e9), 'TFLR');
      }
    }
  }
  // shelving and a low case near the right window, their faces turned towards the street so they show through the glass
  k.ibox(24, 27.4, FL, 41, 30, 58, hex(0x5a3a26), 'TFKLR');
  k.ts(slice(k.uv('in:wagashi'), 0.08, 0.32), 31, 57, 8.5, 40, 27.5, 1);
  k.ibox(40, 43.4, FL, 15, 8, 34, hex(0x4a2f1e), 'TFKLR');
  k.ts(slice(k.uv('case:wagashi'), 0, 0.8), 9, 33, FL + 1.2, 14.2, 43.5, 1);
  k.ibox(40, 43.4, 15, 16, 8, 34, hex(0xf2e8d4), 'T');
  // tea corner just inside the door, in view through the window
  k.icyl(0, 26, FL + 8.4, FL + 9.4, 6, 6, 10, hex(0xd6b080));
  k.icyl(0, 26, FL, FL + 8.4, 0.7, 0.7, 5, hex(0x3a2a20), false);
  k.icyl(0, 26, FL, FL + 0.8, 3, 3, 8, hex(0x3a2a20));
  k.ibox(-1.8, 1.8, FL + 9.4, FL + 10.2, 24.4, 27.6, hex(0xf6f1e6)); // a plate of sweets
  k.iblob(0, FL + 11.2, 26, 1.1, 0.9, 1.1, hex(0xf08fb0), 0.04, 3);
  for (const [u, v] of [[-10, 26], [10, 26], [0, 37]] as const) {
    k.icyl(u, v, FL, FL + 5.2, 0.7, 0.7, 5, hex(0x3a2a20), false);
    k.icyl(u, v, FL + 5.2, FL + 6.4, 2.8, 2.8, 8, RED_CLOTH);
  }
  // low table with seats on the left
  k.ibox(-60, -34, FL, 9, 20, 30, hex(0x6a4630));
  for (const u of [-56, -38]) k.ibox(u - 3, u + 3, FL, 6.5, 33, 39, RED_CLOTH);

  // ---- in front of the shop: bench, cat, plant, lanterns, hanging signs -------------------------------------------
  const bu0 = -48;
  const bu1 = -20;
  const bv0 = D + 3.5;
  const bv1 = D + 12;
  for (const u of [bu0 + 2, bu1 - 2]) for (const v of [bv0 + 1.4, bv1 - 1.4]) k.box(u - 0.9, u + 0.9, 0, 5.2, v - 0.9, v + 0.9, WOOD_MID);
  k.box(bu0, bu1, 5.2, 6.7, bv0, bv1, WOOD_LIGHT);
  k.box(bu0 - 0.5, bu1 + 0.5, 6.7, 7.5, bv0 - 0.3, bv1 + 0.3, RED_CLOTH); // red felt cloth (毛氈)
  k.fa(bu0 - 0.5, bu1 + 0.5, 3.4, 7.5, bv1 + 0.32, 1, shade(RED_CLOTH, 0.85));
  k.sd(bv0 - 0.3, bv1 + 0.3, 3.4, 7.5, bu0 - 0.52, -1, shade(RED_CLOTH, 0.8));
  k.sd(bv0 - 0.3, bv1 + 0.3, 3.4, 7.5, bu1 + 0.52, 1, shade(RED_CLOTH, 0.9));
  k.box(-44, -35, 7.5, 8.1, bv0 + 2.5, bv1 - 2.5, hex(0x2b1d16)); // tea tray, cups, a plate of dango
  for (const u of [-42.6, -40.4, -38.2]) k.cyl(u, bv0 + 4.2, 8.1, 9.3, 0.9, 0.8, 6, hex(0xf4f1ea));
  k.box(-30, -24, 7.5, 8.0, bv0 + 2.2, bv0 + 6.6, hex(0xe9e1cf));
  for (let i = 0; i < 3; i++) k.blob(-28.7 + i * 1.6, 8.8, bv0 + 4.4, 0.8, 0.8, 0.8, [hex(0xf08fb0), hex(0xfff7ea), hex(0x9ec46c)][i]!, 0.02, i);
  // maneki-neko by the door (a small one on a wooden stand)
  const cu = doorC + 20;
  const cv = D + 3.4;
  const white: [number, number, number] = [0.97, 0.95, 0.9];
  k.box(cu - 2.4, cu + 2.4, 0, 3.4, cv - 2.2, cv + 2.2, STONE);
  const porcelain = (u: number, y: number, v: number, radius: number, tall: number): void => {
    const p = f.pt(u, y, v);
    ellipsoid(k.m, p[0], p[1], p[2], radius, tall, radius, white, { seg: 12, rings: 8, smooth: true });
  };
  porcelain(cu, 6.2, cv, 2.1, 2.6);
  porcelain(cu, 9.4, cv, 1.85, 1.7);
  k.cyl(cu - 1, cv, 10.4, 11.8, 0.8, 0, 4, white, false);
  k.cyl(cu + 1, cv, 10.4, 11.8, 0.8, 0, 4, white, false);
  porcelain(cu + 2, 8.7, cv + .6, .7, 1.9);
  // A slight turn towards the passing pedestrian makes the face legible from the shopfront.
  const face = (u: number, y: number, v: number): [number, number, number] => [cu + u * .866 + v * .5, y, cv - u * .5 + v * .866];
  const mark = (u: number, y: number, v: number, w: number, h: number, color: readonly [number, number, number]): void => {
    k.quad(face(u - w / 2, y - h / 2, v), face(u + w / 2, y - h / 2, v), face(u + w / 2, y + h / 2, v), face(u - w / 2, y + h / 2, v), color, [.5, 0, .866]);
  };
  for (const eye of [-.65, .65]) mark(eye, 9.55, 1.79, .4, .2, hex(0x453536));
  mark(0, 9.14, 1.91, .23, .18, hex(0xc95767));
  mark(0, 8.92, 1.84, .12, .25, hex(0x453536));
  for (const cheek of [-1.28, 1.28]) mark(cheek, 9.06, 1.44, .4, .22, hex(0xe7a2a1));
  k.box(cu - 1.8, cu + 1.8, 7.6, 8.2, cv + 1.4, cv + 1.8, RED_CLOTH);
  k.blob(cu, 7.5, cv + 1.9, 0.55, 0.55, 0.35, hex(0xe8c040), 0, 7);
  k.box(cu - 1, cu + 1, 4.6, 5.9, cv + 1.7, cv + 2.1, hex(0xe8c040));
  // potted shrub beside the window bay
  const pu = -58;
  const pv = D + 5;
  k.cyl(pu, pv, 0, 7.2, 3.6, 4.6, 8, hex(0x4a5d6e));
  k.cyl(pu, pv, 7.2, 8.2, 4.1, 4.1, 8, hex(0x34240f));
  k.topiary(pu, 12, pv, 5.2, 4.8, 5.2, hex(0x4f9a44));
  k.topiary(pu + 2.5, 16, pv - 1, 3.8, 3.6, 3.8, hex(0x63ad4e));
  k.topiary(pu - 2.5, 15, pv + 1, 3.4, 3.4, 3.4, hex(0x42893d));
  // red paper lanterns under the eave
  for (const u of [-W + 14, doorC - 18, doorC + 24]) {
    k.box(u - 0.2, u + 0.2, 53, 56.8, D + 8, D + 8.4, WOOD_DARK);
    k.cyl(u, D + 8.2, 47.4, 53, 3.4, 3.4, 8, [1.1, 0.34, 0.24], false);
    k.cyl(u, D + 8.2, 47, 47.5, 2.4, 2.4, 8, hex(0x201510));
    k.cyl(u, D + 8.2, 52.9, 53.4, 2.4, 2.4, 8, hex(0x201510));
  }
  // hanging blade signs (袖看板), turned to face along the street
  const blade = (u: number, key: string): void => {
    const v0 = D + 3;
    const v1 = D + 10;
    const y0 = 22;
    const y1 = 50;
    k.box(u - 1.2, u + 1.2, y0 - 0.8, y1 + 0.8, v0 - 0.5, v1 + 0.5, WOOD_DARK);
    k.ts(k.uv(key), v0, v1, y0, y1, u + 1.3, 1);
    k.ts(k.uv(key), v0, v1, y0, y1, u - 1.3, -1);
    k.box(u - 0.5, u + 0.5, y1 + 0.8, y1 + 2.2, D + 0.6, v1 + 0.5, WOOD_DARK); // bracket arm
  };
  blade(-38, 'v:たい焼き');
  blade(-W + 4.6, 'v:甘味処');

  c.obstacles.push(rect);
}

