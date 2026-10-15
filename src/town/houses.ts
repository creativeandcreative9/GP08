import type { Ctx } from './ctx';
import { Frame } from './frame';
import { addCherry, addRoundTree } from './trees';
import { GLASS, GREEN_LEAF, SASH, windowGrid, windowOn, signOnFace, parapet, rooftopStuff } from './parts';
import { hex, pick, shade, type RGB, type Rect } from './util';

const WALLS: RGB[] = [0xf7eddc, 0xf4dcd2, 0xdbe8f1, 0xe0ecd5, 0xf8f0c8, 0xe8e6e0, 0xf6dbbb, 0xeadff2].map(hex);
const ROOFS: RGB[] = [0x5f7092, 0xc9674a, 0x4f7059, 0x76503f, 0x555963, 0x3f8a92, 0xa04a4a].map(hex);
const WALL_GREY = hex(0xd9d6cd);

/** A detached two-storey house on a footprint rectangle, with a block wall, door, windows and garden. */
export function addHouse(c: Ctx, rect: Rect, f: Frame, hu: number, hv: number, floors: number): void {
  const b = c.main.at(f.cx, f.cz);
  const r = c.rnd;
  const wall = pick(WALLS, r);
  const roof = pick(ROOFS, r);
  const floorH = 35;
  const eave = 3.5 + floors * floorH;
  f.box(b, -hu - 0.6, hu + 0.6, 0, 3.5, -hv - 0.6, hv + 0.6, hex(0xa9a69e));
  f.box(b, -hu, hu, 3.5, eave, -hv, hv, wall);
  const ridge = (hu >= hv) !== (r() < 0.25) ? 'u' : 'v';
  const span = ridge === 'u' ? hv : hu;
  f.gable(b, -hu, hu, -hv, hv, eave, Math.max(14, Math.min(34, span * 0.62)), ridge, 7, roof, shade(wall, 0.97));
  // chimney
  const cu = (r() - 0.5) * hu * 0.8;
  f.box(b, cu - 4, cu + 4, eave, eave + 30, -hv * 0.3 - 4, -hv * 0.3 + 4, hex(0xb86b52));

  // windows on every face; the door and a balcony on the front
  windowGrid(b, f, hu, hv, 3.5, floorH, floors, {
    w: 15, h: 19, spacing: 38,
    skipFront: (fl) => fl === 0,
  });
  const doorU = (r() < 0.5 ? -1 : 1) * hu * 0.45;
  const doorCol = pick([hex(0x8a5a3a), hex(0x3f5f8a), hex(0x2f6f55), hex(0x9a3f3f)], r);
  f.facade(b, doorU - 7, doorU + 7, 3.5, 29, hv + 0.6, 1, doorCol);
  f.facade(b, doorU - 5, doorU + 5, 18, 26, hv + 0.9, 1, hex(0xcfe6f4));
  f.box(b, doorU - 12, doorU + 12, 31, 33, hv, hv + 12, hex(0x6b6b72)); // porch roof
  f.box(b, doorU - 11, doorU - 9, 3.5, 31, hv + 9, hv + 11, SASH);
  f.box(b, doorU + 9, doorU + 11, 3.5, 31, hv + 9, hv + 11, SASH);
  const winU = -doorU;
  windowOn(b, f, hu, hv, 'f', winU, 11, 20, 18, GLASS);
  if (floors >= 2 && r() < 0.7) {
    f.box(b, winU - 15, winU + 15, 3.5 + floorH - 2, 3.5 + floorH, hv, hv + 8, hex(0xe9e6de)); // balcony slab
    f.box(b, winU - 15, winU + 15, 3.5 + floorH, 3.5 + floorH + 7, hv + 7.2, hv + 8, hex(0xc9d3dd));
  }

  // block wall around the plot with a gate gap in front
  const m = 6;
  const wh = 13;
  const wallCol = WALL_GREY;
  const gap = 15;
  f.box(b, -hu - m, doorU - gap, 0, wh, hv + 9, hv + 12, wallCol);
  f.box(b, doorU + gap, hu + m, 0, wh, hv + 9, hv + 12, wallCol);
  f.box(b, -hu - m, hu + m, 0, wh, -hv - m - 3, -hv - m, wallCol);
  f.box(b, -hu - m - 3, -hu - m, 0, wh, -hv - m, hv + 12, wallCol);
  f.box(b, hu + m, hu + m + 3, 0, wh, -hv - m, hv + 12, wallCol);
  // coping
  f.box(b, -hu - m - 3.5, hu + m + 3.5, wh, wh + 1.2, -hv - m - 3.5, -hv - m + 0.5, hex(0x9f9c94));

  // garden: a bush at the front corner and sometimes a tree
  const bu = -doorU;
  const bp = f.pt(bu, 0, hv + 5);
  b.blob(bp[0], 5, bp[2], 9, 6, 7, GREEN_LEAF, 0.12, bp[0]);
  const t = r();
  const tp = f.pt((r() < 0.5 ? -1 : 1) * (hu - 6), 0, -hv + 8);
  if (t < 0.3) addCherry(c, tp[0], tp[2], 0.75 + r() * 0.2);
  else if (t < 0.55) addRoundTree(c, tp[0], tp[2], 0.6 + r() * 0.2);
  c.obstacles.push(rect);
}

/** Multi-storey apartment block (アパート / マンション / タワーマンション). */
export function addApartment(c: Ctx, rect: Rect, f: Frame, hu: number, hv: number, floors: number, label: string): void {
  const b = c.main.at(f.cx, f.cz);
  const r = c.rnd;
  const tower = floors >= 12;
  const floorH = tower ? 35 : 36;
  const wall = tower ? hex(0xe4e8ee) : pick([hex(0xf2e9d8), hex(0xe9e1d0), hex(0xdde6ea), hex(0xf0dcd0)], r);
  const band = tower ? hex(0x7f95b5) : pick([hex(0xc9b9a0), hex(0xa7b8c5), hex(0xd2a89a)], r);
  const H = 4 + floors * floorH;
  f.box(b, -hu, hu, 0, 4, -hv, hv, hex(0x9c9a94));
  f.box(b, -hu, hu, 4, H, -hv, hv, wall);
  // balcony strip per floor (front and back): slab + railing + sliding window
  const balcony = hex(0xf4f4f0);
  for (let fl = 1; fl < floors; fl++) {
    const y = 4 + fl * floorH;
    f.box(b, -hu + 3, hu - 3, y - 2, y, hv, hv + 6, balcony);
    f.box(b, -hu + 3, hu - 3, y, y + 8, hv + 5.4, hv + 6, tower ? hex(0xaec6e0) : hex(0xd6dbe0));
    if (!tower) {
      f.box(b, -hu + 3, hu - 3, y - 2, y, -hv - 6, -hv, balcony);
      f.box(b, -hu + 3, hu - 3, y, y + 8, -hv - 6, -hv - 5.4, hex(0xd6dbe0));
    }
  }
  // belt between floors
  for (let fl = 1; fl < floors; fl += tower ? 1 : 1) {
    const y = 4 + fl * floorH;
    f.box(b, -hu - 0.5, hu + 0.5, y - 2.5, y - 0.5, -hv - 0.5, hv + 0.5, band);
  }
  windowGrid(b, f, hu, hv, 4, floorH, floors, {
    w: tower ? 22 : 24, h: 22, spacing: tower ? 36 : 44, skipFront: (fl) => fl === 0 && false,
    glass: tower ? hex(0x7fb0dc) : GLASS,
  });
  // entrance at the front, ground floor
  const ed = hex(0x4a5a6a);
  f.facade(b, -10, 10, 4, 26, hv + 0.7, 1, ed);
  f.facade(b, -8, 8, 6, 24, hv + 1.0, 1, hex(0xbfe0f0));
  f.box(b, -22, 22, 28, 31, hv, hv + 14, hex(0x6b7280));
  // nameplate
  const sw = Math.min(70, hu * 1.6);
  signOnFace(c, f, label, 0, 32, sw, sw / 4, hv + 0.8, 1);
  // roof
  const top = H;
  parapet(b, f, hu, hv, top, 5, shade(wall, 0.92));
  f.box(b, -hu * 0.35, hu * 0.35, top, top + 24, -hv * 0.3, hv * 0.3, shade(wall, 0.88));
  rooftopStuff(c, f, hu, hv, top, tower ? 5 : 3);
  if (tower) {
    // crown + antenna
    f.box(b, -hu * 0.6, hu * 0.6, top + 24, top + 44, -hv * 0.6, hv * 0.6, shade(wall, 0.85));
    const p = f.pt(0, 0, 0);
    b.cylinder(p[0], p[2], top + 44, top + 110, 1.8, 0.6, 6, hex(0xd8d8de));
    b.blob(p[0], top + 111, p[2], 3, 3, 3, hex(0xe03030), 0);
  }
  c.obstacles.push(rect);
}
