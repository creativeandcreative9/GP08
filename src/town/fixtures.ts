import type { MeshBatch } from './batch';
import type { Ctx } from './ctx';
import { Fx, annulus, cross, discFace, panel, puff, signQuad, sprite, tileUv, tube } from './shapes';
import { SIGN, STOP_TRI } from './streetsigns';
import { hex, pick, type RGB, type Rect, type V3 } from './util';

/**
 * The individual pieces of street furniture. Each builder takes the town context and a local frame whose front
 * points to where people see the piece from (the street). The vertex cost of every piece is noted: the town
 * is built from flat-shaded triangles, so vertices are the budget.
 */

const UPV: V3 = [0, 1, 0];

export const GREY = hex(0x8b9199);
export const DARK = hex(0x3a3d44);
const WHITE = hex(0xf2f1ea);
const POST_RED = hex(0xc9261f);
const REFLECT = hex(0xe03a32);
const WOOD = hex(0xa06f46);
const WOOD_DK = hex(0x7a5232);
const TIRE = hex(0x2b2c2f);
const BRICK = hex(0xb6683f);
const SOIL = hex(0x5b4332);

export const BIKE_COLS = [0xc94a4a, 0x3f78c9, 0xdcdcdc, 0x35353a, 0x4a9a68, 0xe0b040, 0x9a5bb5, 0x6fa6d8].map(hex);
const POTS = [0xb8643c, 0x8a8f96, 0x6a4a34, 0xe6e1d6, 0x3f6f9a, 0xc98a5a].map(hex);
const FOLIAGE = [0x5fa548, 0x7cb55a, 0x4f8f3c, 0x6cc060, 0x3f8a48].map(hex);
const BLOOM = [0xff9ec0, 0xffd23f, 0xe84a4a, 0xff7fa8, 0xb07de0, 0xff8a3a].map(hex);

/** Axis-aligned bounding box of an oriented local rectangle (for the collision rectangles in c.obstacles). */
export function footprint(fr: Fx, u0: number, u1: number, v0: number, v1: number): Rect {
  const cs = [fr.p(u0, 0, v0), fr.p(u1, 0, v0), fr.p(u1, 0, v1), fr.p(u0, 0, v1)];
  return {
    minX: Math.min(...cs.map((q) => q[0])),
    maxX: Math.max(...cs.map((q) => q[0])),
    minZ: Math.min(...cs.map((q) => q[2])),
    maxZ: Math.max(...cs.map((q) => q[2])),
  };
}

/**
 * Collision rectangles for an oriented local rectangle that is longer than it is deep: a row of squares (the AABB
 * of one long diagonal box would cover far more than the box itself and could block a sidewalk).
 */
export function footprints(fr: Fx, u0: number, u1: number, v0: number, v1: number): Rect[] {
  const d = v1 - v0;
  const n = Math.max(1, Math.ceil((u1 - u0) / d - 1e-6));
  const w = (u1 - u0) / n;
  const out: Rect[] = [];
  for (let i = 0; i < n; i++) out.push(footprint(fr, u0 + i * w, u0 + (i + 1) * w, v0, v1));
  return out;
}

// ---- vending machines and bins ------------------------------------------------------------------------------------

const VEND_BODY = [0xc92f2a, 0x2a63b6, 0xe9ecee, 0x2f2f36, 0xef8a1f, 0x5aa9e6, 0x2e8b57, 0xd9c8a4].map(hex);
export const VEND_W = 14;
export const VEND_D = 7;

/** A lit vending machine (自動販売機): 24 vertices, the front is a picture from the sign atlas. */
export function vendingMachine(c: Ctx, fr: Fx, variant: number): void {
  const b = c.main.at(fr.x, fr.z);
  const sb = c.signs.at(fr.x, fr.z);
  const v = variant % 8;
  const body = VEND_BODY[v]!;
  fr.box(b, -VEND_W / 2, VEND_W / 2, 0.4, 22.5, -VEND_D / 2, VEND_D / 2 - 0.05, body, { front: false, back: false });
  const uv = tileUv(c.atlas.uv(v < 4 ? SIGN.vendA : SIGN.vendB), v % 4, 4, 0.0004, 0.0003);
  signQuad(sb, fr.p(0, 11.45, VEND_D / 2), fr.d(0, 0, 1), UPV, VEND_W, 22.1, uv);
}

const BIN_COLS = [0x2f6fb5, 0xe0702a, 0x3f9a4e, 0x9a9ea6].map(hex);

/** A sorted-waste bin (分別ごみ箱): a coloured box with an opening and a label, 36 vertices. */
export function wasteBin(c: Ctx, fr: Fx, kind: number): void {
  const b = c.main.at(fr.x, fr.z);
  const col = BIN_COLS[kind % BIN_COLS.length]!;
  fr.box(b, -2.7, 2.7, 0, 9.5, -2.7, 2.7, col, { back: false, top: hex(0x56595f) });
  fr.facade(b, -1.8, 1.8, 6.2, 8.2, 2.74, 1, hex(0x1d1f23));
  fr.facade(b, -1.8, 1.8, 2.2, 4.4, 2.74, 1, WHITE);
}

// ---- bicycles ------------------------------------------------------------------------------------------------------

/**
 * A thin rod in the plane u = const of a local frame, drawn as ONE ribbon tilted 45 degrees about its axis (6
 * vertices instead of 18 for a prism): it stays visible from the side and from the front. Points are (y, v).
 */
function rod(b: MeshBatch, fr: Fx, a: readonly [number, number], d: readonly [number, number], w: number, color: RGB): void {
  const dy = d[0] - a[0];
  const dv = d[1] - a[1];
  const l = Math.hypot(dy, dv) || 1;
  const P = fr.d(0, -dv / l, dy / l); // perpendicular to the rod inside the plane
  const U = fr.d(1, 0, 0);
  const h = w * 0.35;
  const o: V3 = [(U[0] + P[0]) * h, (U[1] + P[1]) * h, (U[2] + P[2]) * h];
  const A = fr.p(0, a[0], a[1]);
  const D = fr.p(0, d[0], d[1]);
  b.quad([A[0] - o[0], A[1] - o[1], A[2] - o[2]], [D[0] - o[0], D[1] - o[1], D[2] - o[2]], [D[0] + o[0], D[1] + o[1], D[2] + o[2]], [A[0] + o[0], A[1] + o[1], A[2] + o[2]], color, [U[0], U[1], U[2]]);
}

/**
 * A parked bicycle (ママチャリ), its axis along the frame's local `v`: wheels, step-through frame, saddle, basket
 * and carrier; about 190 vertices (140 when `lite`).
 */
export function bicycle(c: Ctx, fr: Fx, color: RGB, lite = false): void {
  const b = c.main.at(fr.x, fr.z);
  const n = lite ? 6 : 8;
  for (const v of [-7, 7]) annulus(b, fr.p(0, 4.1, v), fr.d(1, 0, 0), UPV, 4.1, 3.5, n, TIRE);
  // key points as (y, v)
  const R = [4.1, -7] as const;
  const F = [4.1, 7] as const;
  const BB = [3.4, -0.8] as const;
  const S = [11.8, -3.6] as const;
  const HT = [10.8, 5.4] as const;
  const HB = [13.4, 4.6] as const;
  rod(b, fr, BB, S, 0.8, color);
  rod(b, fr, HT, BB, 1.0, color);
  rod(b, fr, R, S, 0.6, color);
  rod(b, fr, R, BB, 0.6, color);
  rod(b, fr, F, HT, 0.7, GREY);
  rod(b, fr, HT, HB, 0.6, GREY);
  // handlebar: a flat bar seen from above and from the front
  fr.floor(b, -3.4, 3.4, 4.2, 5.0, 13.4, GREY);
  fr.facade(b, -3.4, 3.4, 13.0, 13.8, 4.6, 1, GREY);
  fr.box(b, -1.2, 1.2, 11.9, 12.9, -6.4, -2.2, hex(0x2d2d30), { front: false, back: false });
  if (!lite) {
    fr.box(b, -2.4, 2.4, 11.2, 13.6, 6.4, 9.8, hex(0xb4bac2), { top: false, back: false, bottom: true });
    fr.floor(b, -2, 2, -11, -5, 8.6, hex(0x8a9099));
  }
}

// ---- plants --------------------------------------------------------------------------------------------------------

/** A potted plant (鉢植え): pot, foliage and sometimes flowers; 110-190 vertices. */
export function pottedPlant(c: Ctx, x: number, z: number, y0: number, r: () => number): void {
  const b = c.main.at(x, z);
  const h = 4.6 + r() * 3;
  const pot = pick(POTS, r);
  b.cylinder(x, z, y0, y0 + h, 3.0, 2.3, 6, pot, false);
  b.disc(x, z, y0 + h + 0.2, 2.8, 2.8, 6, SOIL);
  const leaf = pick(FOLIAGE, r);
  const k = r();
  if (k < 0.3) {
    // a tall leafy plant (観葉植物)
    b.blob(x, y0 + h + 4.2, z, 3.3, 4.6, 3.3, leaf, 0.1, x + z);
    b.blob(x + 0.5, y0 + h + 8.6, z - 0.4, 2.5, 3.2, 2.5, pick(FOLIAGE, r), 0.1, x * 2 + z);
  } else if (k < 0.72) {
    // a shrub with flowers
    b.blob(x, y0 + h + 3.4, z, 4.2, 3.4, 4.2, leaf, 0.1, x + z);
    const fl = pick(BLOOM, r);
    for (let i = 0; i < 3; i++) {
      const a = r() * Math.PI * 2;
      puff(b, x + Math.cos(a) * 2.6, y0 + h + 5.6 + r() * 1.2, z + Math.sin(a) * 2.6, 1.5, 1.3, 1.5, fl, i + x);
    }
  } else {
    b.blob(x, y0 + h + 3.6, z, 4.7, 3.8, 4.7, leaf, 0.1, x * 3 + z);
  }
}

/** A long planter box (プランター) with shrubs and flowers, 130-180 vertices. */
export function planter(c: Ctx, fr: Fx, len: number, r: () => number): void {
  const b = c.main.at(fr.x, fr.z);
  const wood = r() < 0.5;
  fr.box(b, -len / 2, len / 2, 0, 4.5, -2.8, 2.8, wood ? WOOD_DK : BRICK, { back: false, top: SOIL });
  const n = Math.max(2, Math.round(len / 7));
  const bloom = pick(BLOOM, r);
  for (let i = 0; i < n; i++) {
    const u = -len / 2 + ((i + 0.5) * len) / n;
    const q = fr.p(u, 4.5, (r() - 0.5) * 1.2);
    puff(b, q[0], q[1] + 2.2, q[2], 3.4, 2.6, 3.2, pick(FOLIAGE, r), i + fr.x);
    if (i % 2 === 0) puff(b, q[0] + 0.5, q[1] + 4.6, q[2], 2.2, 1.7, 2.2, bloom, i + fr.z);
  }
}

// ---- benches, post boxes, bollards, guard pipes --------------------------------------------------------------------

/** A park bench (ベンチ), 120 vertices. */
export function bench(c: Ctx, fr: Fx): void {
  const b = c.main.at(fr.x, fr.z);
  for (const u of [-7.6, 7.6]) fr.box(b, u - 0.6, u + 0.6, 0, 5.5, -2.3, 2.3, DARK, { bottom: false });
  fr.box(b, -9.2, 9.2, 5.5, 6.5, -2.6, 2.6, WOOD);
  fr.box(b, -9.2, 9.2, 7.4, 12.4, -2.8, -2.1, WOOD);
  fr.box(b, -9.0, -8.2, 6.5, 7.4, -2.6, -2.2, DARK, { bottom: false });
  fr.box(b, 8.2, 9.0, 6.5, 7.4, -2.6, -2.2, DARK, { bottom: false });
}

/** A red round post box (丸ポスト): body, domed top, slot and plate, 180 vertices. */
export function postBox(c: Ctx, fr: Fx): void {
  const b = c.main.at(fr.x, fr.z);
  const sb = c.signs.at(fr.x, fr.z);
  b.cylinder(fr.x, fr.z, fr.y, fr.y + 14.5, 2.9, 2.9, 8, POST_RED, false);
  // the domed hat: a lip that overhangs the body, then a rounded shoulder
  b.cylinder(fr.x, fr.z, fr.y + 14.5, fr.y + 16.4, 3.3, 3.0, 8, POST_RED, false);
  b.cylinder(fr.x, fr.z, fr.y + 16.4, fr.y + 18.2, 3.0, 1.3, 8, POST_RED, true);
  // the slot below the dome and the white plate on the front
  fr.facade(b, -1.9, 1.9, 9.6, 11, 3.0, 1, hex(0x2a1210));
  const uv = tileUv(c.atlas.uv(SIGN.misc), 2, 4, 0.0004, 0.0003);
  signQuad(sb, fr.p(0, 5.2, 2.97), fr.d(0, 0, 1), UPV, 3.6, 3.6, uv);
}

/** A bollard (車止め): white post with a red reflective band, 90 vertices. */
export function bollard(c: Ctx, x: number, z: number, y0: number): void {
  const b = c.main.at(x, z);
  b.cylinder(x, z, y0, y0 + 9.2, 1.3, 1.3, 6, WHITE, false);
  b.cylinder(x, z, y0 + 6.4, y0 + 8, 1.37, 1.37, 6, REFLECT, false);
  b.cylinder(x, z, y0 + 9.2, y0 + 10.2, 1.3, 0, 6, WHITE, false);
}

/** A white guard pipe (ガードパイプ) from (x0,z0) to (x1,z1): posts every ~28 units with two rails, ~100 vertices per bay. */
export function guardPipe(c: Ctx, x0: number, z0: number, x1: number, z1: number, y0: number): number {
  const L = Math.hypot(x1 - x0, z1 - z0);
  const bays = Math.max(1, Math.round(L / 28));
  const b = c.main.at((x0 + x1) / 2, (z0 + z1) / 2);
  for (let i = 0; i <= bays; i++) {
    const t = i / bays;
    const x = x0 + (x1 - x0) * t;
    const z = z0 + (z1 - z0) * t;
    b.cylinder(x, z, y0, y0 + 11.4, 1.0, 1.0, 6, WHITE, false);
    b.cylinder(x, z, y0 + 11.4, y0 + 11.9, 1.0, 0.6, 6, GREY, true);
    if (i < bays) {
      const t1 = (i + 1) / bays;
      const xn = x0 + (x1 - x0) * t1;
      const zn = z0 + (z1 - z0) * t1;
      tube(b, [x, y0 + 10.2, z], [xn, y0 + 10.2, zn], 0.8, 0.8, 5, WHITE);
      tube(b, [x, y0 + 6.2, z], [xn, y0 + 6.2, zn], 0.7, 0.7, 5, WHITE);
    }
  }
  return bays;
}

const BOX_GREEN = hex(0x7f8f86);
const BOX_LID = hex(0x6b7a72);

/** A ground-level utility box (地上機器): grey-green cabinet with a lid, a seam and a warning plate; ~70 vertices. */
export function utilityBox(c: Ctx, fr: Fx): void {
  const b = c.main.at(fr.x, fr.z);
  fr.box(b, -4.5, 4.5, 0, 9.6, -2.6, 2.6, BOX_GREEN, { back: false, top: false });
  fr.box(b, -4.8, 4.8, 9.6, 10.3, -2.9, 2.9, BOX_LID, { bottom: true });
  fr.facade(b, -0.15, 0.15, 0.6, 9.2, 2.64, 1, hex(0x4e5a54));
  fr.facade(b, 1.6, 3.4, 5.2, 8.0, 2.64, 1, hex(0xf2c230));
}

// ---- lamps and signs -----------------------------------------------------------------------------------------------

const LAMP_POLE = hex(0x474c52);

/**
 * A street lamp (街路灯) leaning its arm over the road, ~120 vertices (+30 with a banner, 街路灯フラッグ, which is
 * tile `banner` of the banner sheet). `fr` faces the road.
 */
export function streetLamp(c: Ctx, fr: Fx, banner = -1): void {
  const b = c.main.at(fr.x, fr.z);
  b.cylinder(fr.x, fr.z, fr.y, fr.y + 40, 1.05, 0.7, 6, LAMP_POLE, false);
  const a = fr.p(0, 40, 0);
  const m = fr.p(0, 45, 5);
  const e = fr.p(0, 45.5, 11);
  tube(b, a, m, 0.7, 0.55, 4, LAMP_POLE);
  tube(b, m, e, 0.55, 0.5, 4, LAMP_POLE);
  fr.box(b, -2.1, 2.1, 44, 45.6, 8.8, 15.4, hex(0x9aa0a6), { bottom: hex(0xfff2c4) });
  if (banner >= 0) {
    // a flag on a short arm, facing along the street so that people walking along it can read it
    const sb = c.signs.at(fr.x, fr.z);
    const uv = tileUv(c.atlas.uv(SIGN.banners), banner % 4, 4, 0.0004, 0.0003);
    fr.box(b, -0.3, 0.3, 33.3, 33.9, 0.6, 5.4, GREY, { front: false, back: false });
    for (const s of [1, -1] as const) {
      signQuad(sb, fr.p(s * 0.18, 27.6, 3.1), fr.d(s, 0, 0), UPV, 3.4, 11.4, uv);
      panel(b, fr.p(s * 0.08, 27.6, 3.1), fr.d(-s, 0, 0), UPV, 3.4, 11.4, hex(0xefe3e6));
    }
  }
}

function polyPanel(b: MeshBatch, c: V3, N: V3, U: V3, pts: readonly [number, number][], color: RGB): void {
  const R = cross(N, U);
  const w = (p: [number, number]): V3 => [c[0] + R[0] * p[0] + U[0] * p[1], c[1] + R[1] * p[0] + U[1] * p[1], c[2] + R[2] * p[0] + U[2] * p[1]];
  for (let i = 1; i + 1 < pts.length; i++) b.tri(w(pts[0]!), w(pts[i]!), w(pts[i + 1]!), color, N);
}

const SIGN_POLE = hex(0x9aa0a6);

/** Sign kinds on poles; each returns nothing and costs 100-180 vertices. */
export type RoadSign = 'stop' | 'speed' | 'crossing' | 'nostop' | 'school' | 'bike';

/**
 * A sign on a galvanised pole. `fr` is the frame at the foot of the pole, front = the direction the sign faces.
 * The pole is 6-sided; non-rectangular signs are shaped fans with the picture from the atlas on top.
 */
export function roadSign(c: Ctx, fr: Fx, kind: RoadSign, name?: number): void {
  const b = c.main.at(fr.x, fr.z);
  const sb = c.signs.at(fr.x, fr.z);
  const N = fr.d(0, 0, 1);
  const tall = kind === 'crossing' || kind === 'bike' ? 30 : 32;
  const cyStop = 26.5;
  const poleTop = kind === 'stop' ? (name !== undefined ? cyStop + 14.4 : tall + 1) : tall;
  b.cylinder(fr.x, fr.z, fr.y, fr.y + poleTop, 0.75, 0.7, 6, SIGN_POLE, false);
  const face = (y: number): V3 => fr.p(0, y, 0.95);
  const back = (y: number): V3 => fr.p(0, y, 0.72);
  if (kind === 'stop') {
    const S = 11.4; // world size of the 128-px tile
    const t = tileUv(c.atlas.uv(SIGN.road), 0, 4, 0, 0);
    const cy = cyStop;
    const pts = STOP_TRI.map(([px, py]) => [((px - 64) / 128) * S, ((64 - py) / 128) * S] as [number, number]);
    const uvs = STOP_TRI.map(([px, py]) => [t.u0 + (px / 128) * (t.u1 - t.u0), t.v1 - (py / 128) * (t.v1 - t.v0)] as [number, number]);
    sprite(sb, face(cy), N, UPV, pts, uvs);
    polyPanel(b, back(cy), [-N[0], 0, -N[2]], UPV, pts.map(([x, y]) => [-x, y] as [number, number]), SIGN_POLE);
    // street name plate above the stop sign
    if (name !== undefined) {
      const nu = tileUv(c.atlas.uv(SIGN.names), name % 2, 2, 0.0005, 0.0003);
      signQuad(sb, fr.p(0, cy + 11.8, 0.95), N, UPV, 9.6, 4.8, nu);
      panel(b, fr.p(0, cy + 11.8, 0.72), [-N[0], 0, -N[2]], UPV, 9.6, 4.8, SIGN_POLE);
    }
  } else if (kind === 'speed' || kind === 'nostop') {
    const t = tileUv(c.atlas.uv(SIGN.road), kind === 'speed' ? 1 : 3, 4, 0, 0);
    const uvc = { cu: (t.u0 + t.u1) / 2, cv: (t.v0 + t.v1) / 2, ru: ((t.u1 - t.u0) * 62) / 128, rv: ((t.v1 - t.v0) * 62) / 128 };
    discFace(sb, face(tall - 3.4), N, UPV, 4.3, 14, [1, 1, 1], uvc);
    discFace(b, back(tall - 3.4), [-N[0], 0, -N[2]], UPV, 4.3, 14, SIGN_POLE);
  } else if (kind === 'crossing') {
    const t = tileUv(c.atlas.uv(SIGN.road), 2, 4, 0.0004, 0.0003);
    signQuad(sb, face(tall - 4.2), N, UPV, 8.8, 8.8, t);
    panel(b, back(tall - 4.2), [-N[0], 0, -N[2]], UPV, 8.8, 8.8, SIGN_POLE);
    const sub = tileUv(c.atlas.uv(SIGN.misc), 3, 4, 0.0004, 0.0003);
    signQuad(sb, face(tall - 10.4), N, UPV, 9.6, 3.2, sub);
    panel(b, back(tall - 10.4), [-N[0], 0, -N[2]], UPV, 9.6, 3.2, SIGN_POLE);
  } else if (kind === 'school') {
    const t = tileUv(c.atlas.uv(SIGN.misc), 1, 4, 0, 0);
    const S = 9.6;
    const cy = tall - 3.2;
    const dm: [number, number][] = [[0, 58], [58, 0], [0, -58], [-58, 0]].map(([x, y]) => [(x! / 128) * S, (y! / 128) * S] as [number, number]);
    const uvs: [number, number][] = [[64, 6], [122, 64], [64, 122], [6, 64]].map(([px, py]) => [t.u0 + (px! / 128) * (t.u1 - t.u0), t.v1 - (py! / 128) * (t.v1 - t.v0)] as [number, number]);
    sprite(sb, face(cy), N, UPV, dm, uvs);
    polyPanel(b, back(cy), [-N[0], 0, -N[2]], UPV, dm, SIGN_POLE);
  } else {
    // bicycle parking board
    signQuad(sb, face(tall - 2), N, UPV, 11, 2.75, c.atlas.uv(SIGN.bikes));
    panel(b, back(tall - 2), [-N[0], 0, -N[2]], UPV, 11, 2.75, SIGN_POLE);
  }
}

const MIRROR_POLE = hex(0xe6791a);

/** A curve mirror (カーブミラー): orange pole with a round mirror tilted down at the road, ~190 vertices. */
export function curveMirror(c: Ctx, fr: Fx): void {
  const b = c.main.at(fr.x, fr.z);
  const sb = c.signs.at(fr.x, fr.z);
  b.cylinder(fr.x, fr.z, fr.y, fr.y + 44, 0.9, 0.8, 6, MIRROR_POLE, false);
  const tilt = 0.22;
  const N: V3 = [fr.fx * Math.cos(tilt), -Math.sin(tilt), fr.fz * Math.cos(tilt)];
  const U: V3 = [fr.fx * Math.sin(tilt), Math.cos(tilt), fr.fz * Math.sin(tilt)];
  const cen = fr.p(0, 43.5, 2.3);
  const t = tileUv(c.atlas.uv(SIGN.misc), 0, 4, 0, 0);
  const uvc = { cu: (t.u0 + t.u1) / 2, cv: (t.v0 + t.v1) / 2, ru: ((t.u1 - t.u0) * 62) / 128, rv: ((t.v1 - t.v0) * 62) / 128 };
  discFace(sb, cen, N, U, 5.4, 14, [1, 1, 1], uvc);
  discFace(b, [cen[0] - N[0] * 0.3, cen[1] - N[1] * 0.3, cen[2] - N[2] * 0.3], [-N[0], -N[1], -N[2]], U, 5.4, 14, hex(0xf2f2ee));
}
