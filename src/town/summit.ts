import type { Ctx } from './ctx';
import { SURF } from '../surface';
import { DEC1_Y } from './ctx';
import { SUMMIT_XZ, heightAt } from './terrain';
import { hex, shade, type RGB, type V3 } from './util';

export interface SummitInfo {
  /** Centre of the observation deck (world x,z) and the walking surface height. */
  deck: { x: number; z: number; y: number };
}

/** Observation deck (wooden platform with railings) and a small shrine on the summit plateau. */
export function buildSummit(c: Ctx): SummitInfo {
  const S = SUMMIT_XZ;
  const y0 = heightAt(S.x, S.z);
  const b = c.main.at(S.x, S.z);
  // bare-earth / gravel plateau
  c.dec1.disc(S.x, S.z, y0 + DEC1_Y + 1.2, 100, 100, 28, hex(0xcdbf9c));

  // ---- observation deck ----
  const dx = S.x + 30;
  const dz = S.z + 25;
  const w = 104; // x extent
  const d = 72; // z extent
  const top = y0 + 8;
  const wood = hex(0xb98b5a);
  const woodDark = hex(0x7d5a38);
  b.box(dx - w / 2, dx + w / 2, y0, top, dz - d / 2, dz + d / 2, wood, { top: hex(0xc99a64) });
  // posts below the edge
  for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 1], [0, -1]] as [number, number][]) {
    b.cylinder(dx + px * (w / 2 - 3), dz + pz * (d / 2 - 3), y0 - 2, top, 2.2, 2.2, 6, woodDark, false);
  }
  // railings on three sides (open on the SW side, towards the shrine)
  const rh = 11;
  const rail = (x0: number, x1: number, z0: number, z1: number): void => {
    b.box(x0, x1, top + rh - 0.8, top + rh + 0.4, z0, z1, hex(0xf1e9da));
    b.box(x0, x1, top + 5, top + 5.8, z0, z1, hex(0xe0d6c2));
  };
  // north and east and south edges
  rail(dx - w / 2, dx + w / 2, dz + d / 2 - 1.4, dz + d / 2 + 0.4);
  rail(dx + w / 2 - 1.4, dx + w / 2 + 0.4, dz - d / 2, dz + d / 2);
  rail(dx - w / 2, dx + w / 2, dz - d / 2 - 0.4, dz - d / 2 + 1.4);
  for (let i = 0; i <= 12; i++) {
    const x = dx - w / 2 + (i * w) / 12;
    b.box(x - 0.5, x + 0.5, top, top + rh, dz + d / 2 - 1.2, dz + d / 2 + 0.4, hex(0xd8cdb5));
    b.box(x - 0.5, x + 0.5, top, top + rh, dz - d / 2 - 0.4, dz - d / 2 + 1.2, hex(0xd8cdb5));
  }
  for (let i = 0; i <= 8; i++) {
    const z = dz - d / 2 + (i * d) / 8;
    b.box(dx + w / 2 - 1.2, dx + w / 2 + 0.4, top, top + rh, z - 0.5, z + 0.5, hex(0xd8cdb5));
  }
  // plank joints
  for (let x = dx - w / 2 + 8; x < dx + w / 2; x += 8) b.box(x - 0.2, x + 0.2, top, top + 0.12, dz - d / 2, dz + d / 2, woodDark);
  // steps from the plateau
  b.box(dx - w / 2 - 6, dx - w / 2, y0, y0 + 4, dz - 14, dz + 14, wood);
  // benches and a coin telescope
  for (const z of [-18, 18]) {
    b.box(dx - 34, dx - 14, top + 4, top + 6, dz + z - 3, dz + z + 3, woodDark);
    b.box(dx - 34, dx - 14, top + 6, top + 14, dz + z + (z > 0 ? 2 : -2), dz + z + (z > 0 ? 3.5 : -3.5), woodDark);
    b.box(dx - 32, dx - 30, top, top + 4, dz + z - 2, dz + z + 2, hex(0x444444));
    b.box(dx - 18, dx - 16, top, top + 4, dz + z - 2, dz + z + 2, hex(0x444444));
  }
  const tx = dx + 38;
  const tz = dz - 26;
  b.cylinder(tx, tz, top, top + 13, 2.8, 2.2, 8, hex(0x3d6ea8));
  b.cylinder(tx, tz, top + 13, top + 15, 5, 5, 8, hex(0x2d4f7d));
  b.quad([tx - 2, top + 15, tz - 2], [tx + 8, top + 21, tz + 5], [tx + 10, top + 19, tz + 7], [tx, top + 13, tz], hex(0x3d6ea8), [0, 1, 0]);
  // flag pole
  b.cylinder(dx + w / 2 - 8, dz - d / 2 + 8, top, top + 70, 1, 0.8, 5, hex(0xdfe3e8));
  b.quad([dx + w / 2 - 8, top + 68, dz - d / 2 + 8], [dx + w / 2 - 8, top + 68, dz - d / 2 + 30], [dx + w / 2 - 8, top + 54, dz - d / 2 + 30], [dx + w / 2 - 8, top + 54, dz - d / 2 + 8], hex(0xffffff), [-1, 0, 0]);
  b.disc(dx + w / 2 - 8.3, dz - d / 2 + 19, top + 61, 4.5, 4.5, 10, hex(0xd8322a));

  // ---- shrine: torii + small hall, facing north ----
  const sx = S.x - 38;
  const red = hex(0xc94932);
  const black = hex(0x303b39);
  const tzz = S.z - 34;
  // Lacquered wood uses the plain painted finish; red pigment must not imply brick mortar.
  const painted = (draw: () => void): void => {
    const previous = b.surface;
    b.surface = SURF.paintedMetal;
    try { draw(); } finally { b.surface = previous; }
  };
  // torii
  for (const ox of [-22, 22]) {
    // Preserve the original taper above the black foot without two intersecting cylinder skins.
    painted(() => b.cylinder(sx + ox, tzz, y0 + 7.7, y0 + 50, 3.6 - .4 * 7.7 / 50, 3.2, 12, red, true));
    b.cylinder(sx + ox, tzz, y0, y0 + 1.2, 3.6, 3.6, 12, hex(0x62665e));
    painted(() => {
      b.cylinder(sx + ox, tzz, y0 + 1.2, y0 + 7.2, 3.6, 3.52, 12, black);
      b.cylinder(sx + ox, tzz, y0 + 7.2, y0 + 7.7, 3.56, 3.56, 12, shade(black, 1.25));
    });
  }
  // The ends turn gently upwards within the original 55-unit height envelope.
  const curvedBeam = (half: number, base: number, rise: number, thick: number, depth: number, color: RGB): void => {
    const edge = (x: number): number => y0 + base + rise * (x / half) ** 2;
    for (let i = 0; i < 12; i++) {
      const a = -half + 2 * half * i / 12, z = -half + 2 * half * (i + 1) / 12;
      const ya = edge(a), yz = edge(z), x0 = sx + a, x1 = sx + z;
      b.quad([x0, ya + thick, tzz - depth], [x1, yz + thick, tzz - depth], [x1, yz + thick, tzz + depth], [x0, ya + thick, tzz + depth], shade(color, 1.1), [0, 1, 0]);
      b.quad([x0, ya, tzz - depth], [x1, yz, tzz - depth], [x1, yz, tzz + depth], [x0, ya, tzz + depth], shade(color, .72), [0, -1, 0]);
      for (const side of [-1, 1]) b.quad([x0, ya, tzz + side * depth], [x1, yz, tzz + side * depth], [x1, yz + thick, tzz + side * depth], [x0, ya + thick, tzz + side * depth], color, [0, 0, side]);
    }
    for (const side of [-1, 1]) b.quad([sx + side * half, edge(half), tzz - depth], [sx + side * half, edge(half), tzz + depth], [sx + side * half, edge(half) + thick, tzz + depth], [sx + side * half, edge(half) + thick, tzz - depth], shade(color, .9), [side, 0, 0]);
  };
  painted(() => {
    curvedBeam(34, 48.5, 2.4, 4.1, 3.5, black);
    curvedBeam(31, 44.8, 1.8, 3, 2.5, red);
    b.box(sx - 26, sx + 26, y0 + 36, y0 + 40, tzz - 2, tzz + 2, red); // nuki
  });
  const gilt = hex(0xc4a76b);
  painted(() => {
    b.box(sx - 3.3, sx + 3.3, y0 + 39.5, y0 + 47.8, tzz - 2.15, tzz + 2.4, gilt);
    b.box(sx - 2.65, sx + 2.65, y0 + 40.1, y0 + 47.2, tzz + 2.4, tzz + 2.6, hex(0x30453f));
  });
  // A small five-petal crest belongs to this unnamed shrine; no invented lettering.
  for (let petal = 0; petal < 5; petal++) {
    const angle = petal * Math.PI * 2 / 5, cx = sx + Math.cos(angle) * .85, cy = y0 + 44 + Math.sin(angle) * .85;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, z = (i + 1) * Math.PI / 4;
      painted(() => b.tri([cx, cy, tzz + 2.65], [cx + Math.cos(a) * .7, cy + Math.sin(a) * .7, tzz + 2.65], [cx + Math.cos(z) * .7, cy + Math.sin(z) * .7, tzz + 2.65], gilt, [0, 0, 1]));
    }
  }
  const ropeY = (x: number): number => y0 + 31.5 + 2.2 * (x / 18) ** 2;
  for (let i = 0; i < 12; i++) {
    const a = -18 + i * 3, z = a + 3, ya = ropeY(a), yz = ropeY(z);
    const length = Math.hypot(3, yz - ya), nx = -(yz - ya) / length, ny = 3 / length;
    const ring = (x: number, y: number, t: number): V3 => [sx + x + nx * Math.cos(t) * .42, y + ny * Math.cos(t) * .42, tzz + 2.6 + Math.sin(t) * .42];
    for (let j = 0; j < 6; j++) {
      const t0 = j * Math.PI / 3, t1 = (j + 1) * Math.PI / 3;
      b.quad(ring(a, ya, t0), ring(z, yz, t0), ring(z, yz, t1), ring(a, ya, t1), hex(i % 2 ? 0xb69c6a : 0xcbb783), [nx * Math.cos((t0 + t1) / 2), ny * Math.cos((t0 + t1) / 2), Math.sin((t0 + t1) / 2)]);
    }
  }
  for (const x of [-12, -4, 4, 12]) {
    const y = ropeY(x);
    for (let i = 0; i < 4; i++) {
      const shift = i % 2 ? -.7 : .4, next = i % 2 ? .4 : -.7;
      b.quad([sx + x + shift, y - i * 1.15, tzz + 2.65], [sx + x + shift + 1.15, y - i * 1.15, tzz + 2.65], [sx + x + next + 1.15, y - (i + 1) * 1.15, tzz + 2.8], [sx + x + next, y - (i + 1) * 1.15, tzz + 2.8], hex(i % 2 ? 0xe1ddcc : 0xf6f1e5), [0, 0, 1]);
    }
  }
  // stone path to the hall
  c.dec1.quad([sx - 8, y0 + DEC1_Y + 1.6, tzz - 3], [sx + 8, y0 + DEC1_Y + 1.6, tzz - 3], [sx + 8, y0 + DEC1_Y + 1.6, S.z - 62], [sx - 8, y0 + DEC1_Y + 1.6, S.z - 62], hex(0xb9b4a8), [0, 1, 0]);
  // hall
  const hz = S.z - 80;
  b.box(sx - 18, sx + 18, y0, y0 + 5, hz - 14, hz + 14, hex(0x9d9a92)); // stone base
  b.box(sx - 15, sx + 15, y0 + 5, y0 + 33, hz - 11, hz + 11, hex(0xc9a47a));
  painted(() => {
    for (const ox of [-15, -5, 5, 15]) b.cylinder(sx + ox, hz + 11, y0 + 5, y0 + 33, 1.6, 1.6, 6, red, false);
  });
  b.box(sx - 8, sx + 8, y0 + 5, y0 + 26, hz + 11.2, hz + 11.8, hex(0x3b2a22)); // door
  const cedar = hex(0x9f7953);
  for (let x = -7.2; x <= 7.2; x += 2.4) b.box(sx + x - .28, sx + x + .28, y0 + 7, y0 + 25, hz + 11.8, hz + 12.3, cedar);
  for (const y of [7, 15, 25]) b.box(sx - 8, sx + 8, y0 + y, y0 + y + .6, hz + 11.8, hz + 12.3, cedar);
  b.box(sx - 16.5, sx + 16.5, y0 + 27.7, y0 + 30.2, hz + 10.5, hz + 13, hex(0x75583c));
  b.box(sx - 19, sx + 19, y0 + 31.5, y0 + 32.6, hz - 14, hz + 14, hex(0x554b3e));
  for (const x of [-13, -7, 0, 7, 13]) b.box(sx + x - .6, sx + x + .6, y0 + 30.4, y0 + 32.6, hz + 10.5, hz + 15, cedar);
  b.gable(sx - 15, sx + 15, hz - 11, hz + 11, y0 + 33, 17, 'z', 7, hex(0x4a4f58), hex(0xc9a47a));
  // offering box + rope-ish details
  b.box(sx - 8, sx + 8, y0 + 5, y0 + 11, hz + 17, hz + 22, hex(0x7d5a38));
  b.box(sx - 7, sx + 7, y0 + 10.8, y0 + 11.2, hz + 16.5, hz + 22.5, hex(0x332d24));
  for (let x = -7; x < 7; x += 2) b.box(sx + x, sx + x + .85, y0 + 11.2, y0 + 12, hz + 16.5, hz + 22.5, cedar);
  b.box(sx - 8, sx + 8, y0 + 5.7, y0 + 6.4, hz + 22, hz + 22.3, cedar);
  c.obstacles.push({ minX: sx - 18, maxX: sx + 18, minZ: hz - 14, maxZ: hz + 24 });
  // stone lanterns beside the path
  for (const ox of [-14, 14]) {
    const lz = S.z - 56;
    b.box(sx + ox - 3, sx + ox + 3, y0, y0 + 3, lz - 3, lz + 3, hex(0xa9a69e));
    b.cylinder(sx + ox, lz, y0 + 3, y0 + 14, 1.8, 1.8, 6, hex(0xb8b5ac));
    const lx = sx + ox, stone = hex(0xaaa99e);
    b.box(lx - 4, lx + 4, y0 + 14, y0 + 14.8, lz - 4, lz + 4, stone);
    b.box(lx - 2.6, lx + 2.6, y0 + 14.8, y0 + 19.5, lz - 2.6, lz + 2.6, hex(0x555b51));
    for (const x of [-3.3, 3.3]) for (const z of [-3.3, 3.3]) b.box(lx + x - .7, lx + x + .7, y0 + 14.8, y0 + 20, lz + z - .7, lz + z + .7, stone);
    b.box(lx - .55, lx + .55, y0 + 15.3, y0 + 18.7, lz - 2.9, lz + 2.9, hex(0xc7b991));
    b.box(lx - 4, lx + 4, y0 + 19.4, y0 + 20, lz - 4, lz + 4, stone);
    // A low hipped stone cap retains the original extent and maximum height.
    for (const side of [-1, 1]) {
      b.quad([lx - 6, y0 + 20.5, lz + side * 6], [lx + 6, y0 + 20.5, lz + side * 6], [lx + 1.3, y0 + 22.5, lz + side * 1.3], [lx - 1.3, y0 + 22.5, lz + side * 1.3], stone, [0, 1, side]);
      b.quad([lx + side * 6, y0 + 20.5, lz - 6], [lx + side * 6, y0 + 20.5, lz + 6], [lx + side * 1.3, y0 + 22.5, lz + 1.3], [lx + side * 1.3, y0 + 22.5, lz - 1.3], stone, [side, 1, 0]);
    }
    b.box(lx - 6, lx + 6, y0 + 20, y0 + 20.5, lz - 6, lz + 6, shade(stone, .87));
    b.cylinder(lx, lz, y0 + 22.5, y0 + 23, 1.3, .5, 8, stone);
  }
  return { deck: { x: dx, z: dz, y: top } };
}
