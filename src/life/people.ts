import { MeshBatch } from '../town/batch';
import { hex, type RGB, type V3 } from '../town/util';
import { boxC, ellipsoid, mergeInto, mixRGB, roundedOctBand as octBand, plate, prism, shadeRGB, taperBox, type Oct } from './geom';

/**
 * Stylised low-poly people (about 21 units = 1.7 m for an adult). Local frame: +Z forward, +X to the person's right,
 * +Y up, origin on the ground between the feet. A walker is drawn as three templates: the body (torso, head, hair,
 * bag, optionally the arms), one leg and one arm, both hanging from their joint at the local origin so that the
 * crowd code can swing them with a single matrix each.
 */

export type Build = 'man' | 'woman' | 'child';
export type HairStyle = 'short' | 'bob' | 'long' | 'pony' | 'bun' | 'thin' | 'perm' | 'none';
export type HatKind = 'yellow' | 'flat' | 'peaked' | 'kerchief';
export type BagKind = 'brief' | 'tote' | 'shop' | 'shoulder' | 'randoseru' | 'backpack';

export interface Outfit {
  id: string;
  build: Build;
  skin: RGB;
  hair: { style: HairStyle; color: RGB };
  hat?: { kind: HatKind; color: RGB; band?: RGB };
  top: {
    color: RGB;
    /** short = to the waist, long = over the hips (jackets), smock = to the knees */
    length: 'short' | 'long' | 'smock';
    sleeves: 'long' | 'short';
    /** collar colour (sailor collar when `sailor`) */
    collar?: RGB;
    sailor?: boolean;
    /** shirt shown in a V at the neck (suits, blazers), with the tie / ribbon on it */
    shirt?: RGB;
    tie?: RGB;
    ribbon?: RGB;
    /** cuff accent */
    trim?: RGB;
  };
  bottom: { kind: 'trousers' | 'skirt' | 'longskirt' | 'shorts' | 'tight'; color: RGB; pleats?: RGB };
  /** Knee socks (skirts, shorts) */
  sock?: RGB;
  shoes: RGB;
  bag?: { kind: BagKind; color: RGB; flap?: RGB };
  /** Waist apron (cafe) */
  apron?: RGB;
  cane?: boolean;
  gloves?: RGB;
  /** Forward lean of the upper body (elderly) */
  stoop?: number;
  /** The arms hang still (and are merged into the body mesh) */
  staticArms?: boolean;
}

export interface Dims {
  legLen: number;
  hipX: number;
  hipHalf: number;
  waistHalf: number;
  chestHalf: number;
  shoulderHalf: number;
  depth: number;
  torsoLen: number;
  neckLen: number;
  neckR: number;
  headRx: number;
  headRy: number;
  headRz: number;
  armLen: number;
  armR: number;
  legR: number;
}

export const DIMS: Record<Build, Dims> = {
  man: { legLen: 10.16, hipX: 1.2, hipHalf: 2.35, waistHalf: 2.15, chestHalf: 2.5, shoulderHalf: 2.8, depth: 1.6, torsoLen: 7.35, neckLen: 0.8, neckR: 0.7, headRx: 1.23, headRy: 1.5, headRz: 1.38, armLen: 7.4, armR: 0.7, legR: 1.15 },
  woman: { legLen: 9.688, hipX: 1.2, hipHalf: 2.45, waistHalf: 1.85, chestHalf: 2.2, shoulderHalf: 2.45, depth: 1.4, torsoLen: 6.65, neckLen: 0.75, neckR: 0.65, headRx: 1.18, headRy: 1.45, headRz: 1.3, armLen: 6.9, armR: 0.65, legR: 1.1 },
  child: { legLen: 7, hipX: .9, hipHalf: 1.75, waistHalf: 1.6, chestHalf: 1.9, shoulderHalf: 2.05, depth: 1.3, torsoLen: 5.17, neckLen: .5, neckR: .55, headRx: 1.35, headRy: 1.5, headRz: 1.45, armLen: 5.5, armR: .55, legR: .85 },
};

export interface PersonParts {
  dims: Dims;
  body: MeshBatch;
  leg: MeshBatch;
  arm: MeshBatch;
  /** The right arm when it carries something (briefcase, bag, cane) */
  armHold?: MeshBatch;
  /** Joint heights and offsets: hips at (±hipX, hipY, 0), shoulders at (±shoulderX, shoulderY, 0) */
  hipY: number;
  shoulderX: number;
  shoulderY: number;
}

const DARK: RGB = [0.07, 0.06, 0.07];
const WHITE: RGB = [0.96, 0.96, 0.95];
const SHOE_H = 1.05;
const SHOULDER_DROP = 0.7;

export const SKIN_TONES: RGB[] = [hex(0xf5cfb6), hex(0xefc2a4), hex(0xe6b392), hex(0xf8d8c4)];

export interface HeadFrame {
  cy: number;
  /** forward offset of the head (stoop) */
  hz: number;
  rx: number;
  ry: number;
  rz: number;
}

/** z of the front face on the head's vertical centreline. */
function headFrontZ(h: HeadFrame, y: number): number {
  const t = Math.max(-1, Math.min(1, (y - h.cy) / h.ry));
  return h.hz + h.rz * Math.sqrt(1 - t * t);
}

function buildHead(b: MeshBatch, h: HeadFrame, skin: RGB): void {
  ellipsoid(b, 0, h.cy, h.hz, h.rx, h.ry, h.rz, skin, { seg: 12, rings: 8, phase: 0, smooth: true });
  // Small patches follow the face, including the cheeks at the side of the ellipsoid.
  // A single forward plane leaves these features visibly floating in a three-quarter view.
  const patch = (cx: number, cy: number, width: number, height: number, color: RGB, lift = .035): void => {
    const first = b.vertexCount;
    for (let row = 0; row <= 2; row++) for (let col = 0; col <= 2; col++) {
      const x = cx + (col - 1) * width, y = cy + (row - 1) * height;
      const z = h.rz * Math.sqrt(Math.max(.01, 1 - (x / h.rx) ** 2 - ((y - h.cy) / h.ry) ** 2));
      const nx = x / (h.rx * h.rx), ny = (y - h.cy) / (h.ry * h.ry), nz = z / (h.rz * h.rz), length = Math.hypot(nx, ny, nz);
      b.pos.push(x, y, h.hz + z + lift); b.nor.push(nx / length, ny / length, nz / length); b.col.push(...color, 1);
      if (b.withUV) b.uvs.push(0, 0);
    }
    b.appendSurface(9);
    for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
      const i = first + row * 3 + col; b.idx.push(i, i + 4, i + 1, i, i + 3, i + 4);
    }
  };
  const eyeY = h.cy - .04 * h.ry, ex = .42 * h.rx;
  const ew = Math.max(.14, .12 * h.rx), eh = Math.max(.15, .105 * h.ry);
  for (const sd of [-1, 1]) {
    patch(sd * ex, eyeY, ew, eh, DARK);
    patch(sd * ex - ew * .2, eyeY + eh * .35, ew * .22, eh * .2, WHITE, .06);
    patch(sd * ex, eyeY + eh + .12, ew * 1.15, .045, shadeRGB(DARK, 1.8));
    patch(sd * ex * 1.5, eyeY - eh - .25, ew * .8, .10, mixRGB(skin, [.95, .5, .5], .25));
  }
  const nz = headFrontZ(h, eyeY - 0.35 * h.ry);
  taperBox(b, eyeY - 0.5 * h.ry, eyeY - 0.12 * h.ry, { x0: -0.2, x1: 0.2, z0: nz - 0.1, z1: nz + 0.28 }, { x0: -0.1, x1: 0.1, z0: nz - 0.1, z1: nz + 0.22 }, shadeRGB(skin, 0.94));
  patch(0, eyeY - .62 * h.ry, .28, .045, mixRGB(skin, [.75, .3, .3], .6));
  for (const sd of [-1, 1]) boxC(b, sd * (h.rx + 0.05), eyeY - 0.1, h.hz - 0.1, 0.12, 0.45, 0.38, shadeRGB(skin, 0.95));
}

function buildHair(b: MeshBatch, h: HeadFrame, style: HairStyle, col: RGB, hat: boolean, shoulderY: number): void {
  if (style === 'none') return;
  const g = 0.11;
  const { cy, hz, rx, ry, rz } = h;
  const c2 = shadeRGB(col, 1.18);
  if (style !== 'thin') {
    // crown cap from the hairline over the top
    ellipsoid(b, 0, cy + .18 * ry, hz, rx + g, ry * .92, rz + g, col, { seg: 12, rings: 8, ringTo: 4, phase: 0, smooth: true });
    if (!hat) {
      // fringe over the forehead
      for (let i = -2; i <= 2; i++) {
        const xx = i * rx * .32, yy = cy + ry * (.24 + Math.abs(i) * .06), zz = hz + rz * Math.sqrt(1 - (xx / (rx + g)) ** 2) + .06;
        b.tri([xx - rx * .22, cy + ry * .58, zz - .13], [xx + rx * .22, cy + ry * .58, zz - .13], [xx + rx * .12, yy, zz], i % 2 ? c2 : col, [0, 0, 1]);
      }
    }
  }
  const drape = (yLow: number, zBack: number, widen: number, taper = 0.85): void => {
    const high = cy + .65 * ry;
    ellipsoid(b, 0, (high + yLow) / 2, hz - rz * .12, (rx + g + widen) * (1 + taper) / 2, (high - yLow) / 2, rz + g + zBack * .55, col, { seg: 12, rings: 8, segFrom: 3, segTo: 9, phase: 0, smooth: true });
  };
  switch (style) {
    case 'short':
      drape(cy - 0.2 * ry, 0.15, 0.0);
      break;
    case 'thin':
      drape(cy - 0.15 * ry, 0.1, 0.0, 1);
      break;
    case 'bob':
      drape(cy - 0.62 * ry, 0.35, 0.18);
      for (const sd of [-1, 1]) ellipsoid(b, sd * (rx + .02), cy - .1 * ry, hz, .3, .7 * ry, .55, col, { seg: 6, rings: 6, smooth: true });
      break;
    case 'long':
      drape(shoulderY - 2.4, 0.6, 0.2);
      for (const sd of [-1, 1]) ellipsoid(b, sd * (rx + .03), (cy + .3 * ry + shoulderY - 1.8) / 2, hz, .3, (cy + .3 * ry - shoulderY + 1.8) / 2, .55, col, { seg: 6, rings: 6, smooth: true });
      break;
    case 'pony':
      drape(cy - 0.25 * ry, 0.2, 0.0);
      prism(b, [0, cy + 0.1 * ry, hz - rz - 0.2], [0, cy - 1.0 * ry, hz - rz - 1.9], 0.8, 0.45, 6, col);
      prism(b, [0, cy + 0.14 * ry, hz - rz - 0.1], [0, cy + 0.0 * ry, hz - rz - 0.35], 0.62, 0.6, 6, [0.85, 0.3, 0.35]);
      break;
    case 'bun':
      drape(cy - 0.3 * ry, 0.2, 0.0);
      ellipsoid(b, 0, cy + 0.85 * ry, hz - rz * 0.55, 0.95, 0.8, 0.95, col, { seg: 6, rings: 3, jitter: 0.05 });
      break;
    case 'perm':
      drape(cy - 0.45 * ry, 0.4, 0.25, 0.9);
      for (const sd of [-1, 1]) ellipsoid(b, sd * (rx + .05), cy, hz, .4, .6 * ry, .8, col, { seg: 8, rings: 6, smooth: true });
      for (let i = -1; i <= 1; i++) ellipsoid(b, i * rx * .6, cy + ry * .9, hz - .1, rx * .55, .55, rz * .8, i === 0 ? c2 : col, { seg: 8, rings: 6, smooth: true });
      break;
    default:
      break;
  }
}

/** Shared original facial geometry for residents and the public player. */
export function buildPortrait(b: MeshBatch, frame: HeadFrame, skin: RGB, hair: Outfit['hair'], shoulderY: number, hat = false): void {
  buildHead(b, frame, skin);
  buildHair(b, frame, hair.style, hair.color, hat, shoulderY);
}

function buildHat(b: MeshBatch, h: HeadFrame, hat: NonNullable<Outfit['hat']>): void {
  const { cy, hz, rx, ry, rz } = h;
  const col = hat.color;
  const light = shadeRGB(col, 1.12);
  switch (hat.kind) {
    case 'yellow': {
      // a school hat: dome with a brim all round
      const y0 = cy + 0.4 * ry;
      octBand(b, { y: y0, a: rx + 0.3, c: rz + 0.3, k: 0.45 * rx, cz: hz }, { y: cy + 0.82 * ry, a: 0.95 * rx + 0.22, c: 0.95 * rz + 0.22, k: 0.5 * rx, cz: hz }, col);
      octBand(b, { y: cy + 0.82 * ry, a: 0.95 * rx + 0.22, c: 0.95 * rz + 0.22, k: 0.5 * rx, cz: hz }, { y: cy + ry + 0.35, a: 0.7 * rx, c: 0.7 * rz, k: 0.45 * rx, cz: hz }, light, { top: light });
      taperBox(b, y0 - 0.05, y0 + 0.14, { x0: -(rx + 1.0), x1: rx + 1.0, z0: hz - rz - 1.0, z1: hz + rz + 1.15 }, { x0: -(rx + 0.9), x1: rx + 0.9, z0: hz - rz - 0.9, z1: hz + rz + 1.05 }, shadeRGB(col, 0.92), { top: col });
      break;
    }
    case 'flat': {
      const y0 = cy + 0.38 * ry;
      octBand(b, { y: y0, a: rx + 0.3, c: rz + 0.3, k: 0.5 * rx, cz: hz }, { y: cy + 0.78 * ry, a: rx + 0.35, c: rz + 0.35, k: 0.55 * rx, cz: hz + 0.1 }, col);
      octBand(b, { y: cy + 0.78 * ry, a: rx + 0.35, c: rz + 0.35, k: 0.55 * rx, cz: hz + 0.1 }, { y: cy + 0.98 * ry, a: 0.8 * rx, c: 0.8 * rz, k: 0.5 * rx, cz: hz + 0.2 }, light, { top: light });
      taperBox(b, y0 - 0.05, y0 + 0.2, { x0: -rx * 0.8, x1: rx * 0.8, z0: hz + rz + 0.2, z1: hz + rz + 1.5 }, { x0: -rx * 0.8, x1: rx * 0.8, z0: hz + rz + 0.2, z1: hz + rz + 1.25 }, shadeRGB(col, 0.7));
      break;
    }
    case 'peaked': {
      // station staff cap: tall crown with a band and a peak
      const y0 = cy + 0.4 * ry;
      octBand(b, { y: y0, a: rx + 0.32, c: rz + 0.32, k: 0.5 * rx, cz: hz }, { y: y0 + 0.7, a: rx + 0.32, c: rz + 0.32, k: 0.5 * rx, cz: hz }, hat.band ?? WHITE);
      octBand(b, { y: y0 + 0.7, a: rx + 0.32, c: rz + 0.32, k: 0.5 * rx, cz: hz }, { y: y0 + 1.5, a: rx + 0.42, c: rz + 0.42, k: 0.55 * rx, cz: hz }, col, { top: light });
      taperBox(b, y0 - 0.02, y0 + 0.2, { x0: -rx * 0.85, x1: rx * 0.85, z0: hz + rz + 0.25, z1: hz + rz + 1.6 }, { x0: -rx * 0.85, x1: rx * 0.85, z0: hz + rz + 0.25, z1: hz + rz + 1.35 }, [0.06, 0.06, 0.08]);
      plate(b, [0, y0 + 0.5, hz + rz + 0.36], [0.28, 0, 0], [0, 0.22, 0], [0.95, 0.8, 0.25], [0, 0, 1]);
      break;
    }
    case 'kerchief': {
      const y0 = cy + 0.36 * ry;
      octBand(b, { y: y0, a: rx + 0.25, c: rz + 0.25, k: 0.5 * rx, cz: hz }, { y: cy + 0.8 * ry, a: 0.95 * rx + 0.2, c: 0.95 * rz + 0.2, k: 0.55 * rx, cz: hz }, col);
      octBand(b, { y: cy + 0.8 * ry, a: 0.95 * rx + 0.2, c: 0.95 * rz + 0.2, k: 0.55 * rx, cz: hz }, { y: cy + ry + 0.3, a: 0.6 * rx, c: 0.6 * rz, k: 0.4 * rx, cz: hz }, light, { top: light });
      if (hat.band) taperBox(b, y0, y0 + 0.5, { x0: -rx - 0.3, x1: rx + 0.3, z0: hz - rz - 0.3, z1: hz + rz + 0.3 }, { x0: -rx - 0.3, x1: rx + 0.3, z0: hz - rz - 0.3, z1: hz + rz + 0.3 }, hat.band);
      boxC(b, 0, y0 + 0.3, hz - rz - 0.5, 0.7, 0.5, 0.45, light);
      break;
    }
  }
}

type Hold = { kind: BagKind | 'cane'; color: RGB };

/** One arm hanging from its shoulder joint at `o`, pointing down -Y. */
function buildArm(b: MeshBatch, o: V3, d: Dims, top: Outfit['top'], skin: RGB, glove: RGB | undefined, hold?: Hold): void {
  const L = d.armLen;
  const r = d.armR;
  const sleeve = top.color;
  const short = top.sleeves === 'short';
  const wristY = -(L - 1.1);
  const x = o[0];
  const y = o[1];
  const z = o[2];
  const sd = Math.sign(x) || 1;
  const sec = (yy: number, a: number): Oct => ({ y: y + yy, a, c: a * 0.95, k: a * 0.32, cx: x, cz: z });
  if (short) {
    const mid = -L * 0.38;
    octBand(b, sec(0.6, r * 1.1), sec(mid, r * 0.9), sleeve, { top: sleeve });
    octBand(b, sec(mid, r * 0.82), sec(wristY, r * 0.62), skin);
  } else {
    octBand(b, sec(0.6, r * 1.1), sec(wristY, r * 0.7), sleeve, { top: sleeve });
    if (top.trim) octBand(b, sec(wristY + 0.55, r * 0.74), sec(wristY, r * 0.74), top.trim);
  }
  const hc = glove ?? skin;
  taperBox(b, y - L, y + wristY + 0.05, { x0: x - r * 0.6, x1: x + r * 0.6, z0: z - r * 0.45, z1: z + r * 0.75 }, { x0: x - r * 0.62, x1: x + r * 0.62, z0: z - r * 0.5, z1: z + r * 0.6 }, hc);
  if (!hold) return;
  const hy = y - L + 0.3;
  switch (hold.kind) {
    case 'brief':
      boxC(b, x + sd * 0.1, hy - 1.85, z, 0.5, 1.85, 2.7, hold.color, { top: shadeRGB(hold.color, 1.2) });
      boxC(b, x + sd * 0.1, hy + 0.15, z, 0.15, 0.2, 0.95, shadeRGB(hold.color, 0.6));
      break;
    case 'tote':
      boxC(b, x + sd * 0.1, hy - 1.7, z + 0.1, 0.85, 1.7, 1.9, hold.color, { top: shadeRGB(hold.color, 1.15) });
      taperBox(b, hy - 0.2, hy + 0.5, { x0: x - 0.15, x1: x + 0.15, z0: z - 1.1, z1: z + 1.3 }, { x0: x - 0.15, x1: x + 0.15, z0: z - 0.3, z1: z + 0.5 }, shadeRGB(hold.color, 0.7));
      break;
    case 'shop':
      boxC(b, x + sd * 0.2, hy - 1.6, z + 0.1, 0.7, 1.6, 1.15, hold.color, { top: shadeRGB(hold.color, 1.1) });
      boxC(b, x + sd * 0.2, hy + 0.1, z + 0.1, 0.5, 0.3, 0.4, shadeRGB(hold.color, 0.85));
      break;
    case 'cane': {
      // a stick planted ahead of the foot (its tip reaches the floor: the shoulder joint is that high), with a bent handle
      const tipY = y - (d.legLen + d.torsoLen - SHOULDER_DROP);
      prism(b, [x, y - L + 0.7, z + 0.15], [x, tipY, z + 1.3], 0.2, 0.17, 5, hold.color);
      prism(b, [x - 0.05, y - L + 0.75, z - 0.35], [x - 0.05, y - L + 0.75, z + 0.35], 0.22, 0.22, 5, hold.color);
      break;
    }
    default:
      break;
  }
}

function buildLeg(b: MeshBatch, d: Dims, o: Outfit): void {
  const L = d.legLen;
  const r = d.legR;
  const bottom = o.bottom;
  const skin = o.skin;
  const pants = bottom.kind === 'trousers' || bottom.kind === 'tight';
  const kneeY = -L * 0.5;
  const ankleY = -(L - SHOE_H);
  const sec = (y: number, a: number): Oct => ({ y, a, c: a * 0.96, k: a * 0.3 });
  if (bottom.kind === 'shorts') {
    const shortsEnd = -L * 0.34;
    octBand(b, sec(0.6, r * 1.05), sec(shortsEnd, r * 0.95), bottom.color, { top: bottom.color });
    octBand(b, sec(shortsEnd, r * 0.92), sec(kneeY, r * 0.84), skin);
  } else {
    octBand(b, sec(0.6, r * 1.05), sec(kneeY, r * 0.85), pants ? bottom.color : skin, { top: pants ? bottom.color : skin });
  }
  const lower = o.sock ?? (pants ? bottom.color : skin);
  octBand(b, sec(kneeY, r * 0.85), sec(ankleY, r * 0.6), lower);
  // shoe: toe forward (+z)
  taperBox(b, -L, ankleY + 0.1, { x0: -r * 0.78, x1: r * 0.78, z0: -1.15, z1: 2.9 }, { x0: -r * 0.66, x1: r * 0.66, z0: -1.0, z1: 2.0 }, o.shoes);
  taperBox(b, -L, -L + 0.18, { x0: -r * 0.8, x1: r * 0.8, z0: -1.2, z1: 2.95 }, { x0: -r * 0.8, x1: r * 0.8, z0: -1.2, z1: 2.95 }, shadeRGB(o.shoes, 0.55));
}

interface BodyInfo {
  shoulderY: number;
  lean(y: number): number;
  head: HeadFrame;
  /** front surface z of the torso at height y */
  front(y: number): number;
}

/** Torso, neck, head, hair, hat and the clothes details; `hipY` is the hip joint height (seat-relative when seated). */
function buildTorso(b: MeshBatch, d: Dims, o: Outfit, hipY: number, seated: boolean): BodyInfo {
  const shoulderY = hipY + d.torsoLen;
  const stoop = o.stoop ?? 0;
  const lean = (y: number): number => stoop * Math.pow(Math.max(0, (y - hipY) / d.torsoLen), 1.4) * 2.0;
  const top = o.top;
  const bottom = o.bottom;
  const dep = d.depth;
  const long = top.length !== 'short';
  const lowerCol = long || bottom.kind === 'skirt' || bottom.kind === 'longskirt' || bottom.kind === 'tight' ? top.color : bottom.color;
  const sec = (y: number, a: number, c: number, k: number): Oct => ({ y, a, c, k, cz: lean(y) });
  const s0 = sec(hipY - 1.0, d.hipHalf, dep * 0.95, 0.8);
  const s1 = sec(hipY + 0.28 * d.torsoLen, d.waistHalf, dep * 0.88, 0.7);
  const s2 = sec(hipY + 0.75 * d.torsoLen, d.chestHalf, dep, 0.9);
  const s3 = sec(shoulderY, d.shoulderHalf, dep * 0.82, 1.1);
  const s4 = sec(shoulderY + 0.5, 1.5, 1.1, 0.6);
  octBand(b, s0, s1, lowerCol, { bottom: lowerCol });
  octBand(b, s1, s2, top.color);
  octBand(b, s2, s3, top.color);
  octBand(b, s3, s4, top.color, { top: top.color });
  const neckTop = shoulderY + d.neckLen;
  octBand(b, { y: shoulderY + 0.3, a: d.neckR, c: d.neckR, k: d.neckR * 0.35, cz: lean(shoulderY) }, { y: neckTop + 0.15, a: d.neckR * 0.95, c: d.neckR * 0.95, k: d.neckR * 0.35, cz: lean(shoulderY) + 0.3 }, shadeRGB(o.skin, 0.92));
  const head: HeadFrame = { cy: neckTop + d.headRy * 0.8, hz: lean(shoulderY) + 0.35 + stoop * 0.6, rx: d.headRx, ry: d.headRy, rz: d.headRz };
  buildPortrait(b, head, o.skin, o.hair, shoulderY, o.hat !== undefined);
  if (o.hat) buildHat(b, head, o.hat);

  const secs = [s1, s2, s3];
  const front = (y: number): number => {
    for (let i = 0; i + 1 < secs.length; i++) {
      const a = secs[i]!;
      const bb = secs[i + 1]!;
      if (y >= a.y && y <= bb.y) {
        const t = (y - a.y) / (bb.y - a.y);
        return a.cz! + a.c + (bb.c - a.c) * t;
      }
    }
    return s3.cz! + s3.c;
  };
  if (top.shirt) {
    const y1 = shoulderY + 0.35;
    const y0 = shoulderY - 3.1;
    const z1 = front(shoulderY) + 0.04;
    const z0 = front(y0) + 0.04;
    b.tri([-1.0, y1, z1], [1.0, y1, z1], [0, y0, z0], top.shirt, [0, 0.2, 1]);
    if (top.tie) plate(b, [0, (y1 + y0) / 2 - 0.4, (z1 + z0) / 2 + 0.03], [0.3, 0, 0], [0, (y1 - y0) / 2 + 0.2, 0.04], top.tie, [0, 0, 1]);
    if (top.ribbon) boxC(b, 0, shoulderY - 0.8, front(shoulderY - 0.8) + 0.2, 0.75, 0.42, 0.22, top.ribbon);
  }
  if (top.collar && !top.sailor) {
    octBand(b, sec(shoulderY - 0.4, d.shoulderHalf * 0.5, dep * 0.7, 0.5), sec(shoulderY + 0.55, 1.65, 1.25, 0.6), top.collar);
  }
  if (top.sailor && top.collar) {
    // sailor collar: a wide flap over the shoulders and down the back, with a scarf at the front
    taperBox(b, shoulderY - 2.4, shoulderY + 0.35, { x0: -d.shoulderHalf * 0.82, x1: d.shoulderHalf * 0.82, z0: -dep * 0.85 - 0.14, z1: -dep * 0.8 + 0.02 }, { x0: -d.shoulderHalf * 0.9, x1: d.shoulderHalf * 0.9, z0: -dep * 0.8 - 0.14, z1: -dep * 0.78 + 0.02 }, top.collar);
    octBand(b, sec(shoulderY - 0.7, d.shoulderHalf + 0.12, dep * 0.82 + 0.1, 1.1), sec(shoulderY + 0.38, 1.9, 1.3, 0.7), top.collar);
    if (top.ribbon) boxC(b, 0, shoulderY - 1.2, front(shoulderY - 1.2) + 0.25, 0.9, 0.55, 0.24, top.ribbon);
  }
  if (seated) return { shoulderY, lean, head, front };

  if (o.apron) {
    const az = front(hipY + 0.5);
    taperBox(b, hipY - 4.8, hipY + 1.4, { x0: -d.waistHalf * 0.95, x1: d.waistHalf * 0.95, z0: az - 0.1, z1: az + 0.3 }, { x0: -d.waistHalf * 0.95, x1: d.waistHalf * 0.95, z0: az - 0.1, z1: az + 0.25 }, o.apron);
    plate(b, [0, hipY + 1.4, az + 0.12], [d.waistHalf * 0.7, 0, 0], [0, 0.18, 0], shadeRGB(o.apron, 1.4), [0, 0, 1]);
  }
  const skirtTop = hipY + 0.55;
  if (bottom.kind === 'skirt' || bottom.kind === 'longskirt' || top.length === 'smock') {
    const hem = top.length === 'smock' ? hipY * 0.38 : bottom.kind === 'longskirt' ? hipY * 0.3 : hipY * 0.52;
    const col = top.length === 'smock' ? top.color : bottom.color;
    const flare = bottom.kind === 'longskirt' || top.length === 'smock' ? 1.0 : 1.15;
    octBand(b, { y: skirtTop, a: d.hipHalf + 0.15, c: dep + 0.1, k: 0.9 }, { y: hem, a: d.hipHalf + 0.15 + flare, c: dep + 0.1 + flare * 0.9, k: 1.3 }, col);
    if (bottom.pleats && top.length !== 'smock') {
      for (let i = -2; i <= 2; i++) plate(b, [i * 0.9, (skirtTop + hem) / 2, dep + 0.1 + 0.5 * flare + 0.06], [0.07, 0, 0], [0, (skirtTop - hem) / 2, 0], bottom.pleats, [0, 0.1, 1]);
    }
  } else if (bottom.kind === 'tight') {
    octBand(b, { y: hipY + 0.55, a: d.hipHalf + 0.12, c: dep + 0.1, k: 0.9 }, { y: hipY * 0.62, a: d.hipHalf, c: dep, k: 0.9 }, bottom.color);
  }
  if (o.bag) {
    const bg = o.bag;
    const bz = -dep - 0.1;
    switch (bg.kind) {
      case 'randoseru':
        taperBox(b, shoulderY - 5.6, shoulderY - 0.3, { x0: -2.0, x1: 2.0, z0: bz - 2.9, z1: bz }, { x0: -1.9, x1: 1.9, z0: bz - 2.7, z1: bz }, bg.color, { top: shadeRGB(bg.color, 1.15) });
        taperBox(b, shoulderY - 4.9, shoulderY - 0.5, { x0: -1.8, x1: 1.8, z0: bz - 3.0, z1: bz - 2.8 }, { x0: -1.8, x1: 1.8, z0: bz - 3.0, z1: bz - 2.8 }, bg.flap ?? shadeRGB(bg.color, 1.3));
        for (const sd of [-1, 1]) plate(b, [sd * 1.5, shoulderY - 1.8, front(shoulderY - 1.8) + 0.03], [0.22, 0, 0], [0, 2.1, 0], shadeRGB(bg.color, 0.8), [0, 0, 1]);
        break;
      case 'backpack':
        taperBox(b, shoulderY - 5.0, shoulderY - 0.5, { x0: -1.8, x1: 1.8, z0: bz - 2.1, z1: bz }, { x0: -1.6, x1: 1.6, z0: bz - 1.8, z1: bz }, bg.color, { top: shadeRGB(bg.color, 1.15) });
        boxC(b, 0, shoulderY - 4.0, bz - 2.2, 1.2, 0.8, 0.25, shadeRGB(bg.color, 0.8));
        break;
      case 'shoulder':
        boxC(b, -(d.hipHalf + 1.2), hipY - 0.2, -0.2, 0.55, 1.45, 2.0, bg.color, { top: shadeRGB(bg.color, 1.2) });
        b.quad([1.6, shoulderY + 0.1, front(shoulderY) + 0.05], [2.3, shoulderY - 0.1, front(shoulderY) + 0.05], [-d.hipHalf - 0.7, hipY + 0.4, front(hipY + 0.5) + 0.05], [-d.hipHalf - 1.3, hipY + 0.5, front(hipY + 0.5) + 0.05], shadeRGB(bg.color, 0.75), [0, 0.1, 1]);
        break;
      default:
        break;
    }
  }
  return { shoulderY, lean, head, front };
}

function holdOf(o: Outfit): Hold | undefined {
  if (o.cane) return { kind: 'cane', color: [0.45, 0.32, 0.2] };
  if (o.bag && (o.bag.kind === 'brief' || o.bag.kind === 'tote' || o.bag.kind === 'shop')) return { kind: o.bag.kind, color: o.bag.color };
  return undefined;
}

/** Walking person: body, leg and arm templates (the arm with an item in the right hand if any). */
export function buildPerson(o: Outfit): PersonParts {
  const d = DIMS[o.build];
  const hipY = d.legLen;
  const body = new MeshBatch();
  const info = buildTorso(body, d, o, hipY, false);
  const shoulderX = d.shoulderHalf + 0.15;
  const jointY = info.shoulderY - SHOULDER_DROP;
  const leg = new MeshBatch();
  buildLeg(leg, d, o);
  const arm = new MeshBatch();
  buildArm(arm, [0, 0, 0], d, o.top, o.skin, o.gloves);
  const hold = holdOf(o);
  let armHold: MeshBatch | undefined;
  if (hold) {
    armHold = new MeshBatch();
    buildArm(armHold, [0, 0, 0], d, o.top, o.skin, o.gloves, hold);
  }
  if (o.staticArms) {
    for (const sd of [-1, 1]) buildArm(body, [sd * shoulderX, jointY, 0.1], d, o.top, o.skin, o.gloves, sd > 0 ? hold : undefined);
  }
  return { dims: d, body, leg, arm, armHold, hipY, shoulderX, shoulderY: jointY };
}

/** A standing person as ONE mesh (body, legs and arms in the rest pose): for staff who never walk. */
export function buildFused(o: Outfit): MeshBatch {
  const p = buildPerson({ ...o, staticArms: false });
  const b = new MeshBatch();
  mergeInto(b, p.body, 0, 0, 0);
  for (const sd of [-1, 1]) {
    mergeInto(b, p.leg, sd * p.dims.hipX, p.hipY, 0);
    mergeInto(b, sd > 0 && p.armHold ? p.armHold : p.arm, sd * p.shoulderX, p.shoulderY, 0.1);
  }
  return b;
}

/**
 * A person sitting on a bench: one static mesh, origin at the middle of the seat surface (y = seat top), facing +Z.
 * `seatH` is the height of the seat above the ground, so that the feet reach the floor.
 */
export function buildSeated(o: Outfit, seatH: number): MeshBatch {
  const d = DIMS[o.build];
  const b = new MeshBatch();
  const hipY = 1.25;
  const info = buildTorso(b, d, o, hipY, true);
  const bottom = o.bottom;
  const dep = d.depth;
  const thigh = d.legLen * 0.56;
  if (bottom.kind === 'skirt' || bottom.kind === 'longskirt') {
    taperBox(b, hipY - 0.6, hipY + 1.9, { x0: -d.hipHalf - 0.5, x1: d.hipHalf + 0.5, z0: -dep, z1: thigh + 0.8 }, { x0: -d.hipHalf - 0.3, x1: d.hipHalf + 0.3, z0: -dep, z1: thigh + 0.3 }, bottom.color, { top: bottom.color });
  }
  const pants = bottom.kind === 'trousers' || bottom.kind === 'tight';
  const legCol = pants ? bottom.color : o.skin;
  const lowLeg = o.sock ?? legCol;
  const ankleY = -seatH + SHOE_H + 0.1;
  for (const sd of [-1, 1]) {
    const x = sd * d.hipX;
    prism(b, [x, hipY + 0.25, -0.2], [x, hipY + 0.05, thigh], d.legR * 1.02, d.legR * 0.82, 8, legCol);
    prism(b, [x, hipY + 0.05, thigh], [x, ankleY, thigh + 0.5], d.legR * 0.8, d.legR * 0.6, 8, lowLeg);
    taperBox(b, -seatH, ankleY + 0.1, { x0: x - d.legR * 0.78, x1: x + d.legR * 0.78, z0: thigh - 0.7, z1: thigh + 3.5 }, { x0: x - d.legR * 0.66, x1: x + d.legR * 0.66, z0: thigh - 0.6, z1: thigh + 2.6 }, o.shoes);
  }
  // arms: upper arm down, forearm resting on the thighs
  for (const sd of [-1, 1]) {
    const sx = sd * (d.shoulderHalf + 0.15);
    const sy = info.shoulderY - SHOULDER_DROP;
    const elbowY = hipY + 1.9;
    prism(b, [sx, sy, info.lean(sy)], [sx * 1.02, elbowY, info.lean(sy) + 0.5], d.armR, d.armR * 0.85, 6, o.top.color);
    prism(b, [sx * 1.02, elbowY, info.lean(sy) + 0.5], [sd * 1.2, hipY + 1.6, thigh * 0.62], d.armR * 0.85, d.armR * 0.62, 6, o.top.sleeves === 'short' ? o.skin : o.top.color);
    boxC(b, sd * 1.15, hipY + 1.6, thigh * 0.66, 0.5, 0.35, 0.65, o.skin);
  }
  if (o.bag && (o.bag.kind === 'tote' || o.bag.kind === 'shop' || o.bag.kind === 'brief')) {
    boxC(b, d.hipHalf + 1.8, hipY + 0.8, thigh * 0.4, 0.8, 1.2, 1.7, o.bag.color, { top: shadeRGB(o.bag.color, 1.15) });
  }
  if (o.cane) prism(b, [d.hipHalf + 1.3, hipY + 0.5, thigh * 0.9], [d.hipHalf + 1.4, -seatH + 0.2, thigh * 1.1 + 1.2], 0.2, 0.17, 5, [0.45, 0.32, 0.2]);
  return b;
}
