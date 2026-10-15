import type { Ctx } from './ctx';
import { DEC1_Y } from './ctx';
import { SUMMIT_XZ, heightAt } from './terrain';
import { hex } from './util';

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
  const red = hex(0xd8402a);
  const black = hex(0x2b2b30);
  const tzz = S.z - 34;
  // torii
  for (const ox of [-22, 22]) b.cylinder(sx + ox, tzz, y0, y0 + 50, 3.6, 3.2, 8, red, true);
  b.box(sx - 34, sx + 34, y0 + 50, y0 + 55, tzz - 3.5, tzz + 3.5, black); // kasagi
  b.box(sx - 31, sx + 31, y0 + 45, y0 + 48, tzz - 2.5, tzz + 2.5, red); // shimaki
  b.box(sx - 26, sx + 26, y0 + 36, y0 + 40, tzz - 2, tzz + 2, red); // nuki
  b.box(sx - 3, sx + 3, y0 + 40, y0 + 48, tzz - 2, tzz + 2, hex(0xe8c76a));
  // stone path to the hall
  c.dec1.quad([sx - 8, y0 + DEC1_Y + 1.6, tzz - 3], [sx + 8, y0 + DEC1_Y + 1.6, tzz - 3], [sx + 8, y0 + DEC1_Y + 1.6, S.z - 62], [sx - 8, y0 + DEC1_Y + 1.6, S.z - 62], hex(0xb9b4a8), [0, 1, 0]);
  // hall
  const hz = S.z - 80;
  b.box(sx - 18, sx + 18, y0, y0 + 5, hz - 14, hz + 14, hex(0x9d9a92)); // stone base
  b.box(sx - 15, sx + 15, y0 + 5, y0 + 33, hz - 11, hz + 11, hex(0xc9a47a));
  for (const ox of [-15, -5, 5, 15]) b.cylinder(sx + ox, hz + 11, y0 + 5, y0 + 33, 1.6, 1.6, 6, red, false);
  b.box(sx - 8, sx + 8, y0 + 5, y0 + 26, hz + 11.2, hz + 11.8, hex(0x3b2a22)); // door
  b.gable(sx - 15, sx + 15, hz - 11, hz + 11, y0 + 33, 17, 'z', 7, hex(0x4a4f58), hex(0xc9a47a));
  // offering box + rope-ish details
  b.box(sx - 8, sx + 8, y0 + 5, y0 + 11, hz + 17, hz + 22, hex(0x7d5a38));
  b.box(sx - 7, sx + 7, y0 + 11, y0 + 12, hz + 16.5, hz + 22.5, hex(0x5d4228));
  c.obstacles.push({ minX: sx - 18, maxX: sx + 18, minZ: hz - 14, maxZ: hz + 24 });
  // stone lanterns beside the path
  for (const ox of [-14, 14]) {
    const lz = S.z - 56;
    b.box(sx + ox - 3, sx + ox + 3, y0, y0 + 3, lz - 3, lz + 3, hex(0xa9a69e));
    b.cylinder(sx + ox, lz, y0 + 3, y0 + 14, 1.8, 1.8, 6, hex(0xb8b5ac));
    b.box(sx + ox - 4, sx + ox + 4, y0 + 14, y0 + 20, lz - 4, lz + 4, hex(0xb8b5ac));
    b.box(sx + ox - 2.5, sx + ox + 2.5, y0 + 15.5, y0 + 18.5, lz - 4.2, lz + 4.2, hex(0xffe9a0));
    b.box(sx + ox - 6, sx + ox + 6, y0 + 20, y0 + 23, lz - 6, lz + 6, hex(0x9a978f));
  }
  return { deck: { x: dx, z: dz, y: top } };
}
