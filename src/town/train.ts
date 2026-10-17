import { beam, type MeshBatch } from './batch';
import { hex, type RGB } from './util';
import { faceWithHoles, type Hole } from './wallface';
import { person, SKIN } from './stationfolk';
import { SURF } from '../surface';

/** A four-car electric multiple unit standing at the platform on the track (white / silver with a cherry pink stripe). */
export const TRAIN = { z: 804, x0: -340, cars: 4, length: 244, gap: 4 } as const;

const BODY = hex(0xeceff3);
const PINK = hex(0xf47fa6);
const NAVY = hex(0x2f4a86);
const SKIRT = hex(0x5d6573);
const WINDOW = hex(0x2d4468);
const DOOR = hex(0xdde3ea);
const DOOR_LINE = hex(0x7a808a);
const ROOF = hex(0xc9ced6);
const AC = hex(0xe3e7ec);
const AC_TOP = hex(0xbfc5ce);
const BOGIE = hex(0x2c2f36);
const GANGWAY = hex(0x3a3f48);
const PANTO = hex(0x4a4f58);
const LAMP = hex(0xfff3c0);
const SIGN = hex(0x15181d);

const HALF = 17.5;
const Y0 = 3.6;
const Y_WALL = 43;
const Y_ROOF = 46.4;
const BANDS: [number, number, RGB][] = [
  [Y0, 8, SKIRT],
  [8, 10.5, BODY],
  [10.5, 14, PINK],
  [14, 15.2, NAVY],
  [15.2, Y_WALL, BODY],
];

/** Door centres (relative to the car's west end) and the windows between them. */
const DOORS = [30.5, 91.5, 152.5, 213.5];
const WINDOWS: [number, number][] = [
  [2, 22],
  [39, 60], [63, 84],
  [100, 121], [124, 145],
  [161, 182], [185, 206],
  [223, 242],
];

function quadX(b: MeshBatch, plane: number, x0: number, x1: number, y0: number, y1: number, col: RGB, facing: 1 | -1): void {
  b.quad([x0, y0, plane], [x1, y0, plane], [x1, y1, plane], [x0, y1, plane], col, [0, 0, facing]);
}

/** One side wall (z = const) with its doors and windows. */
function side(b: MeshBatch, x0: number, plane: number, facing: 1 | -1, glass?: MeshBatch): void {
  const L = TRAIN.length;
  const holes: Hole[] = [
    ...DOORS.map((d) => ({ a0: x0 + d - 7, a1: x0 + d + 7, y0: 6.2, y1: 36 })),
    ...WINDOWS.map(([a, c]) => ({ a0: x0 + a, a1: x0 + c, y0: 19, y1: 32 })),
  ];
  const previous = b.surface; b.surface = SURF.paintedMetal;
  for (const [ya, yb, col] of BANDS) faceWithHoles(b, 'x', plane, x0, x0 + L, ya, yb, holes, col, facing);
  b.surface = previous;
  const window = (a: number, c: number, low: number, high: number): void => {
    if (!glass) { quadX(b, plane, a, c, low, high, WINDOW, facing); return; }
    const frame = hex(0x9aa3ae), edge = plane + facing * .08;
    quadX(b, edge, a - .3, a, low - .3, high + .3, frame, facing);
    quadX(b, edge, c, c + .3, low - .3, high + .3, frame, facing);
    quadX(b, edge, a, c, low - .3, low, frame, facing);
    quadX(b, edge, a, c, high, high + .3, frame, facing);
    const first = glass.vertexCount;
    glass.quad([a, low, plane], [c, low, plane], [c, high, plane], [a, high, plane], [.8, .91, 1], [0, 0, facing], [[a / 140, low / 140], [c / 140, low / 140], [c / 140, high / 140], [a / 140, high / 140]]);
    for (let i = first; i < glass.vertexCount; i++) glass.col[i * 4 + 3] = .38 + .3 * (glass.pos[i * 3 + 1]! - low) / (high - low);
  };
  for (const [a, c] of WINDOWS) window(x0 + a, x0 + c, 19, 32);
  for (const d of DOORS) {
    const cx = x0 + d;
    for (const [l, r] of [[cx - 7, cx - 0.4], [cx + 0.4, cx + 7]] as [number, number][]) {
      quadX(b, plane, l, r, 6.2, 19, DOOR, facing);
      quadX(b, plane, l, r, 31.5, 36, DOOR, facing);
      quadX(b, plane, l, l + 1.2, 19, 31.5, DOOR, facing);
      quadX(b, plane, r - 1.2, r, 19, 31.5, DOOR, facing);
      window(l + 1.2, r - 1.2, 19, 31.5);
    }
    quadX(b, plane, cx - 0.4, cx + 0.4, 6.2, 36, DOOR_LINE, facing);
  }
}

/** The cab end: windscreen, head lamps and a destination sign. */
function cabFace(b: MeshBatch, plane: number, facing: 1 | -1, zc: number): void {
  const holes: Hole[] = [
    { a0: zc - 13.5, a1: zc + 13.5, y0: 20, y1: 36 },
    { a0: zc - 15, a1: zc - 11, y0: 9.5, y1: 12.5 },
    { a0: zc + 11, a1: zc + 15, y0: 9.5, y1: 12.5 },
    { a0: zc - 7, a1: zc + 7, y0: 38, y1: 41.5 },
  ];
  const previous = b.surface; b.surface = SURF.paintedMetal;
  for (const [ya, yb, col] of BANDS) faceWithHoles(b, 'z', plane, zc - HALF, zc + HALF, ya, yb, holes, col, facing);
  b.surface = previous;
  const q = (a0: number, a1: number, y0: number, y1: number, col: RGB): void =>
    b.quad([plane, y0, a0], [plane, y0, a1], [plane, y1, a1], [plane, y1, a0], col, [facing, 0, 0]);
  q(zc - 13.5, zc + 13.5, 20, 36, WINDOW);
  q(zc - 15, zc - 11, 9.5, 12.5, LAMP);
  q(zc + 11, zc + 15, 9.5, 12.5, LAMP);
  q(zc - 7, zc + 7, 38, 41.5, SIGN);
  b.box(Math.min(plane, plane + facing * 1.6), Math.max(plane, plane + facing * 1.6), 4.2, 7.4, zc - 6, zc + 6, BOGIE);
}

function plainEnd(b: MeshBatch, plane: number, facing: 1 | -1, zc: number): void {
  b.quad([plane, Y0, zc - HALF], [plane, Y0, zc + HALF], [plane, Y_WALL, zc + HALF], [plane, Y_WALL, zc - HALF], BODY, [facing, 0, 0]);
}

function roof(b: MeshBatch, x0: number, x1: number, zc: number): void {
  const w = 11;
  b.quad([x0, Y_WALL, zc - HALF], [x1, Y_WALL, zc - HALF], [x1, Y_ROOF, zc - w], [x0, Y_ROOF, zc - w], ROOF, [0, 1, -0.6]);
  b.quad([x0, Y_WALL, zc + HALF], [x1, Y_WALL, zc + HALF], [x1, Y_ROOF, zc + w], [x0, Y_ROOF, zc + w], ROOF, [0, 1, 0.6]);
  b.quad([x0, Y_ROOF, zc - w], [x1, Y_ROOF, zc - w], [x1, Y_ROOF, zc + w], [x0, Y_ROOF, zc + w], ROOF, [0, 1, 0]);
  for (const [x, dir] of [[x0, -1], [x1, 1]] as [number, 1 | -1][]) {
    b.quad([x, Y_WALL, zc - HALF], [x, Y_WALL, zc + HALF], [x, Y_ROOF, zc + w], [x, Y_ROOF, zc - w], BODY, [dir, 0, 0]);
  }
}

/** A single-arm pantograph reaching the overhead wire (y = 86). */
function pantograph(b: MeshBatch, x: number, zc: number): void {
  b.box(x - 7, x + 7, Y_ROOF, Y_ROOF + 1.2, zc - 5, zc + 5, PANTO);
  for (const dz of [-3.5, 3.5]) b.box(x - 1.2, x + 1.2, Y_ROOF + 1.2, Y_ROOF + 3.4, zc + dz - 0.8, zc + dz + 0.8, hex(0xb5b9c2));
  beam(b, [x - 4, Y_ROOF + 3.4, zc], [x + 9, 66, zc], 1.4, 1.4, PANTO);
  beam(b, [x + 9, 66, zc], [x - 2, 85, zc], 1.2, 1.2, PANTO);
  beam(b, [x - 2, 85.4, zc - 7.5], [x - 2, 85.4, zc + 7.5], 2.4, 0.8, PANTO);
}

function car(b: MeshBatch, x0: number, headW: boolean, headE: boolean, panto: boolean, glass?: MeshBatch): void {
  const zc = TRAIN.z;
  const x1 = x0 + TRAIN.length;
  side(b, x0, zc - HALF, -1, glass);
  side(b, x0, zc + HALF, 1, glass);
  roof(b, x0, x1, zc);
  b.quad([x0, Y0, zc - HALF], [x1, Y0, zc - HALF], [x1, Y0, zc + HALF], [x0, Y0, zc + HALF], SKIRT, [0, -1, 0]);
  if (headW) cabFace(b, x0, -1, zc);
  else {
    plainEnd(b, x0, -1, zc);
    b.box(x0 - TRAIN.gap, x0, Y0 + 2, 41, zc - 14, zc + 14, GANGWAY);
  }
  if (headE) cabFace(b, x1, 1, zc);
  else plainEnd(b, x1, 1, zc);
  // bogies and roof equipment
  for (const bx of [x0 + 34, x1 - 34]) b.box(bx - 15, bx + 15, 0.7, 4.2, zc - 9, zc + 9, BOGIE);
  for (const ax of [x0 + 52, x0 + 122, x0 + 192]) {
    b.box(ax - 14, ax + 14, Y_ROOF, Y_ROOF + 3, zc - 7, zc + 7, AC, { top: AC_TOP });
  }
  if (panto) pantograph(b, x0 + 150, zc);
  if (glass) {
    b.box(x0 + 1, x1 - 1, 6, 7, zc - HALF + 1, zc + HALF - 1, hex(0xa5a099));
    for (const [a, c] of WINDOWS) for (const sign of [-1, 1]) {
      const lo = Math.min(zc + sign * (HALF - 6), zc + sign * (HALF - 1.1));
      const hi = Math.max(zc + sign * (HALF - 6), zc + sign * (HALF - 1.1));
      b.box(x0 + a + .6, x0 + c - .6, 13.3, 14.3, lo, hi, hex(0x65858d));
      const back = zc + sign * (HALF - 1.5);
      b.box(x0 + a + .6, x0 + c - .6, 14.3, 22, back - .45, back + .45, hex(0x728f98));
    }
    for (const [i, x] of [49, 110, 171, 231].entries()) {
      person(b, x0 + x, 7, zc + 12, Math.PI, {
        jacket: [hex(0xa4b8c3), hex(0xbda59c), hex(0x586f88), hex(0xc8b991)][i]!,
        trousers: hex(0x505565), skin: SKIN, hair: hex(i % 2 ? 0x4d3d32 : 0x32313b), seated: true, skirt: i % 2 === 1,
      });
    }
    for (const x of [30, 91, 152, 213]) {
      b.box(x0 + x - .18, x0 + x + .18, 7, 39, zc - 9, zc - 8.6, hex(0xc3c7ca));
      b.box(x0 + x - .18, x0 + x + .18, 7, 39, zc + 8.6, zc + 9, hex(0xc3c7ca));
    }
    b.box(x0 + 8, x1 - 8, 38.8, 39.2, zc - 2, zc + 2, hex(0xf3efe2));
  }
}

export function buildTrain(b: MeshBatch, glass?: MeshBatch): void {
  for (let i = 0; i < TRAIN.cars; i++) {
    car(b, TRAIN.x0 + i * (TRAIN.length + TRAIN.gap), i === 0, i === TRAIN.cars - 1, i === 1 || i === 2, glass);
  }
}
