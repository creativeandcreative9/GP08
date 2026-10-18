import { beam, type MeshBatch } from './batch';
import type { Ctx } from './ctx';
import { PLATFORM } from './platform';
import { BACK_OPENINGS, BLD, F, FRONT_OPENINGS, HALL, type Opening } from './stationplan';
import { furnishConcourse, platformPassengers } from './stationprops';
import { pane, signZ, stationKit, type StationKit } from './stationkit';
import { faceWithHoles, reveal, type Hole, type UvFn } from './wallface';
import { hex, type RGB, type V3 } from './util';
import { SURF } from '../surface';

export { finishStation } from './stationkit';

const WALL: RGB = hex(0xf3ecde);
const PLINTH: RGB = hex(0xb9b4a8);
const ROOF_METAL: RGB = hex(0x64777a);
const ROOF_UNDER: RGB = hex(0xd7dbd6);
const ALU: RGB = hex(0xc8ccd2);
const TRIM: RGB = hex(0xe9e9e6);
const UP: V3 = [0, 1, 0];
const ROOF_SEAM: RGB = hex(0x52666a);

/** Quiet sheet metal with narrow folded seams; the original slopes and roof envelope stay intact. */
function roofStrips(b: MeshBatch, x0: number, x1: number, yEave: number, zEave: number, yRidge: number, zRidge: number, hint: V3): void {
  const surface = b.surface, axis = b.axis;
  b.surface = SURF.paintedMetal; b.axis = 0;
  const n = Math.round((x1 - x0) / 8.5);
  const length = Math.hypot(...hint), ny = hint[1] / length, nz = hint[2] / length;
  for (let i = 0; i < n; i++) {
    const xa = x0 + ((x1 - x0) * i) / n;
    const xb = x0 + ((x1 - x0) * (i + 1)) / n;
    const tone = 0.99 + (i % 3) * .01;
    b.quad([xa, yEave, zEave], [xa, yRidge, zRidge], [xb, yRidge, zRidge], [xb, yEave, zEave],
      [ROOF_METAL[0] * tone, ROOF_METAL[1] * tone, ROOF_METAL[2] * tone], hint);
    if (i === n - 1) continue;
    const point = (x: number, t: number, lift: number): V3 => [x, yEave + (yRidge - yEave) * t + ny * lift, zEave + (zRidge - zEave) * t + nz * lift];
    // A two-centimetre folded lip catches light without turning every fourth panel into a broad dark stripe.
    const a = point(xb - .09, .006, .025), d = point(xb - .09, .985, .025);
    const at = point(xb - .09, .006, .30), dt = point(xb - .09, .985, .30);
    const c = point(xb + .09, .985, .025), e = point(xb + .09, .006, .025);
    const ct = point(xb + .09, .985, .30), et = point(xb + .09, .006, .30);
    b.quad(a, d, dt, at, ROOF_SEAM, [-1, 0, 0]);
    b.quad(e, et, ct, c, ROOF_SEAM, [1, 0, 0]);
    b.quad(at, dt, ct, et, hex(0x819193), hint);
  }
  b.surface = surface; b.axis = axis;
}

const toHole = (o: Opening): Hole => ({ a0: o.x0, a1: o.x1, y0: F + o.y0, y1: F + o.y1 });

/** Opaque office glazing layered behind shallow sash reveals, within the original wall/window envelope. */
function flatWindow(b: MeshBatch, axis: 'x' | 'z', plane: number, facing: 1 | -1, a0: number, a1: number, y0: number, y1: number): void {
  const surface = b.surface, previousAxis = b.axis;
  b.surface = SURF.paintedMetal; b.axis = 0;
  const P = (a: number, y: number, o: number): V3 => (axis === 'x' ? [a, y, plane + facing * o] : [plane + facing * o, y, a]);
  const hint: V3 = axis === 'x' ? [0, 0, facing] : [facing, 0, 0];
  const q = (left: number, right: number, bottom: number, top: number, depth: number, color: RGB): void => {
    b.quad(P(left, bottom, depth), P(right, bottom, depth), P(right, top, depth), P(left, top, depth), color, hint);
  };
  const sash = hex(0xb9c0bb), edge = hex(0x7e8b89), low = hex(0x3e555b), high = hex(0x819599);
  q(a0, a1, y0, y1, .4, hex(0x46565a));
  const mid = (a0 + a1) / 2;
  const bottom = y0 + 1.1, top = y1 - 1.1;
  for (const [left, right, curtainSide] of [[a0 + 1.1, mid - .5, -1], [mid + .5, a1 - 1.1, 1]]) {
    const start = b.vertexCount;
    q(left!, right!, bottom, top, .53, low);
    for (let i = start; i < b.vertexCount; i++) {
      const t = (b.pos[i * 3 + 1]! - bottom) / (top - bottom);
      for (let channel = 0; channel < 3; channel++) b.col[i * 4 + channel] = low[channel]! + (high[channel]! - low[channel]!) * t;
    }
    // Gathered curtains are seen through the tinted pane; their quiet folds leave most of the glass visible.
    const width = 1.8, curtainLeft = curtainSide! < 0 ? left! : right! - width;
    for (let fold = 0; fold < 3; fold++) {
      const x = curtainLeft + fold * width / 3;
      b.quad(P(x, bottom + 2.0, .56), P(x + width / 6, bottom + 2.25, .61),
        P(x + width / 6, top - .35, .61), P(x, top - .35, .56), hex(0x8b938d), hint);
      b.quad(P(x + width / 6, bottom + 2.25, .61), P(x + width / 3, bottom + 2.0, .56),
        P(x + width / 3, top - .35, .56), P(x + width / 6, top - .35, .61), hex(0x788681), hint);
    }
    b.quad(P(left! + .7, bottom + 3, .66), P(left! + 1.15, bottom + 3, .66),
      P(right! - .55, top - 2.5, .66), P(right! - 1.0, top - 2.5, .66), hex(0x9badae), hint);
    q(left!, right!, top - .45, top, .68, hex(0x3f5055));
  }
  // Folded aluminium surrounds stand forward of the glass, including the lower sill's top surface.
  for (const [left, right] of [[a0, a0 + 1.1], [a1 - 1.1, a1]]) q(left!, right!, y0, y1, .98, sash);
  q(a0 + 1.1, a1 - 1.1, y0, bottom, .98, edge);
  q(a0 + 1.1, a1 - 1.1, top, y1, .98, sash);
  b.quad(P(a0 + 1.1, bottom, .53), P(a1 - 1.1, bottom, .53), P(a1 - 1.1, bottom, .98), P(a0 + 1.1, bottom, .98), sash, UP);
  for (const [x, side] of [[a0 + 1.1, 1], [a1 - 1.1, -1]]) {
    const normal: V3 = axis === 'x' ? [side!, 0, 0] : [0, 0, side!];
    b.quad(P(x!, bottom, .53), P(x!, bottom, .98), P(x!, top, .98), P(x!, top, .53), edge, normal);
  }
  q(mid - .29, mid + .5, bottom, top, 1, sash);
  q(mid - .5, mid - .29, bottom, top, 1, edge);
  b.surface = surface; b.axis = previousAxis;
}

/** Window panes, mullions and rails of the window openings of one wall of the concourse. */
function glazing(k: StationKit, axis: 'x' | 'z', plane: number, thick: number, openings: readonly Opening[]): void {
  for (const o of openings) {
    if (o.kind !== 'window') continue;
    const h = toHole(o);
    const mid = plane + thick / 2;
    const P = (a: number, y: number, p: number): V3 => (axis === 'x' ? [a, y, p] : [p, y, a]);
    pane(k.glass, P(h.a0, h.y0, mid), P(h.a1, h.y0, mid), P(h.a1, h.y1, mid), P(h.a0, h.y1, mid), axis === 'x' ? [0, 0, 1] : [1, 0, 0]);
    const n = Math.max(1, Math.round((h.a1 - h.a0) / 19));
    const box = (a0: number, a1: number, y0: number, y1: number): void => {
      if (axis === 'x') k.room.box(a0, a1, y0, y1, mid - 0.8, mid + 0.8, TRIM, { bottom: true });
      else k.room.box(mid - 0.8, mid + 0.8, y0, y1, a0, a1, TRIM, { bottom: true });
    };
    for (let i = 1; i < n; i++) {
      const a = h.a0 + ((h.a1 - h.a0) * i) / n;
      box(a - 0.6, a + 0.6, h.y0, h.y1);
    }
    box(h.a0, h.a1, h.y0, h.y0 + 1.1);
    box(h.a0, h.a1, h.y1 - 1.1, h.y1);
    box(h.a0, h.a1, h.y0 + (h.y1 - h.y0) * 0.62, h.y0 + (h.y1 - h.y0) * 0.62 + 0.8);
  }
}

/**
 * The station building: walls with real openings (the concourse can be looked into from outside), a hall with
 * floor, ceiling, gates and furniture, solid wings, roof, entrance canopy, the name sign and the entrance ramp.
 * `b` is the town batch of the station (the shell, which also casts the shadows).
 */
export function buildStationBuilding(c: Ctx, b: MeshBatch): void {
  const k = stationKit(c);
  const t0 = performance.now();
  const T = BLD.wall;
  const top = BLD.top;

  // --- foundation: the concourse floor in front of the platform edge stands on a plinth
  b.box(BLD.x0, BLD.x1, 0, F, BLD.z0, PLATFORM.south.z0 + 0.5, PLINTH);

  // --- solid wings (offices / storage) with painted windows
  for (const [xa, xb, face] of [[BLD.x0, HALL.x0, -1], [HALL.x1, BLD.x1, 1]] as [number, number, 1 | -1][]) {
    b.box(xa, xb, F, top, BLD.z0, BLD.z1, WALL);
    b.box(face < 0 ? xa - 0.8 : xa, face < 0 ? xb : xb + 0.8, F, F + 4, BLD.z0 - 0.8, BLD.z1 + 0.8, PLINTH);
    for (let i = 0; i < 3; i++) {
      const w0 = face < 0 ? xa + 10 + i * 26 : xb - 10 - i * 26 - 18;
      for (const [plane, f] of [[BLD.z0, -1], [BLD.z1, 1]] as [number, 1 | -1][]) flatWindow(b, 'x', plane, f, w0, w0 + 18, F + 12, F + 34);
    }
  }

  // --- concourse walls: outer skin (town batch, casts shadows) with real openings
  const frontHoles = FRONT_OPENINGS.map(toHole);
  const backHoles = BACK_OPENINGS.map(toHole);
  for (const [plane, facing, holes] of [[BLD.z0, -1, frontHoles], [BLD.z1, 1, backHoles]] as [number, 1 | -1, Hole[]][]) {
    faceWithHoles(b, 'x', plane, HALL.x0, HALL.x1, F, F + 4, holes, PLINTH, facing);
    faceWithHoles(b, 'x', plane, HALL.x0, HALL.x1, F + 4, top, holes, WALL, facing);
  }
  const frontIn = BLD.z0 + T;
  const backIn = BLD.z1 - T;
  for (const o of FRONT_OPENINGS) reveal(b, 'x', BLD.z0, frontIn, toHole(o), WALL, o.kind === 'window');
  for (const o of BACK_OPENINGS) reveal(b, 'x', backIn, BLD.z1, toHole(o), WALL, o.kind === 'window');
  // wall tops are hidden by the roof; the ceiling slab (casts the shadow that keeps the sun out)
  b.box(HALL.x0, HALL.x1, HALL.ceil, HALL.ceil + 2, HALL.z0, HALL.z1, hex(0xe8e6e0), { bottom: true });

  // --- concourse interior skin: tiled lower walls, painted upper walls, floor, ceiling
  const wainscot = F + 14;
  const panelUv: UvFn = (a, y) => [a / 22.5, y / 22.5];
  const tileUv: UvFn = (a, y) => [a / 15, y / 15];
  const inner: [('x' | 'z'), number, number, number, 1 | -1, Hole[]][] = [
    ['x', frontIn, HALL.x0, HALL.x1, 1, frontHoles],
    ['x', backIn, HALL.x0, HALL.x1, -1, backHoles],
    ['z', HALL.x0 + 0.05, HALL.z0, HALL.z1, 1, []],
    ['z', HALL.x1 - 0.05, HALL.z0, HALL.z1, -1, []],
  ];
  const WHITE: RGB = [1, 1, 1];
  for (const [axis, plane, a0, a1, facing, holes] of inner) {
    faceWithHoles(k.wallTile, axis, plane, a0, a1, F, wainscot, holes, WHITE, facing, tileUv);
    faceWithHoles(k.wallPanel, axis, plane, a0, a1, wainscot, HALL.ceil, holes, WHITE, facing, panelUv);
    // skirting board (not across the doorways)
    const gaps = (axis === 'x' ? (facing > 0 ? FRONT_OPENINGS : BACK_OPENINGS) : []).filter((o) => o.kind === 'door');
    let a = a0;
    for (const g of [...gaps, { x0: a1, x1: a1 }]) {
      if (g.x0 > a) {
        if (axis === 'x') k.room.box(a, g.x0, F, F + 1.4, plane + facing * 0.7, plane + facing * 0.05, hex(0x8c929c));
        else k.room.box(plane + facing * 0.05, plane + facing * 0.7, F, F + 1.4, a, g.x0, hex(0x8c929c));
      }
      a = Math.max(a, g.x1);
    }
  }
  glazing(k, 'x', BLD.z0, T, FRONT_OPENINGS);
  glazing(k, 'x', backIn, T, BACK_OPENINGS);
  // floor and ceiling
  const fy = F + 0.06;
  const fx0 = HALL.x0;
  const fx1 = HALL.x1;
  k.floor.quad([fx0, fy, HALL.z0], [fx1, fy, HALL.z0], [fx1, fy, HALL.z1], [fx0, fy, HALL.z1], WHITE, UP, [
    [fx0 / 30, HALL.z0 / 30], [fx1 / 30, HALL.z0 / 30], [fx1 / 30, HALL.z1 / 30], [fx0 / 30, HALL.z1 / 30],
  ]);
  const cy = HALL.ceil - 0.08;
  k.ceil.quad([fx0, cy, HALL.z0], [fx1, cy, HALL.z0], [fx1, cy, HALL.z1], [fx0, cy, HALL.z1], WHITE, [0, -1, 0], [
    [fx0 / 30, HALL.z0 / 30], [fx1 / 30, HALL.z0 / 30], [fx1 / 30, HALL.z1 / 30], [fx0 / 30, HALL.z1 / 30],
  ]);

  // --- entrance doors: aluminium frame, door mat
  const door = FRONT_OPENINGS.find((o) => o.kind === 'door')!;
  const dh = toHole(door);
  for (const [a0, a1] of [[dh.a0 - 1.4, dh.a0], [dh.a1, dh.a1 + 1.4]] as [number, number][]) k.room.box(a0, a1, F, dh.y1, BLD.z0 + 0.2, frontIn + 0.2, ALU, { bottom: true });
  k.room.box(dh.a0 - 1.4, dh.a1 + 1.4, dh.y1 - 1.2, dh.y1 + 1.4, BLD.z0 + 0.2, frontIn + 0.2, ALU, { bottom: true });
  // frame of the platform doorways
  for (const o of BACK_OPENINGS) {
    if (o.kind !== 'door') continue;
    const h = toHole(o);
    k.room.box(h.a0 - 1.2, h.a0, F, h.y1, backIn - 0.2, BLD.z1 - 0.2, ALU, { bottom: true });
    k.room.box(h.a1, h.a1 + 1.2, F, h.y1, backIn - 0.2, BLD.z1 - 0.2, ALU, { bottom: true });
    k.room.box(h.a0 - 1.2, h.a1 + 1.2, h.y1 - 1.2, h.y1 + 1.2, backIn - 0.2, BLD.z1 - 0.2, ALU, { bottom: true });
  }
  k.room.box(dh.a0 + 2, dh.a1 - 2, F + 0.06, F + 0.3, frontIn + 1, frontIn + 7, hex(0x4a4f58));

  furnishConcourse(c, k);

  // --- roof: ridge along x, large overhang at the plaza side
  const rx0 = BLD.x0 - 8;
  const rx1 = BLD.x1 + 8;
  const ridgeY = top + 24;
  const slope = (ridgeY - top) / (BLD.cz - BLD.z0);
  const zFront = BLD.z0 - 14;
  const zBack = BLD.z1 + 2;
  const yFront = top - (BLD.z0 - zFront) * slope;
  const yBack = top - (zBack - BLD.z1) * slope;
  const rt = 1.6;
  roofStrips(b, rx0, rx1, yFront, zFront, ridgeY, BLD.cz, [0, 1, -slope]);
  b.quad([rx0, yFront - rt, zFront], [rx0, ridgeY - rt, BLD.cz], [rx1, ridgeY - rt, BLD.cz], [rx1, yFront - rt, zFront], ROOF_UNDER, [0, -1, slope]);
  b.quad([rx0, yFront - rt, zFront], [rx1, yFront - rt, zFront], [rx1, yFront, zFront], [rx0, yFront, zFront], hex(0xffffff), [0, 0, -1]);
  roofStrips(b, rx0, rx1, yBack, zBack, ridgeY, BLD.cz, [0, 1, slope]);
  b.box(rx0, rx1, ridgeY - 0.4, ridgeY + 1.4, BLD.cz - 1.4, BLD.cz + 1.4, hex(0xf4f6f8), { bottom: true });
  b.quad([rx0, yBack - rt, zBack], [rx0, ridgeY - rt, BLD.cz], [rx1, ridgeY - rt, BLD.cz], [rx1, yBack - rt, zBack], ROOF_UNDER, [0, -1, -slope]);
  b.quad([rx0, yBack - rt, zBack], [rx1, yBack - rt, zBack], [rx1, yBack, zBack], [rx0, yBack, zBack], hex(0xffffff), [0, 0, 1]);
  for (const x of [BLD.x0, BLD.x1]) {
    b.tri([x, top, BLD.z0], [x, top, BLD.z1], [x, ridgeY - rt, BLD.cz], WALL, [Math.sign(x), 0, 0]);
  }
  // roof edge boards
  for (const x of [rx0, rx1]) {
    const dir = Math.sign(x);
    b.quad([x, yFront - rt, zFront], [x, ridgeY - rt, BLD.cz], [x, ridgeY, BLD.cz], [x, yFront, zFront], ROOF_UNDER, [dir, 0, 0]);
    b.quad([x, yBack - rt, zBack], [x, ridgeY - rt, BLD.cz], [x, ridgeY, BLD.cz], [x, yBack, zBack], ROOF_UNDER, [dir, 0, 0]);
  }

  // --- entrance canopy (over the doors and the ramp only, so that the sun still reaches the windows)
  const zc0 = BLD.z0 - 28;
  b.box(-52, 52, F + 34, F + 38, zc0, BLD.z0, hex(0xf2f5f8), { bottom: true, top: ROOF_METAL });
  for (const x of [-48.5, 48.5]) b.box(x - 2, x + 2, F, F + 34, zc0 + 2, zc0 + 6, hex(0x9a9ca8));
  b.box(-52.4, 52.4, F + 33, F + 39, zc0 - 0.8, zc0 + 0.4, hex(0xffffff));

  // --- tower with the station name sign above the entrance
  const tx = 60;
  const tz0 = BLD.z0 - 4;
  b.box(-tx, tx, top - 2, top + 28, tz0, BLD.z0 + 28, WALL);
  b.box(-tx - 2, tx + 2, top + 28, top + 30, tz0 - 2, BLD.z0 + 30, ROOF_METAL, { bottom: true });
  const sw = 108;
  signZ(k.signs, k.tex.uv('stationName'), 0, top + 0.5, sw, sw / 4, tz0 - 0.15, -1);
  // sign on the back of the tower and on the platform side wall
  signZ(k.signs, k.tex.uv('stationName'), 0, top + 17, 40, 10, BLD.z0 + 28.15, 1);
  signZ(k.signs, k.tex.uv('stationName'), -30, F + 32.6, 46, 11.5, BLD.z1 + 0.15, 1);

  entranceRamp(b);
  platformPassengers(b);
  c.report.push(`station building and furniture built in ${Math.round(performance.now() - t0)} ms`);
}

/** The ramp up to the doors (gentle slope, handrails, yellow tactile strips). */
function entranceRamp(b: MeshBatch): void {
  const e = PLATFORM.entrance;
  const zr = PLATFORM.hall.z0;
  const y0 = 0.7;
  const top = hex(0xdedad0);
  const side = hex(0xb9b4a8);
  const yel = hex(0xf2c21c);
  b.quad([e.x0, y0, e.z0], [e.x1, y0, e.z0], [e.x1, F, zr], [e.x0, F, zr], top, UP);
  for (const x of [e.x0, e.x1]) {
    const dir = x < 0 ? -1 : 1;
    b.quad([x, 0, e.z0], [x, y0, e.z0], [x, F, zr], [x, 0, zr], side, [dir, 0, 0]);
  }
  const yAt = (z: number): number => y0 + ((F - y0) * (z - e.z0)) / (zr - e.z0);
  // tactile strips: a guiding line along the middle and warning bands at both ends
  b.quad([-2, yAt(e.z0) + 0.12, e.z0], [2, yAt(e.z0) + 0.12, e.z0], [2, yAt(zr - 4) + 0.12, zr - 4], [-2, yAt(zr - 4) + 0.12, zr - 4], yel, UP);
  for (const [za, zb] of [[e.z0 + 0.5, e.z0 + 4], [zr - 4, zr - 0.5]] as [number, number][]) {
    b.quad([e.x0 + 4, yAt(za) + 0.12, za], [e.x1 - 4, yAt(za) + 0.12, za], [e.x1 - 4, yAt(zb) + 0.12, zb], [e.x0 + 4, yAt(zb) + 0.12, zb], yel, UP);
  }
  // handrails
  const steel = hex(0x9a9ca8);
  for (const x of [e.x0 + 2, e.x1 - 2]) {
    const zs = [e.z0 + 2, e.z0 + 11, e.z0 + 20, zr - 2];
    for (const z of zs) b.box(x - 0.6, x + 0.6, yAt(z), yAt(z) + 9, z - 0.6, z + 0.6, steel);
    beam(b, [x, yAt(zs[0]!) + 9, zs[0]!], [x, yAt(zs[3]!) + 9, zs[3]!], 1.2, 1.2, steel);
    beam(b, [x, yAt(zs[0]!) + 5, zs[0]!], [x, yAt(zs[3]!) + 5, zs[3]!], 1, 1, steel);
  }
}

/** Station name boards on poles along both platforms (readable from the tracks and from the platforms). */
export function buildNamePoles(c: Ctx, b: MeshBatch): void {
  const k = stationKit(c);
  const uv = k.tex.uv('platformName');
  const steel = hex(0x555a62);
  for (const [z, xs] of [[764, [-440, -120, 220, 560]], [842, [-440, -120, 220, 560]]] as [number, number[]][]) {
    for (const x of xs) {
      b.cylinder(x, z, F, F + 40, 1.2, 1.2, 6, steel);
      b.box(x - 22.8, x + 22.8, F + 38.8, F + 52, z - 1.1, z + 1.1, hex(0xd8dcd7), { bottom: true });
      // A quiet enamel frame and a folded top edge keep the station name prominent.
      b.box(x - 22.8, x + 22.8, F + 52, F + 52.5, z - 1.1, z + 1.1, hex(0x67777a));
      signZ(k.signs, uv, x, F + 39.6, 44, 11, z - 1.2, -1);
      signZ(k.signs, uv, x, F + 39.6, 44, 11, z + 1.2, 1);
    }
  }
}

/** The two platform slabs: concrete sides and a tiled top (a textured quad, so the joints do not shimmer). */
export function buildPlatformSlabs(c: Ctx, b: MeshBatch, side: RGB): void {
  const k = stationKit(c);
  const { x0, x1, h } = PLATFORM;
  for (const [z0, z1] of [[PLATFORM.south.z0, PLATFORM.south.z1], [PLATFORM.north.z0, PLATFORM.north.z1]] as [number, number][]) {
    b.quad([x0, 0, z0], [x1, 0, z0], [x1, h, z0], [x0, h, z0], side, [0, 0, -1]);
    b.quad([x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1], side, [0, 0, 1]);
    b.quad([x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0], side, [-1, 0, 0]);
    b.quad([x1, 0, z0], [x1, 0, z1], [x1, h, z1], [x1, h, z0], side, [1, 0, 0]);
    const s = 60;
    k.platform.quad([x0, h, z0], [x0, h, z1], [x1, h, z1], [x1, h, z0], [1, 1, 1], UP, [
      [x0 / s, z0 / s], [x0 / s, z1 / s], [x1 / s, z1 / s], [x1 / s, z0 / s],
    ]);
  }
}
