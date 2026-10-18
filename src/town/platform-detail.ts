import { SURF } from '../surface';
import { beam, type MeshBatch } from './batch';
import type { Ctx } from './ctx';
import { PLATFORM } from './platform';
import { discFace } from './shapes';
import { signX, stationKit } from './stationkit';
import { hex, type RGB, type V3 } from './util';

const STEEL = hex(0x788184);
const EDGE = hex(0xaab0ae);
const DARK = hex(0x424d50);

/** A rail's narrow web, broad foot and polished head, inside the original 1.9 × 2.4 section. */
export function railProfile(b: MeshBatch, a: V3, c: V3): void {
  const oldSurface = b.surface, oldAxis = b.axis;
  b.surface = SURF.paintedMetal; b.axis = 0;
  const length = Math.hypot(c[0] - a[0], c[2] - a[2]) || 1;
  const nx = -(c[2] - a[2]) / length, nz = (c[0] - a[0]) / length;
  const at = (p: V3, x: number, y: number): V3 => [p[0] + nx * x, p[1] + y, p[2] + nz * x];
  const section: [number, number][] = [[-.95, -1.2], [-.32, -.85], [-.32, .72], [-.85, .86], [-.85, 1.2], [.85, 1.2], [.85, .86], [.32, .72], [.32, -.85], [.95, -1.2]];
  for (let i = 0; i + 1 < section.length; i++) {
    const p = section[i]!, q = section[i + 1]!;
    const dx = q[0] - p[0], dy = q[1] - p[1], scale = Math.hypot(dx, dy);
    const normal: V3 = [-dy * nx / scale, dx / scale, -dy * nz / scale];
    const color = i === 4 ? hex(0xbac1bf) : i === 3 || i === 5 ? hex(0x7d8583) : hex(0x75655a);
    b.quad(at(a, p[0], p[1]), at(c, p[0], p[1]), at(c, q[0], q[1]), at(a, q[0], q[1]), color, normal);
  }
  b.surface = oldSurface; b.axis = oldAxis;
}

/** A fastening plate beside each running rail, confined to the existing sleeper surface. */
export function sleeperFasteners(b: MeshBatch, x: number, y: number, z: number, nx: number, nz: number): void {
  const oldSurface = b.surface, oldAxis = b.axis;
  b.surface = SURF.paintedMetal; b.axis = 0;
  for (const off of [-6.6, 6.6]) {
    const point = (across: number, along: number, lift = 0): V3 => [x + nx * (off + across) + nz * along, y + lift, z + nz * (off + across) - nx * along];
    b.quad(point(-1.7, -1.2), point(1.7, -1.2), point(1.7, 1.2), point(-1.7, 1.2), hex(0x58534b), [0, 1, 0]);
    for (const side of [-1, 1]) b.quad(point(side * 1.35 - .2, -.5, .08), point(side * 1.35 + .2, -.5, .08), point(side * 1.35 + .2, .5, .08), point(side * 1.35 - .2, .5, .08), hex(0x9a9485), [0, 1, 0]);
  }
  b.surface = oldSurface; b.axis = oldAxis;
}

/** Thin rafters, knee braces and rainwater fittings follow the existing roof and post positions. */
export function canopyStructure(b: MeshBatch, zc: number, depth: number, xa: number, xb: number): void {
  const oldSurface = b.surface, oldAxis = b.axis;
  b.surface = SURF.paintedMetal; b.axis = 0;
  const h = PLATFORM.h, za = zc - depth / 2, zb = zc + depth / 2;
  for (const z of [za + 1.2, zb - 1.2]) {
    b.box(xa, xb, h + 43.3, h + 44.1, z - .55, z + .55, STEEL);
    b.box(xa, xb, h + 47.2, h + 48.1, z - .7, z + .7, EDGE);
  }
  for (let x = xa + 20; x <= xb - 10; x += 100) {
    b.box(x - .7, x + .7, h + 42.4, h + 44, za + 1.5, zb - 1.5, STEEL);
    beam(b, [x, h + 34, zb - 6], [x, h + 43, zc - 3], 1, 1, EDGE);
    // A shallow double-lamp casing hangs above the walking space, wholly clear of heads.
    const lampEnd = Math.min(x + 44, xb - 2);
    b.box(x + 21, lampEnd, h + 42.5, h + 43.1, zc - 4, zc - 1.7, STEEL, { bottom: true });
    b.quad([x + 22, h + 42.45, zc - 3.6], [lampEnd - 1, h + 42.45, zc - 3.6], [lampEnd - 1, h + 42.45, zc - 2.1], [x + 22, h + 42.45, zc - 2.1], hex(0xf4f0de), [0, -1, 0]);
  }
  // Downpipes sit within the silhouette of two existing posts; no new ground obstruction.
  for (const x of [xa + 120, xb - 140]) {
    const z = zb - 5.3;
    b.cylinder(x + .65, z, h, h + 47.2, .48, .48, 6, EDGE);
    beam(b, [x + .65, h + 47.2, z], [x + .65, h + 47.2, zb - 1.2], .8, .8, EDGE);
    for (const y of [h + 8, h + 26, h + 40]) b.cylinder(x + .65, z, y, y + .6, .6, .6, 6, STEEL);
  }
  b.surface = oldSurface; b.axis = oldAxis;
}

/** Slatted timber uses the same seat and back envelope as the existing platform benches. */
export function platformBench(b: MeshBatch, x: number, z: number): void {
  const oldSurface = b.surface, oldAxis = b.axis, h = PLATFORM.h;
  b.surface = SURF.plain; b.axis = 0;
  const colors = [hex(0x98754e), hex(0xa27c52), hex(0x91704c)];
  for (let i = 0; i < 3; i++) {
    b.box(x - 12, x + 12, h + 4.7, h + 6, z + i * 2.35, z + i * 2.35 + 2.15, colors[i]!);
    b.box(x - 12, x + 12, h + 6.3 + i * 2.6, h + 8.6 + i * 2.6, z + 6, z + 8, colors[i]!);
  }
  b.surface = SURF.paintedMetal;
  for (const dx of [-9, 9]) {
    b.box(x + dx - .6, x + dx + .6, h, h + 5, z + .7, z + 6.3, DARK);
    b.box(x + dx - .45, x + dx + .45, h + 5, h + 13.8, z + 7.2, z + 7.9, DARK);
  }
  b.surface = oldSurface; b.axis = oldAxis;
}

/** Raised coping blocks occupy the existing track-edge strip, outside the yellow warning band. */
export function platformCoping(b: MeshBatch): void {
  const oldSurface = b.surface, oldAxis = b.axis;
  b.surface = SURF.plain; b.axis = 0;
  const { x0, x1, h } = PLATFORM;
  for (const [za, zb] of [[774.5, 779.8], [828.2, 833.5]]) {
    for (let x = x0; x < x1; x += 40) {
      const right = Math.min(x + 39.8, x1), color: RGB = hex((Math.round((x - x0) / 40) % 4 === 0) ? 0xc3c1b8 : 0xcccbc2);
      b.quad([x, h + .04, za!], [right, h + .04, za!], [right, h + .04, zb!], [x, h + .04, zb!], color, [0, 1, 0]);
    }
  }
  b.surface = oldSurface; b.axis = oldAxis;
}

/** Two-sided departure boards and a readable clock, suspended in the existing canopy clearance. */
export function platformWayfinding(c: Ctx, b: MeshBatch): void {
  const k = stationKit(c), oldSurface = b.surface, oldAxis = b.axis;
  b.surface = SURF.paintedMetal; b.axis = 0;
  for (const [x, z] of [[185, 740], [-115, 740], [185, 888]]) {
    b.box(x! - .65, x! + .65, 38.5, 45.5, z! - 13, z! + 13, DARK, { bottom: true });
    for (const dz of [-10, 10]) b.box(x! - .2, x! + .2, 45.5, 50, z! + dz - .2, z! + dz + .2, STEEL);
    for (const facing of [-1, 1] as const) signX(k.signs, k.tex.uv('departure'), z!, 39, 25, 6.1, x! + facing * .7, facing);
    const uv = k.tex.uv('clock');
    for (const facing of [-1, 1] as const) {
      discFace(b, [x! + facing * .25, 33.8, z!], [facing, 0, 0], [0, 1, 0], 3.8, 20, DARK);
      discFace(k.signs, [x! + facing * .28, 33.8, z!], [facing, 0, 0], [0, 1, 0], 3.5, 24, [1, 1, 1], {
        cu: (uv.u0 + uv.u1) / 2, cv: (uv.v0 + uv.v1) / 2, ru: (uv.u1 - uv.u0) * .49, rv: (uv.v1 - uv.v0) * .49,
      });
    }
    b.box(x! - .25, x! + .25, 37, 39, z! - .25, z! + .25, DARK);
  }
  b.surface = oldSurface; b.axis = oldAxis;
}
