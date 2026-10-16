import type { Ctx } from './ctx';
import { DEC1_Y, DEC2_Y } from './ctx';
import { Frame } from './frame';
import { addCherry, addRoundTree } from './trees';
import { GREEN_LEAF } from './parts';
import { buildApartment } from './apartment';
import { HB, Wall, drift, houseRng, tone, type Face, type Rng } from './housekit';
import {
  CURTAINS, SASH_FRAMES, acUnit, antenna, balcony, bicycle, blockWall, carColour, downpipe, entrance, gateLeaves,
  gatePillar, heaterTank, hedge, meterBox, pot, sashWindow, shrub, shutterBox, smallCar, type WinOpts,
} from './housedetail';
import { KAWARA, SLATE, buildRoof } from './roofs';
import { clamp, hex, mix, pick, type RGB, type Rect } from './util';

const WALLS: RGB[] = [0xf7eddc, 0xf4dcd2, 0xdbe8f1, 0xe0ecd5, 0xf8f0c8, 0xe8e6e0, 0xf6dbbb, 0xeadff2].map(hex);
const DOORS: RGB[] = [0x8a5a3a, 0x3f5f8a, 0x2f6f55, 0x9a3f3f].map(hex);
const WALL_GREY = hex(0xd9d6cd);
const FOUNDATION = hex(0xb9b6ae);
const APT_WALLS: RGB[] = [0xf2e9d8, 0xe9e1d0, 0xdde6ea, 0xf0dcd0].map(hex);
const APT_BANDS: RGB[] = [0xc9b9a0, 0xa7b8c5, 0xd2a89a].map(hex);
/** Share of the houses with old grey kawara; the others have coloured slate. */
const KAWARA_SHARE = 0.38;
const FLOOR_H = 35;
/** Top of the concrete foundation (the floor level of the ground storey). */
const FB = 3;

interface HousePlan {
  c: Ctx;
  f: Frame;
  hu: number;
  hv: number;
  floors: number;
  /** A named-lot or main-street house: more detail than the infill houses. */
  rich: boolean;
  /** Draws already taken from the shared generator, in [0, 1): wall colour, roof colour, door colour. */
  wallPick: number;
  roofPick: number;
  doorPick: number;
  ridgeU: boolean;
  doorSide: -1 | 1;
  /** Balcony decision of the shared stream (rich houses) or undefined (decided locally). */
  balcony?: boolean;
  rnd: Rng;
}

/** Builds one detached house in the frame `f` (walls, roof, openings, entrance, fence and the odds and ends). */
function buildHouse(p: HousePlan): { doorU: number } {
  const { c, f, hu, hv, floors, rich, rnd } = p;
  const b = c.main.at(f.cx, f.cz);
  const h = new HB(b, f);
  const R = (lo: number, hi: number): number => lo + (hi - lo) * rnd();
  const wl: Record<Face, Wall> = { f: new Wall(h, 'f', hu, hv), b: new Wall(h, 'b', hu, hv), l: new Wall(h, 'l', hu, hv), r: new Wall(h, 'r', hu, hv) };

  // ---- style of this house ----
  const wallBase = WALLS[Math.floor(p.wallPick * WALLS.length) % WALLS.length]!;
  const wall1 = drift(wallBase, rnd, 0.07);
  let wall2 = wall1;
  if (floors >= 2 && rnd() < 0.34) wall2 = rnd() < 0.5 ? drift(mix(wallBase, hex(0x7a5a44), 0.5), rnd, 0.06) : drift(pick(WALLS, rnd), rnd, 0.05);
  const found = drift(FOUNDATION, rnd, 0.1);
  const kawara = p.roofPick < KAWARA_SHARE;
  const roofCol = drift(
    kawara
      ? KAWARA[Math.floor((p.roofPick / KAWARA_SHARE) * KAWARA.length) % KAWARA.length]!
      : SLATE[Math.floor(((p.roofPick - KAWARA_SHARE) / (1 - KAWARA_SHARE)) * SLATE.length) % SLATE.length]!,
    rnd,
    0.05,
  );
  const trim = kawara
    ? pick([hex(0x4e4540), hex(0x4a4d54), hex(0xeeeae0), hex(0x6b5d50)], rnd)
    : pick([hex(0xf0ede6), hex(0xf0ede6), hex(0xd8d4ca), hex(0x6b5d50), tone(roofCol, 0.8)], rnd);
  const frame = pick(SASH_FRAMES, rnd);
  const siding = rnd() < 0.55;
  const hip = rnd() < (rich ? 0.38 : 0.28);
  const doorCol = drift(DOORS[Math.floor(p.doorPick * DOORS.length) % DOORS.length]!, rnd, 0.06);

  // ---- layout of the front ----
  const doorU = p.doorSide * hu * (rich ? 0.45 : 0.4);
  const winG = -doorU;
  const yE = FB + floors * FLOOR_H;
  const garage = floors >= 2 && hu >= 44 && rnd() < (rich ? 0.3 : 0.1);
  const g0 = winG - 14;
  const g1 = winG + 14;
  const gTop = 24;
  const hasBalcony = floors >= 2 && (p.balcony ?? rnd() < 0.42);
  // a little roof over the ground storey (下屋) on some two-storey houses that have no balcony
  const hisashi = floors >= 2 && !hasBalcony && rnd() < 0.4;

  // ---- walls ----
  for (const fc of ['f', 'b', 'l', 'r'] as const) {
    const w = wl[fc];
    const half = w.half;
    const cut = fc === 'f' && garage;
    if (cut) {
      w.q(-half, g0, -4, FB, 0, tone(found, 0.86), found);
      w.q(g1, half, -4, FB, 0, tone(found, 0.86), found);
    } else {
      w.q(-half, half, -4, FB, 0, tone(found, 0.86), found);
    }
    const merged = !rich && fc !== 'f' && floors >= 2 && wall2 === wall1;
    for (let fl = 0; fl < (merged ? 1 : floors); fl++) {
      const y0 = FB + fl * FLOOR_H;
      const y1 = merged ? yE : y0 + FLOOR_H;
      const col = fl === 0 ? wall1 : wall2;
      const lo = fl === 0 ? 0.88 : 0.98;
      const hi = fl === 0 ? 1.0 : 0.95;
      if (!siding && fl === 0 && !cut && (rich || fc === 'f')) {
        // plain walls get a darker skirt (腰壁)
        w.qm(-half, half, y0, y0 + 11, 0, tone(col, 0.82), tone(col, 0.9), rnd);
        w.qm(-half, half, y0 + 11, y1, 0, tone(col, 0.97), tone(col, 1), rnd);
        continue;
      }
      const bands = siding && (rich || fc === 'f') ? (rich ? 4 : 3) : 1;
      for (let k = 0; k < bands; k++) {
        const t0 = k / bands;
        const t1 = (k + 1) / bands;
        // boards of siding: each is lit at its lower edge and in the shadow of the board above at its upper edge
        const sk = bands > 1 ? 0.93 : 1;
        const cb = tone(col, lo + (hi - lo) * t0);
        const ct = tone(col, (lo + (hi - lo) * t1) * sk);
        const ya = y0 + (y1 - y0) * t0;
        const yb = y0 + (y1 - y0) * t1;
        if (cut && fl === 0) {
          w.qm(-half, g0, ya, yb, 0, cb, ct, rnd);
          w.qm(g1, half, ya, yb, 0, cb, ct, rnd);
          if (yb > gTop) w.qm(g0, g1, Math.max(ya, gTop), yb, 0, cb, ct, rnd);
        } else {
          w.qm(-half, half, ya, yb, 0, cb, ct, rnd);
        }
      }
    }
    // a belt course between the storeys
    if (floors >= 2 && fc !== 'b' && !(hisashi && fc === 'f')) {
      const ya = FB + FLOOR_H - 1.2;
      w.q(-half - 0.3, half + 0.3, ya, ya + 2.2, 0.35, tone(wall2, 0.9), tone(wall2, 1.03));
    }
  }

  if (rich) {
    // corner boards on sided walls and the vents in the foundation
    if (siding) {
      const ct = tone(wall1, 1.07);
      for (const fc of ['f', 'b', 'l', 'r'] as const) {
        const w = wl[fc];
        w.q(-w.half, -w.half + 1.6, FB, yE, 0.3, tone(ct, 0.9), ct);
        w.q(w.half - 1.6, w.half, FB, yE, 0.3, tone(ct, 0.9), ct);
      }
    }
    for (const fc of ['f', 'b'] as const) {
      const w = wl[fc];
      for (const k of [-0.55, 0, 0.55]) if (!(fc === 'f' && garage)) w.q(k * hu - 3, k * hu + 3, 0.4, 2, 0.15, hex(0x4a4a4e));
    }
  }
  // ---- roof ----
  const ridge = p.ridgeU ? 'u' : 'v';
  const across = hip ? Math.min(hu, hv) : ridge === 'u' ? hv : hu;
  const eaveF = rich ? 7.5 : 6.5;
  const eaveB = rich ? 7 : 4.5;
  const pitch = R(0.4, 0.5);
  const slope = (across + eaveF) * Math.hypot(1, pitch);
  const nF = hip ? clamp(Math.round(slope / (rich ? 11 : 14)), 3, 5) : clamp(Math.round(slope / (rich ? 6.4 : 10.5)), rich ? 4 : 4, 9);
  const nB = rich ? Math.max(3, nF - 1) : Math.max(3, nF - 2);
  const geo = buildRoof(
    h,
    {
      form: hip ? 'hip' : 'gable', ridge, yE, hu, hv, eaveF, eaveB, verge: rich ? 4.5 : 3.5, pitch, col: roofCol, trim, soffit: hex(0xe6e0d2),
      gableWall: wall2, nF, nB, rich, vergeFront: true,
    },
    rnd,
  );
  if (!hip && ridge === 'v' && geo.yR - yE > 12 && rnd() < 0.6) {
    // a louvred vent in the gable that faces the street
    const vy = yE + (geo.yR - yE) * 0.3;
    wl.f.q(-3.6, 3.6, vy, vy + 6, 0.3, tone(trim, 0.9), tone(trim, 1.05));
    wl.f.q(-2.6, 2.6, vy + 1, vy + 5, 0.6, hex(0x555049), hex(0x6e685e));
  }
  if (!hip && rnd() < 0.13) {
    // solar panels on the front (or a side) plane
    const side: 1 | -1 = ridge === 'u' || rnd() < 0.5 ? 1 : -1;
    const hA = ridge === 'u' ? hu : hv;
    const a0 = -hA * 0.55;
    const a1 = hA * 0.55;
    const t0 = 0.22;
    const t1 = 0.78;
    const frameC = hex(0xb4bcc6);
    const cellA = hex(0x27344f);
    const cellB = hex(0x34476b);
    h.quadL(geo.at(side, a0 - 1, t0 - 0.03, 0.5), geo.at(side, a1 + 1, t0 - 0.03, 0.5), geo.at(side, a1 + 1, t1 + 0.03, 0.5), geo.at(side, a0 - 1, t1 + 0.03, 0.5), frameC, frameC, frameC, frameC, [0, 1, 0]);
    h.quadL(geo.at(side, a0, t0, 0.8), geo.at(side, a1, t0, 0.8), geo.at(side, a1, t1, 0.8), geo.at(side, a0, t1, 0.8), cellA, cellA, cellB, cellB, [0, 1, 0]);
  }
  if (rnd() < (rich ? 0.3 : 0.2)) {
    const a = (rnd() < 0.5 ? -1 : 1) * R(0.3, 0.7) * (geo.alongU ? hu : hv);
    if (geo.alongU) antenna(h, a, geo.yTop - 0.4, 0);
    else antenna(h, 0, geo.yTop - 0.4, a);
  }

  if (hisashi) {
    const y = FB + FLOOR_H;
    const d = 8.5;
    const lo = tone(roofCol, 1.1);
    const hi = tone(roofCol, 0.82);
    wl.f.wq([-hu - 1.5, y + 3.4, 0], [hu + 1.5, y + 3.4, 0], [hu + 1.5, y - 0.4, d], [-hu - 1.5, y - 0.4, d], hi, hi, lo, lo, [0, 1, 0]);
    wl.f.q(-hu - 1.5, hu + 1.5, y - 2.8, y - 0.4, d, tone(trim, 0.86), trim);
    wl.f.wq([-hu - 1.5, y - 2.8, 0], [hu + 1.5, y - 2.8, 0], [hu + 1.5, y - 2.8, d], [-hu - 1.5, y - 2.8, d], hex(0xdcd6c8), hex(0xdcd6c8), hex(0xe6e0d2), hex(0xe6e0d2), [0, -1, 0]);
  }
  // ---- entrance ----
  const wf = wl.f;
  entrance(wf, doorU, FB, { door: doorCol, trim: rnd() < 0.5 ? hex(0xf2f0ea) : tone(doorCol, 0.7), canopy: tone(trim, 1.05), posts: rich, plate: rich, handle: rich });

  // ---- windows ----
  const win = (w: Wall, pos: number, y: number, ww: number, hh: number, o: WinOpts & { plain?: boolean; hood?: boolean } = {}): void => {
    const opts: WinOpts = { panes: ww >= 14 ? 2 : 1, ...o };
    if (o.hood) w.box(pos - ww / 2 - 0.8, pos + ww / 2 + 0.8, y + hh + 0.5, y + hh + 3.5, (o.off ?? 0), (o.off ?? 0) + 2.4, tone(wall1, 0.9), 'od');
    if (!opts.curtain && !o.plain && rnd() < 0.4) {
      opts.curtain = pick(CURTAINS, rnd);
      opts.curtainSide = rnd() < 0.35 ? 0 : rnd() < 0.5 ? -1 : 1;
    }
    sashWindow(w, pos, y, ww, hh, frame, opts);
  };
  const sill = tone(wall1, 0.88);
  if (garage) garageBay(h, hv, g0, g1, gTop, rnd);
  else if (rich && rnd() < 0.35) {
    // a bay window (出窓) on the ground floor
    const bd = 5.5;
    wf.box(winG - 13, winG + 13, FB + 7, FB + 27, 0, bd, tone(wall1, 0.97), 'oazt', { lo: tone(wall1, 0.9), top: tone(roofCol, 1.1) });
    win(wf, winG, FB + 10, 22, 15, { off: bd, panes: 2 });
  } else win(wf, winG, FB + 10, 20, 15, { sill, sillFront: rich });
  // wide houses get a small extra window in the middle of the front
  if (hu >= 52 && !garage && rnd() < 0.5) win(wf, 0, FB + 13, 9, 11, { panes: 1, plain: true });
  for (let fl = 1; fl < floors; fl++) {
    const y0 = FB + fl * FLOOR_H;
    if (fl === 1 && hasBalcony) {
      balcony(
        wf, winG, y0, 38, 9.5,
        {
          rail: pick([hex(0xe9ecef), hex(0xd5dbe2), hex(0xf4f0e6), hex(0xc8d0d8)], rnd), slab: pick([hex(0xe6e2d8), hex(0xd9dde0), hex(0xf0ece2), tone(wall1, 1.02)], rnd), frame,
          laundry: rnd() < 0.55, futon: rnd() < 0.3, ac: rnd() < 0.4, curtain: rnd() < 0.4 ? pick(CURTAINS, rnd) : undefined,
        },
        rnd,
      );
      win(wf, doorU * 1.1, y0 + 10, 18, 15, { sill, sillFront: rich });
    } else {
      if (hu >= 52 && rnd() < 0.5) win(wf, 0, y0 + 13, 9, 11, { panes: 1, plain: true });
      const hood = !kawara && rnd() < 0.35;
      win(wf, winG, y0 + 10, 20, 15, { sill, sillFront: rich, hood });
      win(wf, doorU * 1.1, y0 + 10, 18, 15, { sill, sillFront: rich, hood });
      if (kawara && rnd() < (rich ? 0.5 : 0.3)) shutterBox(wf, winG + 10.5, y0 + 10, 15, 1, tone(wall2, 0.86));
    }
  }
  // sides and back
  for (const fc of ['l', 'r', 'b'] as const) {
    const w = wl[fc];
    const len = w.half * 2;
    const n = rich ? Math.max(1, Math.floor((len - 20) / 42)) : 1;
    for (let fl = 0; fl < floors; fl++) {
      const y0 = FB + fl * FLOOR_H;
      for (let i = 0; i < n; i++) {
        const pos = n === 1 ? (rnd() - 0.5) * len * 0.35 : -len / 2 + ((i + 0.5) * len) / n;
        const yy = y0 + 10 + (rnd() < 0.2 ? 4 : 0);
        if (rich) win(w, pos, yy, 16, 14, { panes: 2, sill });
        else win(w, pos, yy, 14, 14, { panes: 1, plain: true });
        if (rich && kawara && rnd() < 0.35) shutterBox(w, pos + 8, y0 + 10, 14, 1, tone(wall1, 0.88));
      }
    }
  }
  if (rich) {
    // a high small window (bathroom) on a side
    const w = wl[rnd() < 0.5 ? 'l' : 'r'];
    sashWindow(w, w.half * 0.62, FB + 20, 8, 7, frame, { panes: 1 });
  }

  // ---- services: pipes, air conditioner, meter ----
  const pipe = pick([hex(0xcbc8c0), hex(0x8a7a6a), hex(0xf0eee8)], rnd);
  const yPipe = yE - eaveF * pitch - 2.4;
  if (rnd() < 0.8) downpipe(wf, (rnd() < 0.5 ? -1 : 1) * (hu - 1.3), yPipe, pipe);
  if (rnd() < (rich ? 0.9 : 0.5)) downpipe(wl.b, (rnd() < 0.5 ? -1 : 1) * (hu - 1.3), yPipe, pipe);
  if (rnd() < (rich ? 0.8 : 0.5)) {
    const w = wl[rnd() < 0.5 ? 'l' : 'r'];
    acUnit(w, (rnd() < 0.5 ? -1 : 1) * w.half * R(0.45, 0.72), 0, rnd);
  }
  if (rnd() < (rich ? 0.3 : 0.12)) {
    const w = wl[rnd() < 0.5 ? 'l' : 'r'];
    heaterTank(w, (rnd() < 0.5 ? -1 : 1) * w.half * R(0.78, 0.9));
  }
  if (rnd() < (rich ? 0.7 : 0.35)) meterBox(wl[rnd() < 0.5 ? 'l' : 'r'], hv * R(0.35, 0.65), FB + 12);

  // ---- front yard: fence, gate, garden ----
  const v0 = hv + 8.6;
  const v1 = v0 + 2.4;
  const gapA = doorU - 12.5;
  const gapB = doorU + 12.5;
  const pillarSide: -1 | 1 = rnd() < 0.5 ? -1 : 1;
  const fenceKind = rnd();
  const wooden = kawara && fenceKind < 0.2;
  const wallCol = wooden ? drift(hex(0x7a5a42), rnd, 0.1) : drift(WALL_GREY, rnd, 0.06);
  const left = -hu - 5;
  const right = hu + 5;
  const greens = [hex(0x4f8f3c), hex(0x5a9a45), hex(0x4a8a3a), hex(0x66a64c)];
  if (fenceKind < 0.5) {
    const lattice = !wooden && rnd() < 0.45;
    blockWall(h, left, gapA, v0, v1, { wall: wallCol, coping: tone(wallCol, 1.06), height: 12, lattice, rnd }, pillarSide < 0 ? 0 : 1);
    blockWall(h, gapB, right, v0, v1, { wall: wallCol, coping: tone(wallCol, 1.06), height: 12, lattice, rnd }, pillarSide < 0 ? -1 : 0);
  } else if (fenceKind < 0.78) {
    const g = pick(greens, rnd);
    const opt = { base: g, top: tone(g, 1.25), height: R(9, 11.5), flowers: rnd() < 0.3 ? pick([hex(0xf49ab8), hex(0xf8f0f0), hex(0xee7aa4), hex(0xf8d0dc)], rnd) : undefined };
    hedge(h, left, gapA, v0 - 0.5, v1 + 1.5, opt, pillarSide < 0 ? 0 : 1, rnd);
    hedge(h, gapB, right, v0 - 0.5, v1 + 1.5, opt, pillarSide < 0 ? -1 : 0, rnd);
  } else if (fenceKind < 0.92) {
    blockWall(h, left, gapA, v0, v1, { wall: wallCol, coping: tone(wallCol, 1.06), height: 6, rnd }, pillarSide < 0 ? 0 : 1);
    blockWall(h, gapB, right, v0, v1, { wall: wallCol, coping: tone(wallCol, 1.06), height: 6, rnd }, pillarSide < 0 ? -1 : 0);
    shrub(h, left + 10, v0 - 2, 4, pick(greens, rnd), rnd);
  }
  const pu = pillarSide < 0 ? gapA + 3.2 : gapB - 3.2;
  gatePillar(h, pu, v0, v1, pick([hex(0xd8cdb8), hex(0xbfb6a6), hex(0x9a7a5a), hex(0xe6e0d4)], rnd), pick([hex(0xc23b32), hex(0xb8bcc2), hex(0x3a5a8c)], rnd), true);
  if (rnd() < 0.5) {
    const col = pick([hex(0x3a3d44), hex(0x6a5a4a), hex(0xb8bcc2)], rnd);
    gateLeaves(h, pillarSide < 0 ? pu + 3.2 : gapA, pillarSide < 0 ? gapB : pu - 3.2, v0 + 0.5, col, 10.5);
  }
  // ground: path from the door to the gate, a strip along the house, and the apron in front of a garage
  new HB(c.dec2, f).flat(doorU - 6, doorU + 6, hv + 7, hv + 13.5, DEC2_Y, hex(0xd0ccc2));
  const beds = rnd();
  if (beds < 0.4) new HB(c.dec1, f).flat(-hu, hu, hv, hv + 7.5, DEC1_Y, hex(0xcdc5b0));
  else if (beds < 0.75) new HB(c.dec1, f).flat(-hu, hu, hv, hv + 7.5, DEC1_Y, hex(0x86bd62));
  if (garage) new HB(c.dec2, f).flat(g0, g1, hv, hv + 14, DEC2_Y, hex(0xc9c6bd));
  if (rnd() < (rich ? 0.6 : 0.3)) pot(h, doorU + (rnd() < 0.5 ? -1 : 1) * 9.5, hv + 5, pick([hex(0xb8643c), hex(0x8a8f96), hex(0x6a4a34)], rnd), pick(greens, rnd), rnd);
  if (rnd() < (rich ? 0.25 : 0.12)) {
    const bu = (doorU > 0 ? -1 : 1) * R(hu * 0.25, hu * 0.7);
    bicycle(h, bu, hv + 3.2, pick([hex(0xc9d3dd), hex(0x4a78c9), hex(0xc94a4a), hex(0x3c3c3c), hex(0x7aa86a)], rnd));
  }
  if (rich) {
    for (let i = 0; i < 3; i++) {
      const u = (rnd() * 2 - 1) * (hu - 10);
      if (Math.abs(u - doorU) < 16) continue;
      shrub(h, u, hv + 4.2, 3.4 + rnd() * 1.6, pick(greens, rnd), rnd);
    }
  }
  return { doorU };
}

/** Open garage under the upper floor: the opening's reveals, a dark interior and a small car parked inside. */
function garageBay(h: HB, hv: number, g0: number, g1: number, top: number, rnd: Rng): void {
  const depth = Math.min(44, hv * 2 - 8);
  const vb = hv - depth;
  const dark = hex(0x4a4c52);
  const y0 = 0.5;
  // interior: back wall, side walls, ceiling, floor
  h.wallV(g0, g1, y0, top, vb, 1, tone(dark, 0.8), dark);
  h.wallU(vb, hv, y0, top, g0, 1, tone(dark, 0.9), dark);
  h.wallU(vb, hv, y0, top, g1, -1, tone(dark, 0.9), dark);
  h.flat(g0, g1, vb, hv, top, tone(dark, 1.1), false);
  h.flat(g0, g1, vb, hv + 6, y0, hex(0x8a8880), true);
  smallCar(h, (g0 + g1) / 2, y0, hv - 2.5, carColour(rnd), rnd);
  // shutter box above the opening
  h.wallV(g0 - 0.5, g1 + 0.5, top - 0.5, top + 2, hv + 0.5, 1, hex(0xc8c5bd));
}

/** A detached two-storey house on a footprint rectangle, with a block wall, door, windows and garden. */
export function addHouse(c: Ctx, rect: Rect, f: Frame, hu: number, hv: number, floors: number): void {
  const r = c.rnd;
  // The draws from the shared generator keep their original order and number, so the rest of the town is laid out as
  // before; everything new comes from the house's own generator, seeded from them.
  const wallPick = r();
  const roofPick = r();
  const dRidge = r();
  const dChimney = r();
  const dDoorSide = r();
  const dDoorCol = r();
  const dBalcony = floors >= 2 ? r() : 1;
  const ridgeU = (hu >= hv) !== (dRidge < 0.25);
  const doorSide: -1 | 1 = dDoorSide < 0.5 ? -1 : 1;
  const rnd = houseRng([wallPick, roofPick, dRidge, dChimney, dDoorSide, dDoorCol, dBalcony], f.cx, f.cz);
  const { doorU } = buildHouse({ c, f, hu, hv, floors, rich: true, wallPick, roofPick, doorPick: dDoorCol, ridgeU, doorSide, balcony: floors >= 2 && dBalcony < 0.7, rnd });

  // garden: a bush at the front corner and sometimes a tree
  const bp = f.pt(-doorU, 0, hv + 5);
  c.main.at(f.cx, f.cz).blob(bp[0], 5, bp[2], 9, 6, 7, GREEN_LEAF, 0.12, bp[0]);
  const t = r();
  const tp = f.pt((r() < 0.5 ? -1 : 1) * (hu - 6), 0, -hv + 8);
  if (t < 0.3) addCherry(c, tp[0], tp[2], 0.75 + r() * 0.2);
  else if (t < 0.55) addRoundTree(c, tp[0], tp[2], 0.6 + r() * 0.2);
  c.obstacles.push(rect);
}

/** Multi-storey apartment block (アパート / マンション / タワーマンション). */
export function addApartment(c: Ctx, rect: Rect, f: Frame, hu: number, hv: number, floors: number, label: string): void {
  const r = c.rnd;
  const tower = floors >= 12;
  // same draws, in the same order, as the original (the rooftop equipment takes the rest in buildApartment)
  const dWall = tower ? 0 : r();
  const dBand = tower ? 0 : r();
  const wallCol = tower ? hex(0xe4e8ee) : APT_WALLS[Math.floor(dWall * APT_WALLS.length) % APT_WALLS.length]!;
  const bandCol = tower ? hex(0x7f95b5) : APT_BANDS[Math.floor(dBand * APT_BANDS.length) % APT_BANDS.length]!;
  const rnd = houseRng([dWall, dBand, floors], f.cx, f.cz);
  buildApartment({ c, f, hu, hv, floors, label, tower, wallCol, bandCol, rnd });
  c.obstacles.push(rect);
}

/** A cheaper house for dense infill (the same builder as {@link addHouse}, with fewer details). */
export function addHouseLite(c: Ctx, rect: Rect, f: Frame, hu: number, hv: number, floors: number): void {
  const r = c.rnd;
  const wallPick = r();
  const roofPick = r();
  const dRidge = r();
  const dDoorSide = r();
  const dDoorCol = r();
  const t = r();
  const dTreeSide = r();
  const ridgeU = (hu >= hv) !== (dRidge < 0.2);
  const doorSide: -1 | 1 = dDoorSide < 0.5 ? -1 : 1;
  const rnd = houseRng([wallPick, roofPick, dRidge, dDoorSide, dDoorCol, t, dTreeSide], f.cx, f.cz);
  buildHouse({ c, f, hu, hv, floors, rich: false, wallPick, roofPick, doorPick: dDoorCol, ridgeU, doorSide, rnd });
  const tp = f.pt((dTreeSide < 0.5 ? -1 : 1) * (hu - 8), 0, hv + 5);
  if (t < 0.06) addCherry(c, tp[0], tp[2], 0.7);
  else if (t < 0.3) c.main.at(f.cx, f.cz).blob(tp[0], 6, tp[2], 8, 6, 7, GREEN_LEAF, 0.1, tp[0]);
  c.obstacles.push(rect);
}
