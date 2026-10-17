import type { Ctx } from './ctx';
import { DEC1_Y, DEC2_Y } from './ctx';
import type { Frame } from './frame';
import type { Lot } from './layout';
import { signOnFace } from './parts';
import { heightAt } from './terrain';
import { addCherry } from './trees';
import { hex, type RGB } from './util';

/** Lawn with cross paths, cherry trees along the edge, benches and a name board. */
export function addPark(c: Ctx, lot: Lot, f: Frame, hu: number, hv: number): void {
  const b = c.main.at(f.cx, f.cz);
  const lawn = hex(0x8da77c);
  const path = hex(0xf1e6d0);
  const q = (dec: 'dec1' | 'dec2' | 'dec3', u0: number, u1: number, v0: number, v1: number, col: RGB, y: number): void =>
    c[dec].quad(f.pt(u0, y, v0), f.pt(u1, y, v0), f.pt(u1, y, v1), f.pt(u0, y, v1), col, [0, 1, 0]);
  q('dec1', -hu, hu, -hv, hv, lawn, DEC1_Y);
  const pw = 9;
  q('dec2', -pw, pw, -hv, hv, path, DEC2_Y);
  q('dec2', -hu, hu, -pw, pw, path, DEC2_Y);
  // low hedge around the park with openings at the path ends
  const hedge = hex(0x4f9a46);
  const ho = 5;
  for (const v of [-hv + 2, hv - 2]) {
    f.box(b, -hu, -pw - 6, 0, 7, v - ho / 2, v + ho / 2, hedge);
    f.box(b, pw + 6, hu, 0, 7, v - ho / 2, v + ho / 2, hedge);
  }
  for (const u of [-hu + 2, hu - 2]) {
    f.box(b, u - ho / 2, u + ho / 2, 0, 7, -hv, -pw - 6, hedge);
    f.box(b, u - ho / 2, u + ho / 2, 0, 7, pw + 6, hv, hedge);
  }
  // cherry trees around the edge
  const step = 78;
  const nU = Math.max(1, Math.floor((hu * 2 - 40) / step));
  const nV = Math.max(1, Math.floor((hv * 2 - 40) / step));
  for (let i = 0; i <= nU; i++) {
    const u = -hu + 24 + (i * (hu * 2 - 48)) / nU;
    if (Math.abs(u) < 26) continue;
    for (const v of [-hv + 24, hv - 24]) {
      const p = f.pt(u, 0, v);
      addCherry(c, p[0], p[2], 0.9 + c.rnd() * 0.25);
    }
  }
  for (let i = 1; i < nV; i++) {
    const v = -hv + 24 + (i * (hv * 2 - 48)) / nV;
    if (Math.abs(v) < 26) continue;
    for (const u of [-hu + 24, hu - 24]) {
      const p = f.pt(u, 0, v);
      addCherry(c, p[0], p[2], 0.9 + c.rnd() * 0.25);
    }
  }
  // inner trees in larger parks
  if (hu > 120 && hv > 60) {
    for (const [u, v] of [[-hu * 0.5, hv * 0.45], [hu * 0.5, -hv * 0.45], [-hu * 0.5, -hv * 0.45], [hu * 0.5, hv * 0.45]] as [number, number][]) {
      const p = f.pt(u, 0, v);
      addCherry(c, p[0], p[2], 1.1);
    }
  }
  // benches along the paths
  for (const [u, v, dir] of [[pw + 7, hv * 0.45, 1], [-pw - 7, -hv * 0.45, -1], [hu * 0.45, pw + 7, 1], [-hu * 0.45, -pw - 7, -1]] as [number, number, number][]) {
    if (Math.abs(u) > hu - 10 || Math.abs(v) > hv - 10) continue;
    const wood = hex(0x8a5f3a);
    if (Math.abs(u) < pw + 10) {
      f.box(b, u - 3, u + 3, 5, 7, v - 11, v + 11, wood);
      f.box(b, u + dir * 2, u + dir * 3.6, 7, 15, v - 11, v + 11, wood);
      f.box(b, u - 2, u + 2, 0, 5, v - 9, v - 7, hex(0x444444));
      f.box(b, u - 2, u + 2, 0, 5, v + 7, v + 9, hex(0x444444));
    } else {
      f.box(b, u - 11, u + 11, 5, 7, v - 3, v + 3, wood);
      f.box(b, u - 11, u + 11, 7, 15, v + dir * 2, v + dir * 3.6, wood);
      f.box(b, u - 9, u - 7, 0, 5, v - 2, v + 2, hex(0x444444));
      f.box(b, u + 7, u + 9, 0, 5, v - 2, v + 2, hex(0x444444));
    }
  }
  // name board on two posts, facing the street
  const sw = 64;
  const bv = hv - 10;
  f.box(b, -sw / 2 - 3, -sw / 2 + 1, 0, 24, bv - 1, bv + 1, hex(0x6b4a2f));
  f.box(b, sw / 2 - 1, sw / 2 + 3, 0, 24, bv - 1, bv + 1, hex(0x6b4a2f));
  f.box(b, -sw / 2, sw / 2, 10, 10 + sw / 4 + 2, bv - 1.2, bv + 1.2, hex(0x3c3c44));
  signOnFace(c, f, lot.label, 0, 11, sw - 2, (sw - 2) / 4, bv + 1.4, 1);
  signOnFace(c, f, lot.label, 0, 11, sw - 2, (sw - 2) / 4, bv - 1.4, -1);

  // little extras
  if (lot.id === 'n-park') {
    // a hexagonal pavilion (azumaya)
    const p = f.pt(0, 0, 0);
    const y0 = heightAt(p[0], p[2]);
    b.cylinder(p[0], p[2], y0, y0 + 2.5, 30, 30, 6, hex(0xd6cdb8));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      b.cylinder(p[0] + Math.cos(a) * 24, p[2] + Math.sin(a) * 24, y0 + 2.5, y0 + 40, 1.8, 1.8, 5, hex(0x7a5538), false);
    }
    b.cylinder(p[0], p[2], y0 + 38, y0 + 56, 36, 0, 6, hex(0x4b5058));
    b.cylinder(p[0], p[2], y0 + 55, y0 + 60, 3, 0, 5, hex(0xc9a24a));
    b.cylinder(p[0], p[2], y0 + 2.5, y0 + 3, 20, 20, 6, hex(0x8a5f3a));
  } else if (lot.id === 'e-park' || lot.id === 'e-park2') {
    // a swing set and a slide
    const col = hex(0xd9453a);
    f.box(b, -hu * 0.45 - 20, -hu * 0.45 - 17, 0, 30, -hv * 0.2 - 1, -hv * 0.2 + 1, col);
    f.box(b, -hu * 0.45 + 17, -hu * 0.45 + 20, 0, 30, -hv * 0.2 - 1, -hv * 0.2 + 1, col);
    f.box(b, -hu * 0.45 - 20, -hu * 0.45 + 20, 29, 31.5, -hv * 0.2 - 1, -hv * 0.2 + 1, col);
    f.box(b, -hu * 0.45 - 12, -hu * 0.45 - 6, 8, 9, -hv * 0.2 - 3, -hv * 0.2 + 3, hex(0x2f2f2f));
    f.box(b, -hu * 0.45 + 6, -hu * 0.45 + 12, 8, 9, -hv * 0.2 - 3, -hv * 0.2 + 3, hex(0x2f2f2f));
    const su = hu * 0.35;
    const sv = hv * 0.25;
    f.box(b, su - 7, su + 7, 0, 22, sv - 7, sv + 7, hex(0x3d86d8));
    b.quad(f.pt(su - 5, 21, sv + 7), f.pt(su + 5, 21, sv + 7), f.pt(su + 5, 2, sv + 36), f.pt(su - 5, 2, sv + 36), hex(0xf2c23a), f.dir(0, 1, 1));
  }
}
