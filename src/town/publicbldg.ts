import { SURF } from '../surface';
import { detailedBlock } from './block';
import type { Ctx } from './ctx';
import { DEC1_Y, DEC2_Y, DEC3_Y } from './ctx';
import { Frame } from './frame';
import type { Lot } from './layout';
import { addCherry } from './trees';
import { windowOn, roofSign, signOnFace, parapet, rooftopStuff, GLASS } from './parts';
import { hex, shade, type RGB, type Rect } from './util';

export function frameRect(f: Frame, u0: number, u1: number, v0: number, v1: number): Rect {
  const a = f.pt(u0, 0, v0);
  const b = f.pt(u1, 0, v1);
  return { minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]), minZ: Math.min(a[2], b[2]), maxZ: Math.max(a[2], b[2]) };
}

export function addBank(c: Ctx, lot: Lot, rect: Rect, f: Frame, hu: number, hv: number): void {
  const b = c.main.at(f.cx, f.cz);
  const wall = hex(0xe9e2d2);
  const floorH = 36;
  const H = 4 + lot.floors * floorH;
  const bodyV = hv - 22;
  f.box(b, -hu, hu, 0, 4, -hv, hv, hex(0xa9a69e));
  detailedBlock(c, f, -hu + 6, hu - 6, -hv, bodyV, 4, lot.floors, floorH, wall, SURF.stone, true);
  // the window grid is positioned relative to the frame centre, so shift not needed (symmetrical box)
  // portico with columns
  const pu = Math.min(hu - 16, 90);
  f.box(b, -pu, pu, 4, 8, bodyV, hv, hex(0xc9c2b0)); // steps
  f.box(b, -pu - 4, pu + 4, 8 + 52, 8 + 60, bodyV, hv, hex(0xd8d2c0)); // architrave
  for (let i = 0; i < 6; i++) {
    const u = -pu + 6 + (i * (pu * 2 - 12)) / 5;
    const p = f.pt(u, 0, hv - 6);
    b.cylinder(p[0], p[2], 8, 60, 4.5, 4.2, 8, hex(0xf2eee2));
  }
  f.gable(b, -pu - 4, pu + 4, bodyV, hv, 68, 20, 'u', 3, hex(0x8c8a84), hex(0xe9e2d2));
  f.facade(b, -12, 12, 8, 36, bodyV + 0.6, 1, hex(0x3a4a58));
  f.facade(b, -10, 10, 9, 34, bodyV + 0.9, 1, hex(0xbfe0f0));
  signOnFace(c, f, lot.label, 0, 62.5, 80, 20, hv + 0.8, 1);
  f.box(b, -41, 41, 61.5, 83.5, hv, hv + 0.7, hex(0x3c3c44));
  parapet(b, f, hu - 6, bodyV, H, 5, shade(wall, 0.9));
  rooftopStuff(c, f, hu - 6, bodyV, H, 3);
  roofSign(c, f, lot.label, 0, H + 8, 160, 40, -hv + 24, hex(0x0d4f3c));
  c.obstacles.push(rect);
}

export function addHospital(c: Ctx, lot: Lot, _rect: Rect, f: Frame, hu: number, hv: number): void {
  const b = c.main.at(f.cx, f.cz);
  const wall = hex(0xf5f7f9);
  const floorH = 36;
  const H = 4 + lot.floors * floorH;
  f.box(b, -hu, hu, 0, 4, -hv, hv, hex(0xa9a69e));
  detailedBlock(c, f, -hu, hu, -hv, hv * .55, 4, lot.floors, floorH, wall, SURF.panel);
  for (let i = 1; i < lot.floors; i++) f.box(b, -hu - 0.5, hu + 0.5, 4 + i * floorH - 4, 4 + i * floorH - 1, -hv - 0.5, hv * 0.55 + 0.5, hex(0x6cb8e0));
  // windows on the main block, built per face with the block's real depth
  // front wing (entrance block) shifted forward
  detailedBlock(c, f, -hu * .45, hu * .45, hv * .55, hv, 4, lot.floors + 2, floorH, wall, SURF.panel, true);
  // entrance + canopy
  f.facade(b, -14, 14, 4, 30, hv + 0.7, 1, hex(0x3a4a58));
  f.facade(b, -12, 12, 5, 28, hv + 1.0, 1, hex(0xbfe0f0));
  f.box(b, -40, 40, 36, 40, hv, hv + 24, hex(0xd9344a));
  f.box(b, -38, -36, 4, 36, hv + 20, hv + 22, hex(0xcfd3d9));
  f.box(b, 36, 38, 4, 36, hv + 20, hv + 22, hex(0xcfd3d9));
  // red cross on the tower
  const ty = H + 2 * floorH;
  f.box(b, -4, 4, ty - 28, ty - 8, hv + 0.2, hv + 1.2, hex(0xe03030));
  f.box(b, -14, 14, ty - 22, ty - 14, hv + 0.2, hv + 1.2, hex(0xe03030));
  f.box(b, -hu * 0.45, hu * 0.45, ty, ty + 4, hv * 0.55 - 1, hv + 1, hex(0x9fc3d8));
  parapet(b, f, hu, hv * 0.55, H, 5, hex(0xdfe5ea));
  rooftopStuff(c, f, hu, hv * 0.55, H, 4);
  // helipad on the main roof
  const hp = f.pt(-hu * 0.55, H + 0.4, -hv * 0.3);
  b.disc(hp[0], hp[2], H + 0.5, 34, 34, 24, hex(0x6c7480));
  b.box(hp[0] - 12, hp[0] - 9, H + 0.5, H + 0.9, hp[2] - 14, hp[2] + 14, hex(0xffffff));
  b.box(hp[0] + 9, hp[0] + 12, H + 0.5, H + 0.9, hp[2] - 14, hp[2] + 14, hex(0xffffff));
  b.box(hp[0] - 12, hp[0] + 12, H + 0.5, H + 0.9, hp[2] - 3, hp[2] + 3, hex(0xffffff));
  signOnFace(c, f, lot.label, 0, 44, 80, 20, hv + 24.8, 1);
  f.box(b, -41, 41, 43, 65, hv + 23.8, hv + 24.5, hex(0x3c3c44));
  roofSign(c, f, lot.label, hu * 0.6, H + 8, 130, 32.5, hv * 0.3, hex(0xd12a2a));
  c.obstacles.push(frameRect(f, -hu, hu, -hv, hv * 0.55), frameRect(f, -hu * 0.45, hu * 0.45, hv * 0.55, hv));
}

/** University / high school: a U-shaped block around a courtyard, with a clock tower and a gate. */
export function addCampus(c: Ctx, lot: Lot, _rect: Rect, f: Frame, hu: number, hv: number): void {
  const b = c.main.at(f.cx, f.cz);
  const school = lot.label === '高校';
  const wall = school ? hex(0xf0e6cc) : hex(0xcf9578);
  const trim = school ? hex(0x4a9a8f) : hex(0xeadfce);
  const floorH = 36;
  const fl = lot.floors;
  const H = 4 + fl * floorH;
  const big = hu > 200 && hv > 200;
  const bd = big ? Math.min(150, hv * 0.5) : Math.min(hv * 1.2, 180);
  const wd = big ? Math.min(140, hu * 0.3) : 0;
  const yardV0 = -hv + bd;
  const parts: { u0: number; u1: number; v0: number; v1: number }[] = [];
  parts.push({ u0: -hu, u1: hu, v0: -hv, v1: big ? -hv + bd : -hv + bd });
  if (big) {
    parts.push({ u0: -hu, u1: -hu + wd, v0: -hv + bd, v1: hv - 60 });
    parts.push({ u0: hu - wd, u1: hu, v0: -hv + bd, v1: hv - 60 });
  }
  for (const p of parts) {
    f.box(b, p.u0 - 1, p.u1 + 1, 0, 4, p.v0 - 1, p.v1 + 1, hex(0xa9a69e));
    detailedBlock(c, f, p.u0, p.u1, p.v0, p.v1, 4, fl, floorH, wall, school ? SURF.concrete : SURF.tile);
    f.box(b, p.u0 - 0.5, p.u1 + 0.5, H - 6, H, p.v0 - 0.5, p.v1 + 0.5, trim);
    for (let i = 1; i < fl; i++) f.box(b, p.u0 - 0.4, p.u1 + 0.4, 4 + i * floorH - 2, 4 + i * floorH, p.v0 - 0.4, p.v1 + 0.4, shade(wall, 0.9));
    c.obstacles.push(frameRect(f, p.u0, p.u1, p.v0, p.v1));
  }
  // central clock tower on the back bar
  const tH = H + 3 * floorH;
  const tw = 34;
  const tv = -hv + bd * 0.5 + (big ? (bd * 0.5) : 0);
  f.box(b, -tw, tw, H, tH, tv - tw, tv + tw, shade(wall, 1.03));
  f.box(b, -tw - 2, tw + 2, tH, tH + 4, tv - tw - 2, tv + tw + 2, trim);
  const roofCol = school ? hex(0x3f8a92) : hex(0x5b6b8c);
  f.gable(b, -tw - 2, tw + 2, tv - tw - 2, tv + tw + 2, tH + 4, 30, 'u', 4, roofCol, shade(wall, 1.03));
  // clock faces
  const clock = (dirn: 1 | -1, v: number): void => {
    f.facade(b, -14, 14, tH - 40, tH - 12, v + dirn * 0.6, dirn, hex(0xf4f4f0));
    f.facade(b, -1, 1, tH - 26, tH - 14, v + dirn * 1.0, dirn, hex(0x222222));
    f.facade(b, -1, 8, tH - 27, tH - 25, v + dirn * 1.0, dirn, hex(0x222222));
  };
  clock(1, tv + tw);
  clock(-1, tv - tw);
  // gate + sign at the front
  const gv = hv - 22;
  const gw = big ? hu * 0.28 : 0;
  if (big) {
    f.box(b, -hu + 40, -gw, 0, 12, gv - 2, gv + 2, hex(0xd8d2c0));
    f.box(b, gw, hu - 40, 0, 12, gv - 2, gv + 2, hex(0xd8d2c0));
    for (const u of [-gw, gw]) f.box(b, u - 6, u + 6, 0, 36, gv - 6, gv + 6, hex(0xe9e2d2));
    f.box(b, -gw - 6, gw + 6, 36, 42, gv - 5, gv + 5, hex(0xe9e2d2));
    signOnFace(c, f, lot.label, 0, 44, 96, 24, gv + 5.6, 1);
    f.box(b, -49, 49, 43, 69.5, gv + 4.6, gv + 5.3, hex(0x3c3c44));
    // courtyard: lawn / sports ground
    const cu0 = -hu + wd;
    const cu1 = hu - wd;
    const cw = (cu1 - cu0) / 2 - 8;
    const cd = (hv - 60 - yardV0) / 2 - 8;
    const ground = school ? hex(0xdcc08f) : hex(0x9bd774);
    const q = (u0: number, u1: number, v0: number, v1: number, col: RGB): void =>
      c.dec1.quad(f.pt(u0, DEC1_Y, v0), f.pt(u1, DEC1_Y, v0), f.pt(u1, DEC1_Y, v1), f.pt(u0, DEC1_Y, v1), col, [0, 1, 0]);
    const mu = (cu0 + cu1) / 2;
    const mv = (yardV0 + hv - 60) / 2;
    q(mu - cw, mu + cw, mv - cd, mv + cd, ground);
    if (school) {
      // running track outline
      const lw = 2.2;
      const ring = (rx: number, rz: number): void => {
        const nseg = 40;
        for (let i = 0; i < nseg; i++) {
          const a0 = (i / nseg) * Math.PI * 2;
          const a1 = ((i + 1) / nseg) * Math.PI * 2;
          const p0 = f.pt(mu + Math.cos(a0) * rx, DEC3_Y, mv + Math.sin(a0) * rz);
          const p1 = f.pt(mu + Math.cos(a1) * rx, DEC3_Y, mv + Math.sin(a1) * rz);
          const p2 = f.pt(mu + Math.cos(a1) * (rx - lw), DEC3_Y, mv + Math.sin(a1) * (rz - lw));
          const p3 = f.pt(mu + Math.cos(a0) * (rx - lw), DEC3_Y, mv + Math.sin(a0) * (rz - lw));
          c.dec3.quad(p0, p1, p2, p3, hex(0xffffff), [0, 1, 0]);
        }
      };
      ring(cw * 0.78, cd * 0.8);
      ring(cw * 0.78 - 14, cd * 0.8 - 14);
      c.dec2.disc(...(() => { const p = f.pt(mu, 0, mv); return [p[0], p[2]] as [number, number]; })(), DEC2_Y, cw * 0.78 - 16, cd * 0.8 - 16, 32, hex(0x8fcf6a));
    } else {
      // campus lawn with a path and cherry trees
      c.dec2.quad(f.pt(mu - 8, DEC2_Y, mv - cd), f.pt(mu + 8, DEC2_Y, mv - cd), f.pt(mu + 8, DEC2_Y, mv + cd), f.pt(mu - 8, DEC2_Y, mv + cd), hex(0xf0e6d4), [0, 1, 0]);
      for (let i = 0; i < 6; i++) {
        for (const s of [-1, 1]) {
          const p = f.pt(mu + s * (cw * 0.55), 0, mv - cd + 30 + (i * (cd * 2 - 60)) / 5);
          addCherry(c, p[0], p[2], 0.95);
        }
      }
    }
  } else {
    // small campus: sign on the front wall
    signOnFace(c, f, lot.label, 0, 46, 96, 24, -hv + bd + 0.8, 1);
    f.box(b, -49, 49, 45, 71.5, -hv + bd, -hv + bd + 0.6, hex(0x3c3c44));
  }
  parapet(b, f, hu, -hv + bd * 0.5, H, 0, wall);
  rooftopStuff(c, f, hu * 0.9, bd * 0.4, H, 3);
  roofSign(c, f, lot.label, 0, H + 8, 170, 42.5, -hv + 12, hex(school ? 0x1f5a36 : 0x1d2f6b));
}

/** Gymnasium with a low arched roof and a sports ground, for the school's second lot. */
export function addGym(c: Ctx, f: Frame, hu: number, hv: number, label: string): void {
  const b = c.main.at(f.cx, f.cz);
  const wall = hex(0xe6e2d6);
  const H = 4 + 56;
  const gu = Math.min(hu * 0.8, 150);
  const gv = Math.min(hv * 0.8, 105);
  const bv = hv - gv - 10; // gym at the front, sports ground behind
  const q = (u0: number, u1: number, v0: number, v1: number, col: RGB): void =>
    c.dec1.quad(f.pt(u0, DEC1_Y, v0), f.pt(u1, DEC1_Y, v0), f.pt(u1, DEC1_Y, v1), f.pt(u0, DEC1_Y, v1), col, [0, 1, 0]);
  q(-hu, hu, -hv, bv - gv - 12, hex(0xdcc08f));
  const gc = f.pt(0, 0, bv);
  const g2 = new Frame(gc[0], gc[2], f.fx, f.fz);
  g2.box(b, -gu, gu, 0, H, -gv, gv, wall);
  g2.gable(b, -gu, gu, -gv, gv, H, 22, 'u', 5, hex(0x6c7f9a), wall);
  const n = Math.max(2, Math.floor((gu * 2) / 40));
  for (let i = 0; i < n; i++) {
    const u = -gu + ((i + 0.5) * gu * 2) / n;
    windowOn(b, g2, gu, gv, 'f', u, 34, 22, 14, GLASS);
    windowOn(b, g2, gu, gv, 'b', u, 34, 22, 14, GLASS);
  }
  g2.facade(b, -14, 14, 4, 30, gv + 0.6, 1, hex(0x4a5a6a));
  roofSign(c, g2, label, 0, H + 26, 170, 42.5, gv - 6, hex(0x4a6f9a));
  c.obstacles.push(frameRect(g2, -gu, gu, -gv, gv));
}
