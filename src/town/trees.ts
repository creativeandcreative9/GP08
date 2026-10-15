import type { Ctx } from './ctx';
import { DEC3_Y } from './ctx';
import { heightAt } from './terrain';
import { hex, type RGB } from './util';

const BLOSSOM: RGB[] = [0xffc0d4, 0xffd0de, 0xffb0cc, 0xffdce6, 0xffbad0].map(hex);
const TRUNK = hex(0x6a4b3b);
const LEAF: RGB[] = [0x6cc060, 0x59b052, 0x7ccb6a, 0x4c9f4f].map(hex);

/** Cherry tree in full bloom: trunk + a cluster of pink blossom blobs, with fallen petals on the ground. */
export function addCherry(c: Ctx, x: number, z: number, scale = 1): void {
  const b = c.main.at(x, z);
  const y0 = heightAt(x, z);
  const s = scale;
  const r = c.rnd;
  b.cylinder(x, z, y0, y0 + 36 * s, 3.8 * s, 2.4 * s, 6, TRUNK, false);
  // two branches
  const a1 = r() * Math.PI * 2;
  for (let k = 0; k < 2; k++) {
    const a = a1 + k * 2.4;
    b.cylinder(x + Math.cos(a) * 7 * s, z + Math.sin(a) * 7 * s, y0 + 34 * s, y0 + 52 * s, 2.2 * s, 1.4 * s, 5, TRUNK, false);
  }
  const base = BLOSSOM[Math.floor(r() * BLOSSOM.length)]!;
  const blobs: [number, number, number, number][] = [
    [0, 62, 0, 30], [22, 54, 6, 24], [-21, 55, -4, 24], [6, 50, -22, 22], [-6, 52, 22, 22],
    [2, 82, 3, 20], [16, 70, -14, 17], [-16, 70, 14, 17],
  ];
  blobs.forEach(([dx, dy, dz, rad], i) => {
    const jx = (r() - 0.5) * 4;
    b.blob(x + dx * s + jx, y0 + dy * s, z + dz * s, rad * s * 1.1, rad * s * 0.88, rad * s * 1.1, base, 0.07, i + x);
  });
  c.dec3.disc(x, z, heightAt(x, z) + DEC3_Y, 36 * s, 36 * s, 9, hex(0xf8dce4));
}

/** Plain round green tree. */
export function addRoundTree(c: Ctx, x: number, z: number, scale = 1): void {
  const b = c.main.at(x, z);
  const y0 = heightAt(x, z);
  const col = LEAF[Math.floor(c.rnd() * LEAF.length)]!;
  b.cylinder(x, z, y0, y0 + 26 * scale, 3 * scale, 2.2 * scale, 6, TRUNK, false);
  b.blob(x, y0 + 46 * scale, z, 22 * scale, 22 * scale, 22 * scale, col, 0.08, x);
  b.blob(x + 9 * scale, y0 + 38 * scale, z + 4 * scale, 15 * scale, 14 * scale, 15 * scale, col, 0.08, z);
}

/** Cheap mountain trees go to the forest batch. */
export function addForestTree(c: Ctx, x: number, z: number, scale: number, kind: number): void {
  const b = c.forest.at(x, z);
  const y0 = heightAt(x, z) - 3;
  if (kind === 0) {
    const col: RGB = [0.16 + c.rnd() * 0.08, 0.38 + c.rnd() * 0.1, 0.2 + c.rnd() * 0.06];
    b.cylinder(x, z, y0, y0 + 30 * scale, 3 * scale, 2.5 * scale, 4, TRUNK, false);
    b.cylinder(x, z, y0 + 22 * scale, y0 + 78 * scale, 26 * scale, 0, 6, col, false);
    b.cylinder(x, z, y0 + 54 * scale, y0 + 118 * scale, 20 * scale, 0, 6, [col[0] * 1.08, col[1] * 1.08, col[2] * 1.08], false);
  } else if (kind === 1) {
    const col: RGB = [0.3 + c.rnd() * 0.1, 0.55 + c.rnd() * 0.12, 0.26 + c.rnd() * 0.06];
    b.cylinder(x, z, y0, y0 + 40 * scale, 3.5 * scale, 2.8 * scale, 4, TRUNK, false);
    b.blob(x, y0 + 68 * scale, z, 34 * scale, 32 * scale, 34 * scale, col, 0.07, x * 0.01 + z);
  } else {
    // wild cherry on the hillside
    const col = BLOSSOM[Math.floor(c.rnd() * BLOSSOM.length)]!;
    b.cylinder(x, z, y0, y0 + 38 * scale, 3.5 * scale, 2.8 * scale, 4, TRUNK, false);
    b.blob(x, y0 + 66 * scale, z, 34 * scale, 28 * scale, 34 * scale, col, 0.07, x * 0.01 + z);
  }
}
