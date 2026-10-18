import { SURF } from '../surface';
import { detailedBlock } from './block';
import type { MeshBatch } from './batch';
import type { Ctx } from './ctx';
import type { Frame } from './frame';
import { Kit, nobori } from './kit';
import { HeightPass, SHOP_HEIGHT_SCALE } from './height-pass';
import { parapet, roofSign, rooftopStuff, signOnFace, windowOn } from './parts';
import type { Lot } from './layout';
import { hex, makeRng, shade, type Rect } from './util';

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
  美容室: { wall: 0xfbe9f0, awning: [0xf2a6c4, 0xffffff], sign: 0xf2a6c4 },
  薬局: { wall: 0xf4f8f4, awning: [0x1f9a58, 0xffffff], sign: 0xffffff },
  居酒屋: { wall: 0xe8d6bc, tile: true, sign: 0x3a1c14 },
  八百屋: { wall: 0xeaf3dc, awning: [0x3f9a3f, 0xffe066], sign: 0x3f9a3f },
  クリーニング: { wall: 0xe8f1fa, awning: [0x2f7fd0, 0xffffff], sign: 0x2f7fd0 },
  理容室: { wall: 0xf4f4f0, awning: [0xc8281e, 0x2f5fb0], sign: 0xffffff },
  焼肉: { wall: 0xdcd2c8, awning: [0x2a2a2e, 0xc8281e], sign: 0x1c1c22 },
  パン屋: { wall: 0xf8ecd0, awning: [0xc8863a, 0xffffff], sign: 0xf4d9a8 },
  医院: { wall: 0xf4f8fb, awning: [0x3aa6d8, 0xffffff], sign: 0xffffff },
  歯科: { wall: 0xeef8f6, awning: [0x4cc4b8, 0xffffff], sign: 0xe6f6f4 },
  学習塾: { wall: 0xe8eaf4, awning: [0x2f3f8a, 0xffd24a], sign: 0x2f3f8a },
  酒屋: { wall: 0xe6d6d0, tile: true, sign: 0x5a2a3a },
  定食屋: { wall: 0xf0dcc0, tile: true, sign: 0x8a5a2f },
};

/** What can be seen through the glass: the shelf picture on the back wall, its colour, and whether there is a counter. */
const INSIDE: Record<string, { shelf: string; wall: number; counter?: boolean }> = {
  レストラン: { shelf: 'in:bottles', wall: 0xf0d9b0, counter: true },
  カフェ: { shelf: 'in:bottles', wall: 0xf0dcb8, counter: true },
  コンビニ: { shelf: 'in:snacks', wall: 0xeef3f6 },
  花屋: { shelf: 'in:flowers', wall: 0xf6eef0 },
  本屋: { shelf: 'in:books', wall: 0xf1ead8 },
  ラーメン: { shelf: 'in:bottles', wall: 0xedd3a8, counter: true },
  カラオケ: { shelf: 'in:plain', wall: 0x7a5a9a },
  洋服屋: { shelf: 'in:clothes', wall: 0xf3f0f4 },
  和菓子屋: { shelf: 'in:wagashi', wall: 0xeed7a8 },
  すし: { shelf: 'in:bottles', wall: 0xe8d4ac, counter: true },
  スーパー: { shelf: 'in:goods', wall: 0xf4f2ea },
  ごはん屋: { shelf: 'in:bottles', wall: 0xedd6ae, counter: true },
  美容室: { shelf: 'in:plain', wall: 0xf9e9f0 },
  薬局: { shelf: 'in:goods', wall: 0xf3f8f4 },
  居酒屋: { shelf: 'in:bottles', wall: 0xdcc096, counter: true },
  八百屋: { shelf: 'in:goods', wall: 0xeef2de },
  クリーニング: { shelf: 'in:plain', wall: 0xe9f1f8 },
  理容室: { shelf: 'in:plain', wall: 0xf4f4ee },
  焼肉: { shelf: 'in:bottles', wall: 0xcfc2b2, counter: true },
  パン屋: { shelf: 'in:bread', wall: 0xf6e6c4 },
  医院: { shelf: 'in:plain', wall: 0xf1f6f9 },
  歯科: { shelf: 'in:plain', wall: 0xeaf6f4 },
  学習塾: { shelf: 'in:plain', wall: 0xe8ebf6 },
  酒屋: { shelf: 'in:bottles', wall: 0xe4d2c8 },
  定食屋: { shelf: 'in:bottles', wall: 0xf0dec2, counter: true },
};

/** Shops that put a chalkboard out, and the banners (のぼり) a shop may stand in front of its door. */
const FOOD = new Set(['レストラン', 'カフェ', 'ラーメン', 'すし', 'ごはん屋', '居酒屋', '焼肉', 'パン屋', '定食屋']);
const BANNERS = ['n:営業中', 'n:新発売', 'n:セール', 'n:お弁当', 'n:餃子'];

function awning(b: MeshBatch, f: Frame, hu: number, hv: number, y: number, out: number, cols: [number, number]): void {
  const w = hu * 2 - 14;
  const n = Math.max(2, Math.round(w / 17));
  const sw = w / n;
  const c0 = hex(cols[0]);
  const c1 = hex(cols[1] === 0xffffff ? 0xefe8d8 : cols[1]);
  for (let i = 0; i < n; i++) {
    const u0 = -w / 2 + i * sw;
    const u1 = u0 + sw;
    const col = i % 2 ? c1 : c0;
    for (let j = 0; j < 3; j++) {
      const t0 = j / 3, t1 = (j + 1) / 3;
      const ya = y - 3.2 * t0 - .7 * Math.sin(t0 * Math.PI), yb = y - 3.2 * t1 - .7 * Math.sin(t1 * Math.PI);
      const va = hv + .5 + (out - .5) * t0, vb = hv + .5 + (out - .5) * t1;
      b.quad(f.pt(u0, ya, va), f.pt(u1, ya, va), f.pt(u1, yb, vb), f.pt(u0, yb, vb), col, f.dir(0, 1, (ya - yb) / (vb - va)));
    }
    b.quad(f.pt(u0, y - 3.2, hv + out), f.pt(u1, y - 3.2, hv + out), f.pt(u1, y - 5.2, hv + out), f.pt(u0, y - 5.2, hv + out), col, f.dir(0, 0, 1));
    // underside (darker)
    b.quad(f.pt(u0, y - 2.8, hv + 0.5), f.pt(u0, y - 3.2, hv + out), f.pt(u1, y - 3.2, hv + out), f.pt(u1, y - 2.8, hv + 0.5), shade(col, 0.7), f.dir(0, -1, 0));
  }
}

/**
 * An ordinary shop: a recessed glass front (end piers, fascia, bulkhead, step) over a shallow painted room that can
 * be seen through the transparent glass, an awning or tiled canopy, signboards and, depending on the shop, a hanging
 * sign, a banner, a chalkboard and a potted plant out front.
 */
export function addShop(c: Ctx, lot: Lot, rect: Rect, f: Frame, hu: number, hv: number): void {
  const k = new Kit(c, f);
  const height = new HeightPass(c);
  const b = k.m;
  const st = STYLES[lot.label] ?? { wall: 0xeee6d8, awning: [0x4477aa, 0xffffff] as [number, number], sign: 0x3b4a5a };
  const ins = INSIDE[lot.label] ?? { shelf: 'in:goods', wall: 0xf1ead8 };
  const wall = hex(st.wall);
  const fl = lot.floors;
  const gfH = 42;
  const upH = 35;
  const gfTop = 3.5 + gfH;
  const H = gfTop + (fl - 1) * upH;
  // the decoration choices come from a small stream seeded with one draw of the town's generator
  const r = makeRng(Math.floor(c.rnd() * 4294967296));
  const rBlade = r();
  const rSide = r();
  const rNob = r();
  const rNobKey = r();
  const rFrame = r();
  const rPlant = r();
  const rFloor = r();
  const rOpen = r();
  const rPoster = r();
  const rPosterKey = r();
  const rPosterSide = r();
  const side = rSide < 0.5 ? -1 : 1;
  const pitched = fl === 2 && (st.tile || lot.label === 'ラーメン') && r() < .65;

  const rec = 4.5; // the glass line is set back from the facade
  const pw = 7; // end piers
  const fh = 8; // fascia over the glass
  const sillH = 8;
  const vg = hv - rec;
  const doorU = (hu > 60 ? 1 : 0) * hu * 0.35 * (lot.id.length % 2 ? 1 : -1);
  const frame = st.tile ? hex(0x4a3426) : hex(0x5d6068);
  const sillCol = st.tile ? hex(0x4b3a30) : shade(wall, 0.78);

  // ---- body: plinth, closed upper storeys or roof slab, hollow ground floor behind the glass -----------------------
  f.box(b, -hu - 0.6, hu + 0.6, 0, 3.5, -hv - 0.6, hv + 0.6, hex(0x9c9a94));
  const plasterUpper = ['酒屋', '居酒屋', 'すし', 'ラーメン', '定食屋', 'ごはん屋'].includes(lot.label);
  if (fl > 1) detailedBlock(c, f, -hu, hu, -hv, hv, gfTop, fl - 1, upH, wall, plasterUpper ? SURF.plain : st.tile ? SURF.tile : SURF.siding);
  else f.box(b, -hu, hu, gfTop - 3, gfTop, -hv, hv, wall);
  for (let i = 1; i < fl; i++) {
    const y = gfTop + (i - 1) * upH;
    f.box(b, -hu - 0.7, hu + 0.7, y - 1, y + 1.5, -hv - 0.7, hv + 0.7, shade(wall, 0.88)); // storey belt
  }
  const skin = shade(wall, 0.94);
  k.fa(-hu, hu, 3.5, gfTop, -hv, -1, skin);
  k.sd(-hv, hv, 3.5, gfTop, -hu, -1, skin);
  k.sd(-hv, hv, 3.5, gfTop, hu, 1, skin);
  const x0 = -hu + pw;
  const x1 = hu - pw;
  const yb = 3.5 + sillH;
  const yt = gfTop - fh;
  k.wall(-hu, hu, 3.5, gfTop, vg - 1, hv, wall, [[x0, x1, 3.5, yt]]); // end piers and the fascia over the glass

  // ---- glass line: windows, door ----------------------------------------------------------------------------------
  const seg = (a: number, z: number): void => {
    if (z - a < 12) return;
    k.box(a, z, 3.5, yb, vg - 2.5, vg + 1.6, sillCol);
    k.pane(a, z, yb, yt, vg);
    k.fa(a, z, yb, yb + 1.4, vg + 0.25, 1, frame);
    k.fa(a, z, yt - 1.4, yt, vg + 0.25, 1, frame);
    const n = Math.floor((z - a) / 46);
    for (let i = 1; i <= n; i++) {
      const u = a + ((z - a) * i) / (n + 1);
      k.fa(u - 0.8, u + 0.8, yb, yt, vg + 0.3, 1, frame);
    }
    k.box(a, a + 1.4, yb, yt, vg - 1.2, vg + 1.2, frame);
    k.box(z - 1.4, z, yb, yt, vg - 1.2, vg + 1.2, frame);
  };
  seg(x0, doorU - 11);
  seg(doorU + 11, x1);
  k.pane(doorU - 9, doorU + 9, 4.5, yt, vg);
  k.box(doorU - 10.4, doorU - 9, 3.5, yt, vg - 1.4, vg + 1.4, frame);
  k.box(doorU + 9, doorU + 10.4, 3.5, yt, vg - 1.4, vg + 1.4, frame);
  k.box(doorU - 0.6, doorU + 0.6, 4.5, yt, vg - 1, vg + 1, frame);
  k.fa(doorU - 9, doorU + 9, 4.5, 8, vg + 0.3, 1, frame);
  k.box(doorU + 2, doorU + 3, 17, 27, vg + 0.4, vg + 1.6, hex(0xc8ccd2)); // handle
  k.box(doorU - 12, doorU + 12, 0, 1.8, hv, hv + 5, hex(0xb9b5ab)); // step
  if (rOpen < 0.6) k.tf(k.uv('OPEN'), doorU - 3.6, doorU + 3.6, 19, 22.6, vg + 0.4, 1); // a small OPEN board on the door glass
  if (rPoster < 0.4) {
    const keys = FOOD.has(lot.label) ? ['p:coffee', 'p:oden', 'p:new'] : ['p:sale', 'p:new', 'p:onigiri'];
    let pu = (rPosterSide < 0.5 ? -1 : 1) * x1 * 0.5;
    if (Math.abs(pu - doorU) < 20) pu = -pu;
    if (Math.abs(pu) < x1 - 10) k.tf(k.uv(keys[Math.floor(rPosterKey * keys.length)]!), pu - 3.8, pu + 3.8, 13, 23.2, vg + 0.35, 1); // a sticker on the window
  }

  // ---- the room behind the glass (painted, self-lit) ---------------------------------------------------------------
  const rb = vg - 30;
  const ceil = gfTop - 3;
  const wallIn = hex(ins.wall);
  const floorIn = rFloor < 0.5 ? hex(0xcfc4b0) : hex(0xb08a62);
  k.ihz(-x1, x1, rb, vg - 0.6, 3.6, true, floorIn);
  k.ihz(-x1, x1, rb, vg - 0.6, ceil, false, hex(0xf3ece0));
  k.ifa(-x1, x1, 3.6, ceil, rb, 1, wallIn);
  k.isd(rb, vg - 0.6, 3.6, ceil, -x1, 1, shade(wallIn, 0.94));
  k.isd(rb, vg - 0.6, 3.6, ceil, x1, -1, shade(wallIn, 0.94));
  const nSh = Math.max(1, Math.round((2 * x1) / 120));
  for (let i = 0; i < nSh; i++) {
    const a = -x1 + (2 * x1 * i) / nSh;
    const z = -x1 + (2 * x1 * (i + 1)) / nSh;
    k.tf(k.uv(ins.shelf), a + 2, z - 2, 8, ceil - 7, rb + 0.1, 1);
    if (ins.shelf !== 'in:plain') {
      const shelfWood = ins.counter ? hex(0x76624a) : hex(0xc0bdab);
      for (const y of [8, (8 + ceil - 7) / 2, ceil - 7]) k.ibox(a + 1.5, z - 1.5, y - .55, y, rb + .2, rb + 3, shelfWood, 'TFLR');
      for (const u of [a + 1.5, z - 1.5]) k.ibox(u - .35, u + .35, 7.5, ceil - 7, rb + .2, rb + 2.6, shade(shelfWood, .8), 'TFLR');
    }
  }
  const nl = Math.max(1, Math.round((2 * x1) / 48));
  for (let i = 0; i < nl; i++) {
    const u = -x1 + ((i + 0.5) * 2 * x1) / nl;
    k.ihz(u - 8, u + 8, rb + 6, rb + 11, ceil - 0.1, false, [1.7, 1.7, 1.6]);
  }
  if (ins.counter) {
    const cu0 = -x1 * 0.75;
    const cu1 = x1 * 0.45;
    k.ibox(cu0, cu1, 3.6, 12.5, rb + 8, rb + 17, hex(0x6a4630));
    k.ibox(cu0 - 0.6, cu1 + 0.6, 12.5, 13.4, rb + 7.4, rb + 17.6, hex(0xf2e8d4), 'TFKLR');
    for (let i = 0; i < 3; i++) {
      const u = cu0 + ((cu1 - cu0) * (i + 0.5)) / 3;
      k.ibox(u - 2.2, u + 2.2, 3.6, 8.8, rb + 21, rb + 25, hex(0xb8322a));
    }
  } else {
    k.ibox(-x1 * 0.4, x1 * 0.4, 3.6, 10, rb + 9, rb + 18, hex(0xe9e2d4));
    k.ibox(-x1 * 0.4, x1 * 0.4, 10, 11, rb + 9, rb + 18, hex(0xf2c24a), 'T');
  }

  // ---- fronts: awning, tile canopy and noren, colour bands ----------------------------------------------------------
  if (st.awning) awning(b, f, hu, hv, gfTop - 4.5, 17, st.awning);
  if (st.tile) {
    const tile = hex(0x4b5058);
    const y = gfTop - 3.5;
    b.quad(f.pt(-hu + 4, y + 5, hv + 0.5), f.pt(hu - 4, y + 5, hv + 0.5), f.pt(hu - 4, y - 3, hv + 20), f.pt(-hu + 4, y - 3, hv + 20), tile, f.dir(0, 1, 0.7));
    b.quad(f.pt(-hu + 4, y - 3, hv + 20), f.pt(hu - 4, y - 3, hv + 20), f.pt(hu - 4, y - 8, hv + 20), f.pt(-hu + 4, y - 8, hv + 20), hex(0x6a4b3b), f.dir(0, 0, 1));
    // noren curtain over the door
    const nc = [hex(0x2f4a8a), hex(0xf2f2f2), hex(0x2f4a8a)];
    for (let i = 0; i < 3; i++) {
      f.facade(b, doorU - 11 + i * 7.5, doorU - 4.5 + i * 7.5, 22, 36, hv + 1.6, 1, nc[i]!);
    }
  }
  if (st.band) {
    f.facade(b, -hu, hu, gfTop - 7.5, gfTop - 3.5, hv + 0.8, 1, hex(st.band[0]));
    f.facade(b, -hu, hu, gfTop - 9.5, gfTop - 7.5, hv + 0.8, 1, hex(st.band[1]));
  }

  // ground-floor side windows
  const nsw = Math.max(1, Math.floor((hv * 2 - 20) / 50));
  for (let kk = 0; kk < nsw; kk++) {
    const v = -hv + ((kk + 0.5) * 2 * hv) / nsw;
    windowOn(b, f, hu, hv, 'l', v, 14, 22, 18);
    windowOn(b, f, hu, hv, 'r', v, 14, 22, 18);
  }
  // roof
  if (pitched) {
    const rise = Math.min(22, hv * .45), drop = Math.min(3, rise * .15), roof = hex(0x4c585d), trim = hex(0x514d48);
    f.gable(b, -hu, hu, -hv, hv, H, rise, 'u', 3, roof, wall);
    for (const v of [-hv - 3, hv + 2.4]) f.box(b, -hu - 3, hu + 3, H - drop - .7, H - drop, v, v + .6, trim);
    for (const u of [-hu - 3, hu + 2.4]) f.box(b, u, u + .6, H - drop - .7, H - drop, -hv - 3, hv + 3, trim);
    f.box(b, -hu - 3, hu + 3, H + rise - .2, H + rise + .8, -.75, .75, roof);
  } else parapet(b, f, hu, hv, H, 6, shade(wall, .9));
  rooftopStuff(c, f, hu, hv, H, 3, !pitched);
  // A narrow fascia occupies the spandrel below the upper windows (which start at gfTop+8).
  // Its 8:1 atlas cell keeps Japanese lettering at a natural height without stretching it.
  const ws = Math.min(hu * 2 - 24, 56), sh = ws / 8;
  k.box(-ws / 2 - .45, ws / 2 + .45, gfTop + .4, gfTop + sh + .9, hv + .2, hv + .8, hex(0x55534e));
  k.tf(k.uv(`fascia:${lot.label}`), -ws / 2, ws / 2, gfTop + .65, gfTop + sh + .65, hv + .85, 1);
  const sw = Math.min(hu * 2 - 24, 76);
  if (!pitched) roofSign(c, f, lot.label, 0, H + 5, sw, sw / 4, hv - 8, hex(st.sign === 0xffffff ? 0xdde3ea : st.sign));

  // ---- in front: hanging sign, banner, chalkboard, plant ------------------------------------------------------------
  const bladeKey = `v:${lot.label}`;
  if (rBlade < 0.5 && hu > 44 && c.atlas.has(bladeKey)) {
    const u = side * (hu - 3.6);
    const v0 = hv + 1.6;
    const v1 = hv + 8.1;
    k.box(u - 1.1, u + 1.1, 19.5, 46.5, v0 - 0.4, v1 + 0.4, hex(0x3d3a38));
    k.ts(k.uv(bladeKey), v0, v1, 20, 46, u + 1.2, 1);
    k.ts(k.uv(bladeKey), v0, v1, 20, 46, u - 1.2, -1);
  }
  if (rNob < 0.32 && hu > 44) {
    const key = lot.label === 'ラーメン' ? 'n:ラーメン' : lot.label === '焼肉' || lot.label === 'ごはん屋' ? 'n:餃子' : BANNERS[Math.floor(rNobKey * BANNERS.length)]!;
    nobori(k, -side * (hu - 8), hv + 9, key, 30);
  }
  if (rFrame < 0.4 && FOOD.has(lot.label)) {
    const au = doorU + side * 17;
    const av = hv + 9;
    k.tq(k.uv('chalk:cafe'), [au + 4, 0, av + 3], [au - 4, 0, av + 3], [au - 4, 11, av + 0.6], [au + 4, 11, av + 0.6], [0, 3, 6]);
    k.quad([au - 4, 0, av - 3], [au + 4, 0, av - 3], [au + 4, 11, av - 0.6], [au - 4, 11, av - 0.6], hex(0x8c5c36), [0, 3, -6]);
  }
  if (st.tile) {
    // a paper lantern by the door, hung from the canopy
    const lu = doorU + side * 15;
    const lv = hv + 3.4;
    k.box(lu - 0.2, lu + 0.2, 37.5, 46, lv - 0.2, lv + 0.2, hex(0x2b2420));
    k.cyl(lu, lv, 29.5, 37.5, 3.1, 3.1, 8, [1.1, 0.34, 0.24]);
  }
  if (rPlant < 0.42) {
    const pu = doorU - side * 15;
    k.cyl(pu, hv + 3.6, 0, 5.4, 2.8, 3.5, 7, hex(0xc0683f));
    k.blob(pu, 9, hv + 3.6, 3.6, 3.3, 3.6, hex(0x5ea94d), 0.12, pu);
  }
  height.applyAbove(3.5, SHOP_HEIGHT_SCALE, gfTop);
  c.obstacles.push(rect);
}

/** Hotel: taller, with windows all round and a drive-in canopy. */
export function addHotel(c: Ctx, lot: Lot, rect: Rect, f: Frame, hu: number, hv: number): void {
  const b = c.main.at(f.cx, f.cz);
  const wall = hex(0xe9dcc4);
  const floorH = 36;
  const H = 4 + lot.floors * floorH;
  f.box(b, -hu, hu, 0, 4, -hv, hv, hex(0x9c9a94));
  detailedBlock(c, f, -hu, hu, -hv, hv, 4, lot.floors, floorH, wall, SURF.panel);
  for (let i = 1; i < lot.floors; i++) f.box(b, -hu - 0.6, hu + 0.6, 4 + i * floorH - 2, 4 + i * floorH, -hv - 0.6, hv + 0.6, hex(0xc2b08a));

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

/** Labels used for small infill shops (all must exist in the sign atlas). */
export const SMALL_SHOPS: readonly string[] = ['美容室', '薬局', '居酒屋', '八百屋', 'クリーニング', '理容室', '焼肉', 'パン屋', '医院', '歯科', '学習塾', '酒屋', '定食屋', 'カフェ', 'ラーメン', '花屋'];
