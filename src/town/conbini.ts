import { HeightPass, SHOP_HEIGHT_SCALE } from './height-pass';
import { SURF } from '../surface';
import type { Ctx } from './ctx';
import type { Frame } from './frame';
import { Kit, nobori, slice } from './kit';
import { parapet, rooftopStuff } from './parts';
import { hex, type Rect } from './util';

// ---------------------------------------------------------------------------------------------------------------------
// コンビニ「ひだまりマート」: a glass frontage with the bright shop behind it (ref2)

export function addConbini(c: Ctx, rect: Rect, f: Frame, W: number, D: number): void {
  const heightPass = new HeightPass(c);
  const k = new Kit(c, f);
  const P = 3.5;
  const FL = 4; // interior floor
  const CE = 41; // ceiling
  const FT = 52.4; // top of a compact fascia band
  const WHITE = hex(0xe8edf0);
  const SIDE = hex(0xd9dfe3);
  const ALU = hex(0xaeb7b8);
  const GREEN = hex(0x14934a);
  const LOWER_GREEN = hex(0x237a65);
  const doorU0 = -2;
  const doorU1 = 28;

  // ---- shell ------------------------------------------------------------------------------------------------------
  k.box(-W - 1, W + 1, 0, P, -D - 1, D + 1, hex(0xb4b1a8));
  k.fa(-W, W, P, CE + 3, -D, -1, SIDE);
  k.sd(-D, D, P, CE + 3, -W, -1, SIDE);
  k.sd(-D, D, P, CE + 3, W, 1, SIDE);
  k.fa(-W, W, P, P + 10, -D - 0.25, -1, hex(0x8f959b));
  k.box(-W, W, CE, CE + 3, -D, D - 2, WHITE); // roof slab
  parapet(k.m, f, W, D, CE + 3, 5, SIDE);
  rooftopStuff(c, f, W, D, CE + 3, 3);

  // ---- glass frontage ---------------------------------------------------------------------------------------------
  const pier = 5;
  k.box(-W, -W + pier, P, CE, D - 4, D, WHITE);
  k.box(W - pier, W, P, CE, D - 4, D, WHITE);
  const jambs = [-58, -36, -14, doorU0, doorU1, 54];
  const frameSurface = k.m.surface; k.m.surface = SURF.paintedMetal;
  for (const u of jambs) k.box(u - 0.45, u + 0.45, P, 38.4, D - 3.2, D - 0.2, ALU);
  k.box(-W + pier, W - pier, P, P + 1.4, D - 3.2, D - 0.2, ALU);
  k.box(-W + pier, W - pier, 36.8, 38.4, D - 3.2, D - 0.2, ALU);
  const edges = [-W + pier, ...jambs, W - pier];
  for (let i = 0; i + 1 < edges.length; i++) k.pane(edges[i]!, edges[i + 1]!, FL, 38.4, D - 1.8);
  // sliding doors
  k.box(doorU0, doorU1, FL, FL + 2, D - 3.4, D - 0.4, ALU);
  k.box((doorU0 + doorU1) / 2 - 0.7, (doorU0 + doorU1) / 2 + 0.7, FL, 36.8, D - 3.4, D - 0.4, ALU);
  k.box(doorU0 - 1, doorU1 + 1, 33.8, 38.4, D - 4.4, D + 1.2, hex(0x3d434b)); // door operator
  k.box(8, 12, 32.6, 33.8, D - 0.6, D + 1.4, hex(0x23282e)); // sensor
  k.m.surface = frameSurface;
  // mat at the entrance and a short ramp-like step
  k.box(doorU0 - 1, doorU1 + 1, P, P + 0.5, D + 1.2, D + 9, hex(0x2b3946));
  k.box(doorU0 - 2, doorU1 + 2, 0, P, D, D + 11, hex(0xc4c1b8));

  // ---- fascia band with the logo (backlit white, like the signs of a real store) ----------------------------------
  const L = (a: number, b: number, y0: number, y1: number, col: readonly [number, number, number], vv = D + 3.5): void => k.ifa(a, b, y0, y1, vv, 1, col);
  k.box(-W - 1, W + 1, 38.4, FT, D - 3, D + 3, hex(0x6b7178)); // body of the band
  k.ibox(-W - 1, W + 1, 38.4, FT, D + 3, D + 3.4, [0.97, 0.98, 0.99], 'TFLR');
  L(-W - 1, W + 1, FT - 2.2, FT - .2, GREEN);
  L(-W - 1, W + 1, 38.8, 40.8, LOWER_GREEN);
  L(-W - 1, W + 1, 40.8, 41.3, GREEN);
  k.tf(k.uv('ひだまりマート'), -44, -12, 41.7, 49.7, D + 3.45, 1);
  k.tf(k.uv('ひだまりマート'), 38, 70, 41.7, 49.7, D + 3.45, 1);
  // hanging logo signs, turned to face along the street
  const blade = (u: number): void => {
    const v0 = D + 3.6;
    const v1 = D + 10.4;
    const y0 = 27;
    const y1 = 55;
    k.box(u - 1.2, u + 1.2, y0 - 0.8, y1 + 0.8, v0 - 0.4, v1 + 0.5, hex(0x3d434b));
    k.ts(k.uv('v:ひだまりマート'), v0, v1, y0, y1, u + 1.3, 1);
    k.ts(k.uv('v:ひだまりマート'), v0, v1, y0, y1, u - 1.3, -1);
  };
  blade(10);
  blade(-W + 1.5);

  // ---- posters on the glass ---------------------------------------------------------------------------------------
  const posters: [string, number, number][] = [
    ['p:sale', -52, 13], ['p:onigiri', -30, 15], ['p:new', -8.5, 14], ['p:oden', 62, 14],
    ['p:coffee', -44, 23], ['p:atm', -21, 22],
  ];
  for (const [key, u, y] of posters) k.tf(k.uv(key), u - 3.8, u + 3.8, y, y + 10.2, D - 1.65, 1);

  // ---- the shop behind the glass ----------------------------------------------------------------------------------
  const rU = W - 3;
  const rb = -D + 3;
  const rf = D - 3.6;
  k.thTiled(k.uv('floor:tile'), -rU, rU, rb, rf, FL + 0.02, true, 8, 4, [0.98, 0.99, 1]);
  k.ihz(-rU, rU, rb, rf, CE, false, [0.95, 0.97, 0.98]);
  for (const v of [-42, -8, 28]) for (let i = 0; i < 7; i++) k.ihz(-rU + 16 + i * 25, -rU + 16 + i * 25 + 14, v - 2.6, v + 2.6, CE - 0.1, false, [1.75, 1.75, 1.66]);
  k.ifa(-rU, rU, FL, CE, rb, 1, [0.92, 0.95, 0.97]);
  k.isd(rb, rf, FL, CE, rU, -1, [0.9, 0.93, 0.95]);
  // far (north) wall: shelves and a cooler, seen along the street through the glass
  const cu = k.uv('cooler');
  const wallL = -rU;
  k.ts(slice(k.uv('in:goods'), 0, 1), rb + 6, rf - 40, FL + 1, 33, wallL + 0.15, 1);
  k.ts(slice(cu, 0.05, 0.5), rf - 40, rf - 6, FL + 1, 36, wallL + 0.15, 1);
  k.isd(rb, rf, FL, CE, wallL + 0.05, 1, [0.92, 0.95, 0.97]);
  // back wall coolers
  k.tf(slice(cu, 0, 0.44), -rU + 4, -rU + 58, FL + 1, 36, rb + 0.15, 1);
  k.tf(slice(cu, 0.3, 0.74), -rU + 58, -rU + 112, FL + 1, 36, rb + 0.15, 1);
  k.tf(slice(cu, 0.56, 1), -rU + 112, rU - 4, FL + 1, 36, rb + 0.15, 1);
  // gondola shelves, their long faces looking along the street
  const faces = ['in:snacks', 'in:goods', 'in:bread', 'in:snacks'];
  [-64, -44, -24, 40].forEach((u, i) => {
    const v0 = i === 3 ? -20 : rb + 14;
    const v1 = i === 3 ? 10 : rf - 32;
    k.ibox(u - 3, u + 3, FL, 19.5, v0, v1, [0.9, 0.92, 0.94], 'TFKLR');
    k.ts(k.uv(faces[i]!), v0 + 1, v1 - 1, FL + 1.2, 19, u + 3.08, 1);
    k.ts(k.uv(faces[(i + 1) % 4]!), v0 + 1, v1 - 1, FL + 1.2, 19, u - 3.08, -1);
    // Slim projecting shelf edges cast readable layers at oblique street angles.
    for (const y of [FL + .5, 10, 15, 19.5]) {
      k.ibox(u - 3.55, u + 3.55, y - .4, y, v0, v1, hex(0xd0d4cb), 'TFLR');
    }
    // A grouped end display has individual silhouettes, rather than one bright solid block.
    const packageColors = [hex(0xd3b27b), hex(0x97af9b), hex(0xce8f82)];
    for (let j = 0; j < 3; j++) {
      const a = u - 2.55 + j * 1.8, top = 21.5 + (j + i) % 3 * .55;
      k.ibox(a, a + 1.5, 19.5, top, v0 + .4, v0 + 4.5, packageColors[(i + j) % 3]!, 'TFKLR');
      k.ibox(a + .25, a + 1.25, top - 1.2, top - .5, v0 + 4.52, v0 + 4.56, hex(0xf7f1e0), 'F');
    }
  });
  // hanging sale boards over the aisles (both sides printed)
  for (const [u, v, key] of [[-60, 8, 'p:sale'], [-40, -22, 'p:new'], [-20, 24, 'p:oden']] as const) {
    k.ibox(u - 0.5, u + 0.5, 38.8, CE, v + 3.2, v + 4, hex(0x8a8f96), 'TFKLR');
    k.ts(k.uv(key), v, v + 7.2, 28.4, 38.6, u + 0.6, 1);
    k.ts(k.uv(key), v, v + 7.2, 28.4, 38.6, u - 0.6, -1);
  }
  // magazine rack along the window, cover side towards the street
  k.ibox(-76, -6, FL, 16, D - 14, D - 9, [0.82, 0.85, 0.88], 'TFKLR');
  k.tf(k.uv('rack:mag'), -76, -6, FL + 3.5, 15.6, D - 8.9, 1);
  // cashier counter near the door
  k.ibox(34, 64, FL, 13, 4, 20, [0.95, 0.96, 0.97]);
  k.ibox(44, 52, 13, 17, 8, 16, [0.2, 0.22, 0.26]);
  k.ibox(34, 64, 13, 14, 4, 20, [0.4, 0.78, 0.5], 'T');

  heightPass.applyAbove(FL, SHOP_HEIGHT_SCALE);

  // a planter beside the entrance
  const pu = doorU0 - 5;
  k.cyl(pu, D + 4.5, 0, 6, 2.8, 3.4, 8, hex(0xb9b5ab));
  k.blob(pu, 9.5, D + 4.5, 3.6, 3.4, 3.6, hex(0x5ea94d), 0.12, pu);
  k.blob(pu + 1.2, 12.2, D + 4.5, 2, 1.7, 2, hex(0xf29bb8), 0.1, pu + 5);

  // ---- in the yard: banners ----------------------------------------------------------------------------------------
  nobori(k, -34, D + 7, 'n:セール', 30);
  nobori(k, -70, D + 7, 'n:新発売', 30);

  c.obstacles.push(rect);
}
