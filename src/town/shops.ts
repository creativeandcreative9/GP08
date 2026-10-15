import type { MeshBatch } from './batch';
import type { Ctx } from './ctx';
import type { Frame } from './frame';
import { GLASS, GLASS_DARK, parapet, roofSign, rooftopStuff, signOnFace, windowGrid, windowOn } from './parts';
import type { Lot } from './layout';
import { hex, shade, type Rect } from './util';

interface ShopStyle {
  wall: number;
  awning?: [number, number];
  tile?: boolean;
  band?: [number, number];
  sign: number;
}

const STYLES: Record<string, ShopStyle> = {
  レストラン: { wall: 0xf3e3c8, awning: [0xc0392b, 0xffffff], sign: 0x8c1f2b },
  カフェ: { wall: 0xf6e8d8, awning: [0x2e8b7a, 0xffffff], sign: 0x5b3a29 },
  コンビニ: { wall: 0xf4f6f8, band: [0x1b7fd0, 0x2fae5a], sign: 0xffffff },
  ホテル: { wall: 0xe9dcc4, sign: 0x14284b },
  花屋: { wall: 0xfbe3ea, awning: [0xe86a92, 0xffffff], sign: 0xe8628e },
  本屋: { wall: 0xe5efe0, awning: [0x3b7d5a, 0xffffff], sign: 0x2f6f4a },
  ラーメン: { wall: 0xf0d9b8, awning: [0xcc2b1f, 0xffffff], sign: 0xc8281e },
  カラオケ: { wall: 0xe6dcf0, awning: [0x7a3fb5, 0xffd000], sign: 0x4a1f7a },
  洋服屋: { wall: 0xf0f0f4, awning: [0x2a2a2e, 0xdddddd], sign: 0x1c1c22 },
  和菓子屋: { wall: 0xf0e2c8, tile: true, sign: 0xf4ead2 },
  すし: { wall: 0xeadfcd, tile: true, sign: 0x1d3a73 },
  スーパー: { wall: 0xfdf5e0, awning: [0xf08a1c, 0xffffff], sign: 0xf08a1c },
  ごはん屋: { wall: 0xf3e0c2, tile: true, sign: 0x7a4a28 },
};

function awning(b: MeshBatch, f: Frame, hu: number, hv: number, y: number, out: number, cols: [number, number]): void {
  const w = hu * 2 - 14;
  const n = Math.max(2, Math.round(w / 17));
  const sw = w / n;
  const c0 = hex(cols[0]);
  const c1 = hex(cols[1]);
  for (let i = 0; i < n; i++) {
    const u0 = -w / 2 + i * sw;
    const u1 = u0 + sw;
    const col = i % 2 ? c1 : c0;
    b.quad(f.pt(u0, y, hv + 0.5), f.pt(u1, y, hv + 0.5), f.pt(u1, y - 8, hv + out), f.pt(u0, y - 8, hv + out), col, f.dir(0, 1, 0.6));
    b.quad(f.pt(u0, y - 8, hv + out), f.pt(u1, y - 8, hv + out), f.pt(u1, y - 14.5, hv + out), f.pt(u0, y - 14.5, hv + out), col, f.dir(0, 0, 1));
    // underside (darker)
    b.quad(f.pt(u0, y - 7, hv + 0.5), f.pt(u0, y - 8, hv + out), f.pt(u1, y - 8, hv + out), f.pt(u1, y - 7, hv + 0.5), shade(col, 0.7), f.dir(0, -1, 0));
  }
}

function shopfront(b: MeshBatch, f: Frame, hu: number, hv: number, doorU: number, h: number): void {
  const frame = hex(0x5d6068);
  const glass = hex(0xa8d6ee);
  const x0 = -hu + 9;
  const x1 = hu - 9;
  // window segments either side of the door
  const seg = (a: number, z: number): void => {
    if (z - a < 14) return;
    f.facade(b, a, z, 6, h, hv + 0.5, 1, frame);
    f.facade(b, a + 1.5, z - 1.5, 7.5, h - 1.5, hv + 0.9, 1, glass);
    const n = Math.floor((z - a) / 46);
    for (let i = 1; i <= n; i++) {
      const u = a + ((z - a) * i) / (n + 1);
      f.facade(b, u - 0.9, u + 0.9, 7, h - 1, hv + 1.1, 1, frame);
    }
  };
  seg(x0, doorU - 11);
  seg(doorU + 11, x1);
  // door
  f.facade(b, doorU - 10, doorU + 10, 3.5, h + 1, hv + 0.5, 1, frame);
  f.facade(b, doorU - 8, doorU + 8, 4.5, h - 1, hv + 0.9, 1, hex(0xc4e6f6));
  f.facade(b, doorU - 0.6, doorU + 0.6, 4.5, h - 1, hv + 1.2, 1, frame);
}

export function addShop(c: Ctx, lot: Lot, rect: Rect, f: Frame, hu: number, hv: number): void {
  const b = c.main.at(f.cx, f.cz);
  const st = STYLES[lot.label] ?? { wall: 0xeee6d8, awning: [0x4477aa, 0xffffff] as [number, number], sign: 0x3b4a5a };
  const wall = hex(st.wall);
  const fl = lot.floors;
  const gfH = 42;
  const upH = 35;
  const H = 3.5 + gfH + (fl - 1) * upH;
  f.box(b, -hu - 0.6, hu + 0.6, 0, 3.5, -hv - 0.6, hv + 0.6, hex(0x9c9a94));
  f.box(b, -hu, hu, 3.5, H, -hv, hv, wall);
  // storey belt
  for (let i = 1; i < fl; i++) {
    const y = 3.5 + gfH + (i - 1) * upH;
    f.box(b, -hu - 0.7, hu + 0.7, y - 1, y + 1.5, -hv - 0.7, hv + 0.7, shade(wall, 0.88));
  }
  const doorU = (hu > 60 ? 1 : 0) * hu * 0.35 * (lot.id.length % 2 ? 1 : -1);
  shopfront(b, f, hu, hv, doorU, 35);
  if (st.awning) awning(b, f, hu, hv, 41, 17, st.awning);
  if (st.tile) {
    const tile = hex(0x4b5058);
    const y = 42;
    b.quad(f.pt(-hu + 4, y + 5, hv + 0.5), f.pt(hu - 4, y + 5, hv + 0.5), f.pt(hu - 4, y - 3, hv + 20), f.pt(-hu + 4, y - 3, hv + 20), tile, f.dir(0, 1, 0.7));
    b.quad(f.pt(-hu + 4, y - 3, hv + 20), f.pt(hu - 4, y - 3, hv + 20), f.pt(hu - 4, y - 8, hv + 20), f.pt(-hu + 4, y - 8, hv + 20), hex(0x6a4b3b), f.dir(0, 0, 1));
    // noren curtain over the door
    const nc = [hex(0x2f4a8a), hex(0xf2f2f2), hex(0x2f4a8a)];
    for (let i = 0; i < 3; i++) {
      f.facade(b, doorU - 11 + i * 7.5, doorU - 4.5 + i * 7.5, 22, 36, hv + 1.6, 1, nc[i]!);
    }
  }
  if (st.band) {
    f.facade(b, -hu, hu, 38, 42, hv + 0.8, 1, hex(st.band[0]));
    f.facade(b, -hu, hu, 36, 38, hv + 0.8, 1, hex(st.band[1]));
  }
  // upper floors: windows on front, back and sides
  for (let i = 1; i < fl; i++) {
    const y = 3.5 + gfH + (i - 1) * upH + 8;
    const sp = 40;
    const nf = Math.max(1, Math.floor((hu * 2 - 20) / sp));
    for (let k = 0; k < nf; k++) {
      const u = -hu + ((k + 0.5) * 2 * hu) / nf;
      if (fl >= 2 && i === 1 && Math.abs(u) < 60 && st.awning !== undefined && fl >= 2) continue; // wall sign sits here
      windowOn(b, f, hu, hv, 'f', u, y, 20, 20, i % 2 ? GLASS : GLASS_DARK);
      windowOn(b, f, hu, hv, 'b', u, y, 20, 20);
    }
    const ns = Math.max(1, Math.floor((hv * 2 - 20) / sp));
    for (let k = 0; k < ns; k++) {
      const v = -hv + ((k + 0.5) * 2 * hv) / ns;
      windowOn(b, f, hu, hv, 'l', v, y, 18, 20);
      windowOn(b, f, hu, hv, 'r', v, y, 18, 20);
    }
  }
  // ground-floor side windows
  const ns = Math.max(1, Math.floor((hv * 2 - 20) / 50));
  for (let k = 0; k < ns; k++) {
    const v = -hv + ((k + 0.5) * 2 * hv) / ns;
    windowOn(b, f, hu, hv, 'l', v, 14, 22, 18);
    windowOn(b, f, hu, hv, 'r', v, 14, 22, 18);
  }
  // roof
  parapet(b, f, hu, hv, H, 6, shade(wall, 0.9));
  rooftopStuff(c, f, hu, hv, H, 3);
  // signboards: on the wall (2+ floors) and standing on the roof
  const sw = Math.min(hu * 2 - 24, 190);
  if (fl >= 2) {
    const ws = Math.min(hu * 2 - 30, 132);
    signOnFace(c, f, lot.label, 0, 3.5 + gfH + 2, ws, ws / 4, hv + 0.9, 1);
    f.box(b, -ws / 2 - 1.5, ws / 2 + 1.5, 3.5 + gfH + 0.8, 3.5 + gfH + 4 + ws / 4, hv, hv + 0.7, hex(0x3c3c44));
  }
  roofSign(c, f, lot.label, 0, H + 8, sw, sw / 4, hv - 8, hex(st.sign === 0xffffff ? 0xdde3ea : st.sign));
  c.obstacles.push(rect);
}

/** Hotel: taller, with windows all round and a drive-in canopy. */
export function addHotel(c: Ctx, lot: Lot, rect: Rect, f: Frame, hu: number, hv: number): void {
  const b = c.main.at(f.cx, f.cz);
  const wall = hex(0xe9dcc4);
  const floorH = 36;
  const H = 4 + lot.floors * floorH;
  f.box(b, -hu, hu, 0, 4, -hv, hv, hex(0x9c9a94));
  f.box(b, -hu, hu, 4, H, -hv, hv, wall);
  for (let i = 1; i < lot.floors; i++) f.box(b, -hu - 0.6, hu + 0.6, 4 + i * floorH - 2, 4 + i * floorH, -hv - 0.6, hv + 0.6, hex(0xc2b08a));
  windowGrid(b, f, hu, hv, 4, floorH, lot.floors, { w: 18, h: 20, spacing: 34, skipFront: (fl) => fl === 0 });
  // entrance
  f.facade(b, -22, 22, 4, 32, hv + 0.7, 1, hex(0x4a5a6a));
  f.facade(b, -20, 20, 5, 30, hv + 1.0, 1, hex(0xbfe0f0));
  f.box(b, -44, 44, 38, 42, hv, hv + 26, hex(0x14284b));
  f.box(b, -42, -40, 4, 38, hv + 22, hv + 24, hex(0xd8c58a));
  f.box(b, 40, 42, 4, 38, hv + 22, hv + 24, hex(0xd8c58a));
  parapet(b, f, hu, hv, H, 6, hex(0xc2b08a));
  rooftopStuff(c, f, hu, hv, H, 4);
  const sw = Math.min(hu * 2 - 20, 200);
  roofSign(c, f, lot.label, 0, H + 8, sw, sw / 4, hv - 10, hex(0x14284b));
  signOnFace(c, f, lot.label, 0, 46, 92, 23, hv + 0.8, 1);
  c.obstacles.push(rect);
}
